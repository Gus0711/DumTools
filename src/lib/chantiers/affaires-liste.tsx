"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { iciAvecFiltres, useReprendreFiltres, useSyncUrl } from "@/lib/filtres-url";
import { avecRetour } from "@/lib/retour";
import { Briefcase, RotateCcw, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { Combobox, EnteteBloc, EtatVide, type ComboOption } from "@/ui";
import type { EtatAffaire } from "@/generated/prisma/enums";
import type { AffaireResume } from "./queries";
import { ETATS_AFFAIRE, ETATS_VUE_DEFAUT } from "./etats";
import { EtatBadge, ETAT_TONE, SynoptiqueMini } from "./etat-badge";
import { PastilleArret } from "./bascule-arret";
import type { EtatArret } from "./arret";

function fmtDate(d: Date) {
  return new Date(d).toLocaleDateString("fr-FR");
}

/** Normalise pour une recherche insensible à la casse / aux accents. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Les états retenus, lus depuis l'URL. Absent = le défaut (« En cours ») ;
 *  « aucun » = l'utilisateur a tout décoché, ce qui n'est pas la même chose. */
function etatsDepuisUrl(brut: string | null): Set<EtatAffaire> {
  if (brut === null) return new Set(ETATS_VUE_DEFAUT);
  if (brut === "aucun") return new Set();
  const connus = new Set<string>(ETATS_AFFAIRE.map((e) => e.value));
  // On ignore ce qu'on ne reconnaît pas : une URL bricolée ne doit pas casser
  // l'écran, juste filtrer moins.
  return new Set(brut.split(",").filter((v): v is EtatAffaire => connus.has(v)));
}

/** L'arrêt des automates d'une affaire, résumé en un seul état : retouché dès
 *  qu'un seul l'est (c'est ce qui appelle une action), arrêté seulement si tous
 *  le sont. Un « 2/3 vert » laisserait croire que l'affaire est prête. */
function arretGlobalProjets(a: AffaireResume["arret"]): EtatArret {
  if (a.projetsRetouches > 0) return "retouche";
  if (a.projetsTotal > 0 && a.projetsArretes === a.projetsTotal) return "arrete";
  return "ouvert";
}

export function AffairesListe({
  affaires,
  moiId,
}: {
  affaires: AffaireResume[];
  /** Pour l'option « Moi » du filtre « Suivi par ». Null si non connecté. */
  moiId?: string | null;
}) {
  /* --- Les filtres vivent dans l'URL ------------------------------------- *
     Sinon, ouvrir une affaire puis revenir en arrière remet le tableau à son
     défaut : on retrouve « En cours » alors qu'on travaillait sur « Commande ».
     L'URL est aussi ce qui se met en favori et se colle dans un message. */
  const params = useSearchParams();
  const [query, setQuery] = useState(() => params.get("q") ?? "");
  // "" = tout le monde ; "AUCUN" = les affaires que personne ne suit.
  const [suivi, setSuivi] = useState(() => params.get("suivi") ?? "");
  // Par défaut : uniquement « En cours » — ce sur quoi on travaille. Les autres
  // états (devis en attente, livrées, clôturées, corbeille) restent accessibles
  // en cliquant leur puce, qui annonce déjà son compte.
  const [etats, setEtats] = useState<Set<EtatAffaire>>(() =>
    etatsDepuisUrl(params.get("etats")),
  );
  const [client, setClient] = useState(() => params.get("client") ?? "");

  // ... et quand l'adresse ne dit rien, on reprend le réglage laissé sur ce
  // poste. Revenir par le rail, par l'accueil ou par ⌘K amène ici sans aucun
  // paramètre : sans ce rattrapage, tout retombait sur « Commande + En cours »
  // alors qu'on travaillait sur autre chose depuis le matin.
  useReprendreFiltres("affaires", ["q", "client", "suivi", "etats"], (v) => {
    setQuery(v("q") ?? "");
    setClient(v("client") ?? "");
    setSuivi(v("suivi") ?? "");
    setEtats(etatsDepuisUrl(v("etats")));
  });

  // Clients réellement présents dans les affaires (pour l'autocomplétion).
  const clientOptions = useMemo<ComboOption[]>(
    () =>
      Array.from(new Set(affaires.map((a) => a.clientNom)))
        .sort((a, b) => a.localeCompare(b))
        .map((c) => ({ value: c })),
    [affaires],
  );

  // Compte par état : une puce de filtre qui annonce ce qu'elle contient évite
  // le clic « pour voir ».
  const parEtat = useMemo(() => {
    const m = new Map<EtatAffaire, number>();
    for (const a of affaires) m.set(a.etat, (m.get(a.etat) ?? 0) + 1);
    return m;
  }, [affaires]);

  // Qui suit quelque chose, et combien — la liste vient des affaires, pas de
  // l'annuaire : filtrer sur quelqu'un qui ne suit rien ne sert à rien.
  const suiveurs = useMemo(() => {
    const m = new Map<string, { nom: string; n: number }>();
    for (const a of affaires) {
      if (!a.suiviParId) continue;
      const e = m.get(a.suiviParId);
      if (e) e.n++;
      else m.set(a.suiviParId, { nom: a.suiviParNom ?? "—", n: 1 });
    }
    return [...m.entries()].sort((x, y) => x[1].nom.localeCompare(y[1].nom));
  }, [affaires]);
  const nbSansSuivi = affaires.filter((a) => !a.suiviParId).length;

  const filtrees = useMemo(() => {
    const q = norm(query.trim());
    const cl = norm(client.trim());
    return affaires.filter((a) => {
      if (etats.size > 0 && !etats.has(a.etat)) return false;
      if (cl && !norm(a.clientNom).includes(cl)) return false;
      if (suivi === "AUCUN" ? a.suiviParId !== null : suivi && a.suiviParId !== suivi) return false;
      if (q) {
        const cible = norm(`${a.nom} ${a.clientNom} ${a.numeroWhy ?? ""} ${a.suiviParNom ?? ""}`);
        if (!cible.includes(q)) return false;
      }
      return true;
    });
  }, [affaires, query, etats, client, suivi]);

  function toggleEtat(e: EtatAffaire) {
    setEtats((prev) => {
      const next = new Set(prev);
      if (next.has(e)) next.delete(e);
      else next.add(e);
      return next;
    });
  }

  const etatsParDefaut =
    etats.size === ETATS_VUE_DEFAUT.length && ETATS_VUE_DEFAUT.every((e) => etats.has(e));
  const filtreActif = query.trim() !== "" || client !== "" || suivi !== "" || !etatsParDefaut;

  // Les états ne s'écrivent que s'ils s'écartent du défaut (voir filtres-url).
  // La chaîne vide est un choix légitime (« aucun état retenu ») : on la note
  // avec un marqueur, sinon elle serait confondue avec « pas de filtre ».
  const qs = useSyncUrl(
    {
      q: query,
      client,
      suivi,
      etats: etatsParDefaut ? "" : [...etats].join(",") || "aucun",
    },
    "affaires",
  );
  // Chaque affaire emporte l'adresse de la liste TELLE QU'ELLE EST : le lien
  // « ← Affaires » de la fiche y ramènera, filtres compris. Sans ça, seule la
  // flèche du navigateur retrouvait la sélection.
  const retourIci = iciAvecFiltres("/affaires", qs);

  function reinitialiser() {
    setQuery("");
    setEtats(new Set(ETATS_VUE_DEFAUT));
    setClient("");
    setSuivi("");
  }

  // Base vide et liste filtrée vide sont deux situations différentes : la
  // première appelle une création, la seconde un élargissement des filtres.
  if (affaires.length === 0) {
    return (
      <div className="bloc">
        <EtatVide
          dessin="pochette"
          titre="Aucune affaire pour l'instant"
          texte="Renseignez un numéro Why dans un outil (Projet GTB, par exemple) et l'affaire se crée toute seule — ou créez-la directement depuis le bouton ci-dessus."
        />
      </div>
    );
  }

  return (
    /* Le laiton : l'affaire est le pivot, pas un outil. */
    <section className="bloc signal-accent">
      {/* --- Entête + bandeau de tri ---------------------------------------- *
          La barre de recherche flottait au-dessus du tableau, sans cadre : rien
          ne disait qu'elle le commandait. Titre et compte dans l'entête du bloc,
          les champs et les puces d'état dans un bandeau juste dessous — comme le
          bandeau « Total E/S » du parc d'affaires sur l'accueil. */}
      <EnteteBloc
        icone={Briefcase}
        titre="Les affaires"
        mention={`${filtrees.length} / ${affaires.length} affiché${filtrees.length > 1 ? "s" : ""}`}
      />

      <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-3 py-2">
        <div className="relative min-w-52 max-w-96 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher (nom, client, n° Why)…"
            className={cn(
              "h-9 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm text-fg",
              "transition-[border-color,box-shadow] duration-150",
              "placeholder:text-subtle hover:border-brand/40 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20",
            )}
          />
        </div>

        <div className="w-48 shrink-0">
          <Combobox
            value={client}
            onInput={setClient}
            onPick={(o) => setClient(o.value)}
            options={clientOptions}
            placeholder="Filtrer par client…"
          />
        </div>

        {/* « Suivi par » : le seul filtre qui répond à « qu'est-ce qui est à
            moi ». Chaque entrée annonce son compte — on sait avant de cliquer
            si ça vaut le coup. */}
        <select
          value={suivi}
          onChange={(e) => setSuivi(e.target.value)}
          aria-label="Filtrer par personne qui suit l'affaire"
          className={cn(
            "h-9 w-44 shrink-0 cursor-pointer rounded-md border border-border bg-surface px-2 text-sm",
            "transition-[border-color] duration-150 hover:border-brand/40 focus:border-brand focus:outline-none",
            suivi ? "text-fg" : "text-subtle",
          )}
        >
          <option value="">Suivi par : tous</option>
          {moiId && suiveurs.some(([id]) => id === moiId) && (
            <option value={moiId}>
              Moi ({suiveurs.find(([id]) => id === moiId)?.[1].n})
            </option>
          )}
          {suiveurs
            .filter(([id]) => id !== moiId)
            .map(([id, s]) => (
              <option key={id} value={id}>
                {s.nom} ({s.n})
              </option>
            ))}
          {nbSansSuivi > 0 && <option value="AUCUN">Personne ({nbSansSuivi})</option>}
        </select>

        {/* Les puces gardent leur défilement horizontal au téléphone : six états
            ne tiennent pas sur 390 px, et les empiler mangerait l'écran. */}
        <div className="ml-auto flex min-w-0 items-center gap-1.5 overflow-x-auto sm:flex-wrap sm:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {ETATS_AFFAIRE.map((e) => {
            const actif = etats.has(e.value);
            const n = parEtat.get(e.value) ?? 0;
            return (
              <button
                key={e.value}
                type="button"
                onClick={() => toggleEtat(e.value)}
                aria-pressed={actif}
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
                <span className="font-mono tabular-nums opacity-70">{n}</span>
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


      {/* --- Tableau --- */}
      {filtrees.length === 0 ? (
        <EtatVide
          icone={Search}
          titre="Aucune affaire ne correspond"
          texte="Élargissez les états retenus, ou effacez la recherche."
          action={
            <button
              type="button"
              onClick={reinitialiser}
              className="text-sm font-semibold text-brand hover:underline"
            >
              Réinitialiser les filtres
            </button>
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table table-cards">
            <thead>
              <tr>
                <th>Affaire</th>
                <th>Client</th>
                <th>N° Why</th>
                <th>Suivi par</th>
                <th>État</th>
                {/* « C'est fait ? » d'un coup d'œil, sans ouvrir la fiche. */}
                <th>Arrêt</th>
                <th className="cell-num">Réal.</th>
                <th>Modifié</th>
              </tr>
            </thead>
            <tbody>
              {filtrees.map((a) => (
                <tr key={a.id}>
                  <td className="cell-title cell-card-title cell-wrap">
                    <Link
                      href={avecRetour(`/affaires/${a.id}`, retourIci)}
                      className="group inline-flex items-center gap-2 transition-colors hover:text-brand"
                    >
                      <Briefcase className="h-4 w-4 shrink-0 text-subtle transition-colors group-hover:text-brand" />
                      {a.nom}
                    </Link>
                  </td>
                  <td data-label="Client">{a.clientNom}</td>
                  <td data-label="N° Why">
                    {a.numeroWhy ? (
                      <span className="ref rounded bg-surface-2 px-1.5 py-0.5 text-fg">
                        {a.numeroWhy}
                      </span>
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </td>
                  {/* Qui s'en occupe chez nous. Une affaire sans personne se
                      voit : c'est justement ce qu'on cherche du regard. */}
                  <td data-label="Suivi par">
                    {a.suiviParNom ? (
                      <span className={cn(a.suiviParId === moiId && "font-semibold text-fg")}>
                        {a.suiviParNom}
                      </span>
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </td>
                  <td data-label="État">
                    <span className="inline-flex items-center gap-2.5">
                      <EtatBadge etat={a.etat} />
                      <SynoptiqueMini etat={a.etat} className="hidden lg:inline-flex" />
                    </span>
                  </td>
                  <td data-label="Arrêt">
                    {a.arret.projetsTotal === 0 && a.arret.bom === "ouvert" ? (
                      <span className="text-subtle">—</span>
                    ) : (
                      <span className="flex flex-wrap items-center gap-1">
                        {a.arret.projetsTotal > 0 && (
                          <PastilleArret
                            etat={arretGlobalProjets(a.arret)}
                            libelle={`GTB ${a.arret.projetsArretes}/${a.arret.projetsTotal}`}
                            titre={
                              a.arret.projetsRetouches > 0
                                ? `Projet GTB : ${a.arret.projetsArretes} automate(s) arrêté(s) sur ${a.arret.projetsTotal}, dont ${a.arret.projetsRetouches} retouché(s) depuis`
                                : `Projet GTB : ${a.arret.projetsArretes} automate(s) arrêté(s) sur ${a.arret.projetsTotal}`
                            }
                          />
                        )}
                        {a.arret.bom !== "ouvert" && (
                          <PastilleArret
                            etat={a.arret.bom}
                            libelle="Matériel"
                            titre={
                              a.arret.bom === "arrete"
                                ? "Besoin en matériel : arrêté"
                                : "Besoin en matériel : arrêté, puis modifié depuis"
                            }
                          />
                        )}
                      </span>
                    )}
                  </td>
                  <td data-label="Réalisations" className="cell-num">
                    {a.nbRealisations}
                  </td>
                  <td data-label="Modifié">{fmtDate(a.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
