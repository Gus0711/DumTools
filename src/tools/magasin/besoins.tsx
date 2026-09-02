"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ChevronRight,
  Download,
  RotateCcw,
  Search,
  TriangleAlert,
  Truck,
} from "lucide-react";
import { Badge, Button, Chiffre, EtatVide, RangeeChiffres } from "@/ui";
import { cn } from "@/lib/cn";
import { useReprendreFiltres, useSyncUrl } from "@/lib/filtres-url";
import { ETATS_AFFAIRE, ETATS_VUE_DEFAUT } from "@/lib/chantiers/etats";
import { ETAT_TONE } from "@/lib/chantiers/etat-badge";
import type { EtatAffaire } from "@/generated/prisma/enums";
import { construireCsv, telechargerCsv } from "./modele-import";
import {
  formatEuros,
  totaliser,
  GENRE_TROU_LABEL,
  type AffaireBesoin,
  type LigneConsolidee,
  type TrouConsolide,
} from "./model";

/* =============================================================================
 * LE BESOIN CONSOLIDÉ — L'ÉCRAN
 *
 * On prépare une commande, pas une affaire. Le geste est donc « je choisis un
 * paquet d'affaires, je vois ce qu'il faut acheter » — et le paquet se décrit
 * presque toujours d'une phrase : « l'USEDA, ce qui est commandé ». D'où deux
 * étages qui se complètent :
 *   1. les FILTRES (client, état, recherche) dessinent le paquet ;
 *   2. les CASES décochent l'exception — l'affaire qu'on ne commande pas encore.
 * Décocher n'est PAS un filtre : l'exclusion survit à un changement de filtre,
 * sinon la seule affaire qu'on avait sciemment écartée reviendrait en douce.
 *
 * Tout est recalculé dans le navigateur (`totaliser`, model.ts) : le serveur a
 * envoyé les contributions affaire par affaire une fois pour toutes. Cocher une
 * case doit se voir tout de suite — un aller-retour par clic tuerait le geste.
 *
 * ⚠️ Le regroupement par FOURNISSEUR est le défaut, et ce n'est pas un détail
 * d'affichage : on ne passe pas une commande « toutes catégories confondues »,
 * on la passe chez quelqu'un. La catégorie reste offerte pour relire le besoin
 * en technicien plutôt qu'en acheteur.
 * ========================================================================== */

type Regroupement = "fournisseur" | "categorie";

export function BesoinsConsolides({
  affaires,
  lignes,
  trous,
  peutPrix,
}: {
  affaires: AffaireBesoin[];
  lignes: LigneConsolidee[];
  trous: TrouConsolide[];
  peutPrix: boolean;
}) {
  const params = useSearchParams();
  const [query, setQuery] = useState(() => params.get("q") ?? "");
  const [client, setClient] = useState(() => params.get("client") ?? "");
  const [etats, setEtats] = useState<Set<EtatAffaire>>(() => {
    const brut = params.get("etats");
    if (brut === "aucun") return new Set();
    if (brut) return new Set(brut.split(",") as EtatAffaire[]);
    return new Set(ETATS_VUE_DEFAUT);
  });
  const [groupe, setGroupe] = useState<Regroupement>(
    () => (params.get("groupe") === "categorie" ? "categorie" : "fournisseur"),
  );
  const [exclues, setExclues] = useState<Set<string>>(new Set());
  const [deplie, setDeplie] = useState<string | null>(null);
  const [voirAffaires, setVoirAffaires] = useState(false);

  useReprendreFiltres("magasin-besoins", ["q", "client", "etats", "groupe"], (v) => {
    setQuery(v("q") ?? "");
    setClient(v("client") ?? "");
    setGroupe(v("groupe") === "categorie" ? "categorie" : "fournisseur");
    const e = v("etats");
    if (e === "aucun") setEtats(new Set());
    else if (e) setEtats(new Set(e.split(",") as EtatAffaire[]));
  });

  const etatsParDefaut =
    etats.size === ETATS_VUE_DEFAUT.length && ETATS_VUE_DEFAUT.every((e) => etats.has(e));

  useSyncUrl(
    {
      q: query,
      client,
      etats: etatsParDefaut ? "" : [...etats].join(",") || "aucun",
      groupe: groupe === "fournisseur" ? "" : groupe,
    },
    "magasin-besoins",
  );

  /* --- Le paquet d'affaires ---------------------------------------------- */

  const clients = useMemo(() => {
    const m = new Map<string, { nom: string; n: number }>();
    for (const a of affaires) {
      const c = m.get(a.clientId) ?? { nom: a.clientNom, n: 0 };
      c.n += 1;
      m.set(a.clientId, c);
    }
    return [...m].sort((a, b) => a[1].nom.localeCompare(b[1].nom));
  }, [affaires]);

  const parEtat = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of affaires) m.set(a.etat, (m.get(a.etat) ?? 0) + 1);
    return m;
  }, [affaires]);

  const filtrees = useMemo(() => {
    const f = query.trim().toLowerCase();
    return affaires.filter((a) => {
      if (client && a.clientId !== client) return false;
      if (!etats.has(a.etat as EtatAffaire)) return false;
      if (!f) return true;
      return (
        a.nom.toLowerCase().includes(f) ||
        a.clientNom.toLowerCase().includes(f) ||
        (a.numeroWhy ?? "").toLowerCase().includes(f)
      );
    });
  }, [affaires, client, etats, query]);

  const retenues = useMemo(
    () => new Set(filtrees.filter((a) => !exclues.has(a.id)).map((a) => a.id)),
    [filtrees, exclues],
  );

  /* --- Le besoin, pour CE paquet ------------------------------------------ */

  const calculees = useMemo(
    () =>
      lignes
        .map((l) => ({ ligne: l, total: totaliser(l, retenues) }))
        .filter((x) => x.total.besoin > 0 || x.total.nbHorsFourniture > 0),
    [lignes, retenues],
  );

  const aCommander = calculees.filter((x) => x.total.aCommander > 0);
  const totalACommander = aCommander.reduce((s, x) => s + x.total.aCommander, 0);
  const nbHorsFourniture = calculees.reduce((s, x) => s + x.total.nbHorsFourniture, 0);
  // Le coût ne porte que sur CE QU'ON ACHÈTE, et il est incomplet dès qu'une
  // référence n'a pas de prix : on affiche le nombre plutôt que de laisser
  // croire au total. Compter un prix inconnu pour zéro serait un mensonge muet.
  const coutCents = aCommander.reduce(
    (s, x) => s + (x.ligne.prixCents ?? 0) * x.total.aCommander,
    0,
  );
  const nbSansPrix = aCommander.filter((x) => x.ligne.prixCents === null).length;

  const trousRetenus = useMemo(
    () =>
      trous
        .map((t) => ({
          trou: t,
          occurrences: t.parAffaire
            .filter((p) => retenues.has(p.chantierId))
            .reduce((s, p) => s + p.occurrences, 0),
          affaires: t.parAffaire.filter((p) => retenues.has(p.chantierId)).length,
        }))
        .filter((t) => t.occurrences > 0)
        .sort((a, b) => b.occurrences - a.occurrences),
    [trous, retenues],
  );

  /* --- Les paquets d'achat ------------------------------------------------ */

  const groupes = useMemo(() => {
    const m = new Map<string, { cle: string; titre: string; range: boolean; lignes: typeof calculees }>();
    for (const x of calculees) {
      const titre =
        groupe === "fournisseur"
          ? (x.ligne.fournisseurNom ?? "Sans fournisseur")
          : (x.ligne.categorieNom ?? "Sans catégorie");
      const range =
        groupe === "fournisseur" ? x.ligne.fournisseurNom !== null : x.ligne.categorieNom !== null;
      const g = m.get(titre) ?? { cle: titre, titre, range, lignes: [] };
      g.lignes.push(x);
      m.set(titre, g);
    }
    // Ce qui n'est rangé nulle part passe en dernier : c'est un référentiel à
    // compléter, pas une priorité de lecture (même règle que le rayon).
    return [...m.values()].sort(
      (a, b) => Number(!a.range) - Number(!b.range) || a.titre.localeCompare(b.titre),
    );
  }, [calculees, groupe]);

  const filtreActif =
    query.trim() !== "" || client !== "" || !etatsParDefaut || exclues.size > 0;

  function reinitialiser() {
    setQuery("");
    setClient("");
    setEtats(new Set(ETATS_VUE_DEFAUT));
    setExclues(new Set());
  }

  function basculerEtat(e: EtatAffaire) {
    setEtats((s) => {
      const n = new Set(s);
      if (n.has(e)) n.delete(e);
      else n.add(e);
      return n;
    });
  }

  function exporter() {
    const nomClient = client ? clients.find(([id]) => id === client)?.[1].nom : null;
    const entetes = [
      groupe === "fournisseur" ? "Fournisseur" : "Catégorie",
      "Réf. interne",
      "Réf. fournisseur",
      "Désignation",
      "Unité",
      "Besoin",
      "Stock",
      "Disponible",
      "À commander",
      ...(peutPrix ? ["Prix unitaire €", "Coût €"] : []),
      "Affaires",
    ];
    const corps = groupes.flatMap((g) =>
      g.lignes
        .filter((x) => x.total.aCommander > 0)
        .map((x) => [
          g.titre,
          x.ligne.refInterne,
          x.ligne.refFournisseur ?? "",
          x.ligne.designation,
          x.ligne.unite,
          String(x.total.besoin),
          String(x.ligne.stock),
          String(x.total.dispo),
          String(x.total.aCommander),
          ...(peutPrix
            ? [
                x.ligne.prixCents === null ? "" : (x.ligne.prixCents / 100).toFixed(2),
                x.ligne.prixCents === null
                  ? ""
                  : ((x.ligne.prixCents * x.total.aCommander) / 100).toFixed(2),
              ]
            : []),
          x.ligne.contribs
            .filter((c) => retenues.has(c.chantierId) && !c.horsFourniture && c.besoin > 0)
            .map((c) => {
              const a = affaires.find((z) => z.id === c.chantierId);
              return `${a?.numeroWhy ?? a?.nom ?? "?"} (${c.besoin})`;
            })
            .join(" · "),
        ]),
    );
    const jour = new Date().toISOString().slice(0, 10);
    telechargerCsv(
      `besoin-${(nomClient ?? "toutes-affaires").toLowerCase().replace(/[^a-z0-9]+/gi, "-")}-${jour}.csv`,
      construireCsv(entetes, corps),
    );
  }

  const nbColonnes = peutPrix ? 8 : 6;

  return (
    <>
      <RangeeChiffres className="mb-5">
        <Chiffre
          label="Affaires retenues"
          valeur={retenues.size}
          detail={
            exclues.size > 0
              ? `${filtrees.length} au filtre · ${exclues.size} décochée${exclues.size > 1 ? "s" : ""}`
              : `sur ${affaires.length} candidates`
          }
        />
        <Chiffre
          label="À commander"
          valeur={totalACommander}
          ton={totalACommander > 0 ? "danger" : "success"}
          detail={
            totalACommander > 0
              ? `${aCommander.length} référence${aCommander.length > 1 ? "s" : ""}`
              : "le stock couvre tout"
          }
        />
        <Chiffre
          label="Références appelées"
          valeur={calculees.length}
          detail={
            nbHorsFourniture > 0 ? `${nbHorsFourniture} hors fourniture écartée(s)` : "au besoin"
          }
        />
        {peutPrix && (
          <Chiffre
            label="Coût d'achat"
            valeur={formatEuros(coutCents)}
            ton={nbSansPrix > 0 ? "accent" : undefined}
            detail={
              nbSansPrix > 0
                ? `incomplet — ${nbSansPrix} réf. sans prix`
                : "au prix payé ou annoncé"
            }
          />
        )}
      </RangeeChiffres>

      {/* --- Le paquet d'affaires ------------------------------------------ */}
      <section className="bloc signal-accent mb-5">
        <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-3 py-2">
          <div className="relative min-w-52 max-w-80 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher une affaire…"
              className={cn(
                "h-9 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm text-fg",
                "transition-[border-color,box-shadow] duration-150",
                "placeholder:text-subtle hover:border-brand/40 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20",
              )}
            />
          </div>

          <select
            value={client}
            onChange={(e) => setClient(e.target.value)}
            aria-label="Filtrer par client"
            className={cn(
              "h-9 w-56 shrink-0 cursor-pointer rounded-md border border-border bg-surface px-2 text-sm",
              "transition-[border-color] duration-150 hover:border-brand/40 focus:border-brand focus:outline-none",
              client ? "text-fg" : "text-subtle",
            )}
          >
            <option value="">Client : tous</option>
            {clients.map(([id, c]) => (
              <option key={id} value={id}>
                {c.nom} ({c.n})
              </option>
            ))}
          </select>

          <div className="ml-auto flex min-w-0 items-center gap-1.5 overflow-x-auto sm:flex-wrap sm:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {ETATS_AFFAIRE.filter((e) => parEtat.has(e.value)).map((e) => {
              const actif = etats.has(e.value);
              return (
                <button
                  key={e.value}
                  type="button"
                  onClick={() => basculerEtat(e.value)}
                  aria-pressed={actif}
                  title={e.aide}
                  className={cn(
                    "inline-flex min-h-[2.25rem] shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs font-medium sm:min-h-0 sm:px-2.5 sm:py-1",
                    "transition-[opacity,border-color,background-color] duration-150",
                    ETAT_TONE[e.value],
                    actif
                      ? "border-current opacity-100"
                      : "border-transparent opacity-45 hover:opacity-80",
                  )}
                >
                  {e.label}
                  <span className="font-mono tabular-nums opacity-70">
                    {parEtat.get(e.value) ?? 0}
                  </span>
                </button>
              );
            })}
            {filtreActif && (
              <button
                type="button"
                onClick={reinitialiser}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-muted transition-colors hover:text-fg sm:px-2.5 sm:py-1"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Réinitialiser
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 px-3 py-2">
          <button
            type="button"
            onClick={() => setVoirAffaires((v) => !v)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-fg transition-colors hover:text-brand"
          >
            <ChevronRight
              className={cn("h-4 w-4 transition-transform", voirAffaires && "rotate-90")}
            />
            {retenues.size} affaire{retenues.size > 1 ? "s" : ""} retenue
            {retenues.size > 1 ? "s" : ""}
          </button>
          <p className="min-w-0 flex-1 text-xs text-muted">
            Le besoin ci-dessous est la somme de ces affaires. Décochez celle qu&apos;on ne
            commande pas encore — l&apos;exclusion tient même si vous changez de filtre.
          </p>
        </div>

        {voirAffaires && (
          <div className="grid gap-x-4 gap-y-1 border-t border-hairline px-3 py-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {filtrees.length === 0 && (
              <p className="py-2 text-sm text-subtle">Aucune affaire ne correspond au filtre.</p>
            )}
            {filtrees.map((a) => (
              <label
                key={a.id}
                className="flex cursor-pointer items-center gap-2 py-1 text-sm text-fg"
              >
                <input
                  type="checkbox"
                  checked={!exclues.has(a.id)}
                  onChange={() =>
                    setExclues((s) => {
                      const n = new Set(s);
                      if (n.has(a.id)) n.delete(a.id);
                      else n.add(a.id);
                      return n;
                    })
                  }
                  className="h-4 w-4 shrink-0 accent-[var(--brand)]"
                />
                {a.numeroWhy && <span className="ref shrink-0 text-xs">{a.numeroWhy}</span>}
                <span className="min-w-0 truncate">{a.nom}</span>
              </label>
            ))}
          </div>
        )}
      </section>

      {/* --- Ce qui n'est pas relié à un produit ---------------------------- *
          Un trou ne se voit pas dans le tableau : la ligne n'existe simplement
          pas. Sans cet avertissement, on passerait une commande courte en
          croyant la liste complète — le défaut le plus cher de l'écran. */}
      {trousRetenus.length > 0 && (
        <div className="bloc mb-5 border-warning/50">
          <div className="flex items-start gap-2 px-4 py-3">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="min-w-0 flex-1">
              {/* Phrase construite en UNE chaîne : mélanger texte et expressions sur
                  plusieurs lignes fait avaler un espace ici et en inventer un là
                  (« 3 élémentsde ces affaires n 'ont… »), et ça ne se voit qu'à l'œil. */}
              <p className="text-sm font-semibold text-fg">
                {trousRetenus.length === 1
                  ? "1 élément de ces affaires n'a aucun produit associé"
                  : `${trousRetenus.length} éléments de ces affaires n'ont aucun produit associé`}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Ils <strong>ne sont pas</strong>{" "}
                dans le tableau ci-dessous : la commande serait donc incomplète. On les relie une
                seule fois, depuis le matériel de n&apos;importe quelle affaire concernée — ensuite
                toutes en profitent.
              </p>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg">
                {trousRetenus.slice(0, 10).map((t) => (
                  <li key={`${t.trou.genre}:${t.trou.cle}`} className="flex items-baseline gap-1.5">
                    <span className="text-subtle">{GENRE_TROU_LABEL[t.trou.genre]}</span>
                    <span className="font-medium">{t.trou.nom}</span>
                    <span className="font-mono tabular-nums text-subtle">
                      ×{t.occurrences}
                    </span>
                  </li>
                ))}
                {trousRetenus.length > 10 && (
                  <li className="text-subtle">… et {trousRetenus.length - 10} autres</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* --- Le besoin ------------------------------------------------------ */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <span>Grouper par</span>
          {(["fournisseur", "categorie"] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGroupe(g)}
              aria-pressed={groupe === g}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                groupe === g
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-border text-muted hover:text-fg",
              )}
            >
              {g === "fournisseur" ? "Fournisseur" : "Catégorie"}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <Button
            size="sm"
            variant="ghost"
            onClick={exporter}
            disabled={aCommander.length === 0}
            title="Exporter les lignes à commander (CSV)"
          >
            <Download className="h-4 w-4" /> Exporter
          </Button>
        </div>
      </div>

      {calculees.length === 0 ? (
        <div className="bloc">
          <EtatVide
            dessin="touret"
            titre={
              retenues.size === 0 ? "Aucune affaire retenue" : "Aucun matériel sur cette sélection"
            }
            texte={
              retenues.size === 0
                ? "Élargissez les états ou changez de client : le besoin se calcule sur les affaires cochées."
                : "Ces affaires n'appellent encore aucun produit — soit leur projet GTB est vide, soit rien n'est relié au magasin."
            }
          />
        </div>
      ) : (
        <div className="data-card overflow-x-auto">
          <table className="data-table table-cards">
            <thead>
              <tr>
                <th>Produit</th>
                <th className="text-right">Besoin</th>
                <th className="text-right">Stock</th>
                <th className="text-right">Dispo</th>
                <th className="text-right">À commander</th>
                {peutPrix && <th className="text-right">Prix unitaire</th>}
                {peutPrix && <th className="text-right">Coût</th>}
                <th />
              </tr>
            </thead>
            {groupes.map((g) => (
              <tbody key={g.cle}>
                <tr className="bg-surface-2">
                  <td colSpan={nbColonnes} className="!py-1.5">
                    <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
                      <Truck className="h-3.5 w-3.5" />
                      {g.titre}
                      {!g.range && (
                        <Badge tone="warning">
                          {groupe === "fournisseur" ? "à renseigner" : "à ranger"}
                        </Badge>
                      )}
                      <span className="font-mono normal-case tabular-nums opacity-70">
                        {g.lignes.reduce((s, x) => s + x.total.aCommander, 0)} à commander
                      </span>
                    </span>
                  </td>
                </tr>
                {g.lignes.map((x) => {
                  const l = x.ligne;
                  const t = x.total;
                  const ouvert = deplie === l.produitId;
                  return (
                    <Fragment key={l.produitId}>
                      <tr className={cn(t.besoin === 0 && "opacity-55")}>
                        <td className="cell-title cell-card-title cell-wrap">
                          <Link
                            href={`/outils/magasin/produits/${l.produitId}`}
                            className="group inline-flex items-baseline gap-2 transition-colors hover:text-brand"
                          >
                            <span className="ref shrink-0">{l.refInterne}</span>
                            <span className="min-w-0">{l.designation}</span>
                          </Link>
                          {/* Bon nombre de fiches portent la DÉSIGNATION en guise de
                              référence fournisseur : la répéter sous elle-même n'apprend
                              rien et double la hauteur de chaque ligne. */}
                          {l.refFournisseur &&
                            l.refFournisseur.trim().toLowerCase() !==
                              l.designation.trim().toLowerCase() && (
                              <div className="text-xs text-subtle">
                                réf. fournisseur <span className="ref">{l.refFournisseur}</span>
                              </div>
                            )}
                          {t.nbHorsFourniture > 0 && (
                            <div className="text-xs text-subtle">
                              {t.nbHorsFourniture} affaire{t.nbHorsFourniture > 1 ? "s" : ""} hors
                              fourniture
                            </div>
                          )}
                        </td>
                        <td data-label="Besoin" className="text-right tabular-nums">
                          {/* Un seul nœud : en mode cartes (< 640 px) la cellule écarte
                              ses enfants aux deux bords, et « 6 » se retrouvait à un
                              bout, « U » à l'autre. */}
                          <span className="whitespace-nowrap">
                            {t.besoin} <span className="text-xs text-subtle">{l.unite}</span>
                          </span>
                        </td>
                        <td data-label="Stock" className="text-right tabular-nums">
                          {l.stock}
                        </td>
                        <td data-label="Dispo" className="text-right tabular-nums">
                          {l.reserveTotale > 0 ? (
                            <span title={`${l.reserveTotale} réservé(s) à des affaires`}>
                              {t.dispo}
                            </span>
                          ) : (
                            t.dispo
                          )}
                        </td>
                        <td data-label="À commander" className="text-right tabular-nums">
                          {t.aCommander > 0 ? (
                            <Badge tone="danger" point>
                              {t.aCommander}
                            </Badge>
                          ) : (
                            <span className="text-subtle">—</span>
                          )}
                        </td>
                        {peutPrix && (
                          <td data-label="Prix unitaire" className="text-right tabular-nums">
                            {l.prixCents === null ? (
                              <span className="text-warning" title="Aucun prix connu">
                                inconnu
                              </span>
                            ) : (
                              formatEuros(l.prixCents)
                            )}
                          </td>
                        )}
                        {peutPrix && (
                          <td data-label="Coût" className="text-right tabular-nums">
                            {l.prixCents === null || t.aCommander === 0 ? (
                              <span className="text-subtle">—</span>
                            ) : (
                              formatEuros(l.prixCents * t.aCommander)
                            )}
                          </td>
                        )}
                        <td className="text-right">
                          <button
                            type="button"
                            onClick={() => setDeplie(ouvert ? null : l.produitId)}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted transition-colors hover:text-fg"
                            aria-expanded={ouvert}
                          >
                            <ChevronRight
                              className={cn("h-3.5 w-3.5 transition-transform", ouvert && "rotate-90")}
                            />
                            {t.nbAffaires} affaire{t.nbAffaires > 1 ? "s" : ""}
                          </button>
                        </td>
                      </tr>
                      {ouvert && (
                        <tr>
                          <td colSpan={nbColonnes} className="!py-0">
                            <div className="flex flex-wrap gap-x-5 gap-y-1 border-l-2 border-l-brand bg-surface-2 px-4 py-2.5 text-xs">
                              {l.contribs
                                .filter((c) => retenues.has(c.chantierId))
                                .sort((a, b) => b.besoin - a.besoin)
                                .map((c) => {
                                  const a = affaires.find((z) => z.id === c.chantierId);
                                  return (
                                    <Link
                                      key={c.chantierId}
                                      href={`/outils/magasin/affaires/${c.chantierId}`}
                                      className={cn(
                                        "inline-flex items-baseline gap-1.5 transition-colors hover:text-brand",
                                        c.horsFourniture && "text-subtle line-through",
                                      )}
                                      title={
                                        c.horsFourniture
                                          ? "Hors fourniture sur cette affaire"
                                          : `${c.manquant} encore à couvrir`
                                      }
                                    >
                                      {a?.numeroWhy && <span className="ref">{a.numeroWhy}</span>}
                                      <span>{a?.nom ?? "Affaire inconnue"}</span>
                                      <span className="font-mono font-semibold tabular-nums">
                                        ×{c.besoin}
                                      </span>
                                    </Link>
                                  );
                                })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </>
  );
}
