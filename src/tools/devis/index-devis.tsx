"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Eye,
  FileSpreadsheet,
  GitBranch,
  Globe,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  TriangleAlert,
} from "lucide-react";
import {
  Badge,
  Button,
  Chiffre,
  ColgroupColonnes,
  Combobox,
  EnteteBloc,
  EnteteColonnes,
  Input,
  Label,
  RangeeChiffres,
  ReglageColonnes,
  EtatVide,
  basculerTri,
  classeCellule,
  labelCellule,
  useColonnes,
  type ComboOption,
  type DefColonne,
  type EtatTri,
} from "@/ui";
import { useSyncUrl } from "@/lib/filtres-url";
import { cn } from "@/lib/cn";
import { creerDevis } from "./actions";
import {
  ETATS_DEVIS,
  ETAT_DEVIS_AIDE,
  ETAT_DEVIS_LABEL,
  formatEuros,
  formatPourcent,
  libelleDevis,
  type DevisResume,
  type EtatDevis,
} from "./model";
import type { StatsDevis } from "./queries";

/* =============================================================================
 * L'INDEX DES DEVIS
 *
 * Même rythme que le tableau de bord des affaires — c'est le même geste, sur un
 * autre objet : la rangée de chiffres collée au cartouche, puis UN bloc qui
 * porte son titre, ses filtres et sa table. La barre de recherche flottait
 * au-dessus du tableau sans cadre : rien ne disait qu'elle le commandait.
 *
 * Trois choses lues dans cet ordre : ce qui est en jeu (émis, en attente de
 * réponse), ce qu'on est en train de chiffrer, et le reste.
 * ========================================================================== */

const dateFr = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const TON_ETAT: Record<EtatDevis, "neutral" | "brand" | "success" | "danger"> = {
  BROUILLON: "neutral",
  EMIS: "brand",
  ACCEPTE: "success",
  REFUSE: "danger",
};

/** La teinte des puces de filtre — la même langue que les badges d'état. */
const TEINTE_ETAT: Record<EtatDevis, string> = {
  BROUILLON: "text-muted",
  EMIS: "text-brand",
  ACCEPTE: "text-success",
  REFUSE: "text-danger",
};

/* --- Les colonnes -----------------------------------------------------------
 * L'ordre, la largeur et la visibilité ci-dessous sont le DÉFAUT : chacun
 * règle ensuite sa table (bouton « Colonnes »), et le réglage lui reste. Les
 * colonnes d'appoint — celles qu'on ne consulte pas tous les jours — sont
 * repliées au départ plutôt qu'absentes.
 * -------------------------------------------------------------------------- */
const COLONNES: DefColonne[] = [
  {
    cle: "devis",
    libelle: "Devis",
    souple: true,
    min: 230,
    essentielle: true,
    carteTitre: true,
    retourLigne: true,
    triable: true,
  },
  { cle: "client", libelle: "Client", largeur: 170, tronque: true, triable: true },
  { cle: "affaire", libelle: "Affaire", largeur: 190, tronque: true, triable: true },
  { cle: "why", libelle: "N° Why", largeur: 115, tronque: true, masqueeDefaut: true, triable: true },
  { cle: "etat", libelle: "État", largeur: 120, triable: true },
  // « Émis » dit ce qu'on a décidé ; « Envoi » dit ce qui s'est passé — le lien
  // est-il en ligne, et le client l'a-t-il ouvert. C'est cette colonne qui
  // décide d'une relance, pas l'état.
  { cle: "envoi", libelle: "Envoi", largeur: 118, triable: true },
  { cle: "net", libelle: "Net HT", largeur: 130, align: "droite", triable: true },
  { cle: "marge", libelle: "Marge fourniture", largeur: 155, align: "droite", triable: true },
  {
    cle: "brut",
    libelle: "Total HT",
    largeur: 125,
    align: "droite",
    masqueeDefaut: true,
    triable: true,
  },
  {
    cle: "lignes",
    libelle: "Lignes",
    largeur: 85,
    align: "centre",
    masqueeDefaut: true,
    triable: true,
  },
  {
    cle: "auteur",
    libelle: "Modifié par",
    largeur: 145,
    tronque: true,
    masqueeDefaut: true,
    triable: true,
  },
  { cle: "maj", libelle: "Modifié", largeur: 138, tronque: true, triable: true },
];

/** Les états retenus, lus depuis l'URL. Absent = tous ; « aucun » = tout
 *  décoché, ce qui n'est pas la même chose. */
function etatsDepuisUrl(brut: string | null): Set<EtatDevis> {
  if (brut === null) return new Set(ETATS_DEVIS);
  if (brut === "aucun") return new Set();
  const connus = new Set<string>(ETATS_DEVIS);
  return new Set(brut.split(",").filter((v): v is EtatDevis => connus.has(v)));
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export interface AffaireChoix {
  id: string;
  nom: string;
  numeroWhy: string | null;
  clientNom: string;
}

export function IndexDevis({
  devis,
  stats,
  clients,
  affaires,
}: {
  devis: DevisResume[];
  stats: StatsDevis;
  clients: string[];
  affaires: AffaireChoix[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  /* Les filtres vivent dans l'URL : ouvrir un devis puis revenir ne doit pas
     remettre la liste à son défaut (voir lib/filtres-url). */
  const [q, setQ] = useState(() => params.get("q") ?? "");
  const [client, setClient] = useState(() => params.get("client") ?? "");
  const [etats, setEtats] = useState<Set<EtatDevis>>(() => etatsDepuisUrl(params.get("etats")));
  const [creation, setCreation] = useState(false);
  const [tri, setTri] = useState<EtatTri>({ cle: "maj", sens: "desc" });

  const colonnes = useColonnes("devis.index", COLONNES);

  const clientOptions = useMemo<ComboOption[]>(
    () =>
      Array.from(new Set(devis.map((d) => d.clientNom).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b))
        .map((c) => ({ value: c })),
    [devis],
  );

  // Une puce de filtre qui annonce ce qu'elle contient évite le clic « pour voir ».
  const parEtat = useMemo(() => {
    const m = new Map<EtatDevis, number>();
    for (const d of devis) m.set(d.etat, (m.get(d.etat) ?? 0) + 1);
    return m;
  }, [devis]);

  const filtres = useMemo(() => {
    const f = norm(q.trim());
    const cl = norm(client.trim());
    const retenus = devis.filter((d) => {
      if (!etats.has(d.etat)) return false;
      if (cl && !norm(d.clientNom).includes(cl)) return false;
      if (!f) return true;
      const cible = norm(
        `${d.numero} ${d.titre} ${d.clientNom} ${d.numeroWhy ?? ""} ${d.chantierNom ?? ""}`,
      );
      return cible.includes(f);
    });
    return [...retenus].sort(comparateur(tri));
  }, [devis, q, client, etats, tri]);

  const etatsParDefaut = etats.size === ETATS_DEVIS.length;
  const filtreActif = q.trim() !== "" || client !== "" || !etatsParDefaut;

  useSyncUrl({
    q,
    client,
    etats: etatsParDefaut ? "" : [...etats].join(",") || "aucun",
  });

  function reinitialiser() {
    setQ("");
    setClient("");
    setEtats(new Set(ETATS_DEVIS));
  }

  function basculerEtat(e: EtatDevis) {
    setEtats((prev) => {
      const next = new Set(prev);
      if (next.has(e)) next.delete(e);
      else next.add(e);
      return next;
    });
  }

  /* Les référentiels se règlent DEPUIS L'ACCUEIL de l'outil, et de là
     seulement : un bouton posé dans l'éditeur invitait à quitter un chiffrage
     en cours pour aller changer la politique commerciale de la maison. */
  const nouveau = (
    <>
      <Link
        href="/perso/gus/devis/referentiels"
        className="press inline-flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg transition-[background-color,border-color] duration-150 hover:border-brand/45 hover:bg-surface-2"
      >
        <Settings2 className="h-4 w-4" /> Référentiels
      </Link>
      <Button size="sm" onClick={() => setCreation((c) => !c)}>
        <Plus className="h-4 w-4" /> Nouveau devis
      </Button>
    </>
  );

  return (
    <>
      <RangeeChiffres className="-mt-px mb-4">
        <Chiffre label="Devis" valeur={stats.nbTotal} detail="toutes révisions" />
        <Chiffre label="En chiffrage" valeur={stats.nbBrouillons} detail="brouillons" />
        <Chiffre
          label="En jeu"
          valeur={formatEuros(stats.enJeuCents)}
          detail={`${stats.nbEmis} devis émis, net HT`}
        />
        <Chiffre
          label="Accepté"
          valeur={formatEuros(stats.gagneCents)}
          detail="net HT"
          ton={stats.gagneCents > 0 ? "success" : "neutre"}
        />
      </RangeeChiffres>

      {creation && (
        <NouveauDevis
          clients={clients}
          affaires={affaires}
          onFerme={() => setCreation(false)}
          onCree={(id) => router.push(`/perso/gus/devis/${id}`)}
        />
      )}

      {/* Le violet : le signal de l'outil dans l'espace perso. */}
      <section className="bloc signal-ao">
        <EnteteBloc
          icone={FileSpreadsheet}
          titre="Les devis"
          mention={
            filtres.length === devis.length
              ? `${devis.length} au total`
              : `${filtres.length} / ${devis.length} affiché${filtres.length > 1 ? "s" : ""}`
          }
          actions={
            <>
              <ReglageColonnes api={colonnes} />
              {nouveau}
            </>
          }
        />

        {/* Les filtres commandent la table : ils sont DANS son cadre. */}
        <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-3 py-2">
          <div className="relative min-w-52 max-w-96 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Numéro, objet, client, affaire, n° Why…"
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

          <div className="ml-auto flex min-w-0 items-center gap-1.5 overflow-x-auto sm:flex-wrap sm:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {ETATS_DEVIS.map((e) => {
              const actif = etats.has(e);
              return (
                <button
                  key={e}
                  type="button"
                  onClick={() => basculerEtat(e)}
                  aria-pressed={actif}
                  title={ETAT_DEVIS_AIDE[e]}
                  className={cn(
                    "inline-flex min-h-[2.25rem] shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs font-medium sm:min-h-0 sm:px-2.5 sm:py-1",
                    "transition-[opacity,border-color,background-color] duration-150",
                    TEINTE_ETAT[e],
                    actif
                      ? "border-current opacity-100"
                      : "border-transparent opacity-45 hover:opacity-80",
                  )}
                >
                  {ETAT_DEVIS_LABEL[e]}
                  <span className="font-mono tabular-nums opacity-70">
                    {parEtat.get(e) ?? 0}
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

        {filtres.length === 0 ? (
          <EtatVide
            dessin={devis.length === 0 ? "carnet" : undefined}
            icone={devis.length === 0 ? undefined : Search}
            titre={devis.length === 0 ? "Aucun devis" : "Aucun devis ne correspond"}
            texte={
              devis.length === 0
                ? "Le chiffrage part d'ici : on compose des lots, on pioche dans le magasin, et le prix de vente se déduit du déboursé."
                : "Élargissez les états retenus, ou effacez la recherche."
            }
            action={
              devis.length === 0 ? (
                <Button onClick={() => setCreation(true)}>
                  <Plus className="h-4 w-4" /> Nouveau devis
                </Button>
              ) : (
                <button
                  type="button"
                  onClick={reinitialiser}
                  className="text-sm font-semibold text-brand hover:underline"
                >
                  Réinitialiser les filtres
                </button>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table
              {...colonnes.conteneur}
              className="data-table data-table--reglable table-cards"
            >
              <ColgroupColonnes colonnes={colonnes.visibles} />
              <EnteteColonnes
                colonnes={colonnes.visibles}
                api={colonnes}
                tri={tri}
                onTri={(cle) => setTri((t) => basculerTri(t, cle, sensInitial))}
              />
              <tbody>
                {filtres.map((d) => (
                  <tr key={d.id}>
                    {colonnes.visibles.map((c) => (
                      <td
                        key={c.cle}
                        data-label={labelCellule(c)}
                        className={classeCellule(c, c.cle === "devis" ? "cell-title" : undefined)}
                      >
                        {cellule(d, c.cle)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

/* --- Le contenu d'une cellule ----------------------------------------------
 * Une fonction par clé de colonne plutôt qu'un `<td>` écrit en dur : c'est ce
 * qui permet à l'ordre et à la visibilité d'être un réglage, et non une
 * décision de code.
 * -------------------------------------------------------------------------- */
function cellule(d: DevisResume, cle: string): React.ReactNode {
  switch (cle) {
    case "devis":
      return (
        <>
          <Link
            href={`/perso/gus/devis/${d.id}`}
            className="group inline-flex items-center gap-2 transition-colors hover:text-brand"
          >
            <FileSpreadsheet className="h-4 w-4 shrink-0 text-subtle transition-colors group-hover:text-brand" />
            <span className="ref">{libelleDevis(d.numero, d.revision)}</span>
            {d.titre && <span className="text-muted">· {d.titre}</span>}
          </Link>
          {/* Une v1 dépassée doit se voir comme telle, sans avoir à ouvrir le
              devis pour comprendre pourquoi elle est basse. */}
          {d.nbRevisions > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 text-xs text-subtle">
              <GitBranch className="h-3 w-3" />
              {d.nbRevisions} révision{d.nbRevisions > 1 ? "s" : ""} après
            </span>
          )}
        </>
      );

    case "client":
      return d.clientNom || <span className="text-subtle">—</span>;

    case "affaire":
      return d.chantierId ? (
        <Link href={`/affaires/${d.chantierId}`} className="hover:text-brand">
          {d.chantierNom}
        </Link>
      ) : (
        <span className="text-subtle">—</span>
      );

    case "why":
      return d.numeroWhy ? (
        <span className="ref rounded bg-surface-2 px-1.5 py-0.5 text-fg">{d.numeroWhy}</span>
      ) : (
        <span className="text-subtle">—</span>
      );

    case "etat":
      return (
        <Badge tone={TON_ETAT[d.etat]} point>
          {ETAT_DEVIS_LABEL[d.etat]}
        </Badge>
      );

    case "envoi":
      if (!d.publie) return <span className="text-subtle">—</span>;
      return d.nbConsultations > 0 ? (
        <span
          className="inline-flex items-center gap-1.5 text-sm text-success"
          title={`Lien en ligne — ouvert ${d.nbConsultations} fois par le client`}
        >
          <Eye className="h-3.5 w-3.5" /> vu {d.nbConsultations}×
        </span>
      ) : (
        <span
          className="inline-flex items-center gap-1.5 text-sm text-muted"
          title="Lien en ligne, jamais ouvert par le client"
        >
          <Globe className="h-3.5 w-3.5" /> jamais ouvert
        </span>
      );

    case "net":
      return (
        <span className="font-semibold text-fg">
          {formatEuros(d.netHtCents)}
          {/* Le nombre de lignes non chiffrées voyage AVEC le total : un montant
              qu'on ne peut pas défendre doit le dire là où on le lit, pas dans
              un écran plus loin. */}
          {d.nbSansPrix > 0 && (
            <span
              className="ml-1.5 inline-flex items-center gap-1 text-xs font-normal text-warning"
              title={`${d.nbSansPrix} ligne(s) sans prix d'achat connu — exclues du déboursé`}
            >
              <TriangleAlert className="h-3 w-3" />
              {d.nbSansPrix}
            </span>
          )}
        </span>
      );

    case "brut":
      return formatEuros(d.totalHtCents);

    case "marge":
      return d.tauxMargeFournitureCentieme === null ? (
        <span className="text-subtle">—</span>
      ) : (
        <span className={cn(d.margeFournitureCents <= 0 ? "text-danger" : "text-muted")}>
          {formatEuros(d.margeFournitureCents)}
          <span className="ml-1 text-xs text-subtle">
            {formatPourcent(d.tauxMargeFournitureCentieme)}
          </span>
        </span>
      );

    case "lignes":
      return d.nbLignes;

    case "auteur":
      return d.auteur ?? <span className="text-subtle">—</span>;

    case "maj":
      return dateFr.format(d.updatedAt);

    default:
      return null;
  }
}

/* --- Le tri -----------------------------------------------------------------
 * Le texte part de A à Z ; les nombres et les dates partent du plus grand — on
 * clique sur « Net HT » pour voir les gros devis, pas les petits.
 * -------------------------------------------------------------------------- */

const RANG_ETAT: Record<EtatDevis, number> = {
  BROUILLON: 0,
  EMIS: 1,
  ACCEPTE: 2,
  REFUSE: 3,
};

function sensInitial(cle: string): "asc" | "desc" {
  return ["net", "brut", "marge", "lignes", "maj"].includes(cle) ? "desc" : "asc";
}

function cle_(d: DevisResume, cle: string): string | number {
  switch (cle) {
    case "devis":
      return `${d.numero}-${d.revision}`;
    case "client":
      return norm(d.clientNom);
    case "affaire":
      return norm(d.chantierNom ?? "");
    case "why":
      return norm(d.numeroWhy ?? "");
    case "etat":
      return RANG_ETAT[d.etat];
    // Le plus parlant d'abord quand on trie : ce qui est en ligne mais jamais
    // ouvert (à relancer), puis ce qui a été lu, puis ce qui n'est pas parti.
    case "envoi":
      return !d.publie ? -1 : d.nbConsultations;
    case "net":
      return d.netHtCents;
    case "brut":
      return d.totalHtCents;
    // Un devis sans déboursé connu n'a pas de taux : il se range en bout de
    // liste plutôt qu'au milieu, où il passerait pour une marge nulle.
    case "marge":
      return d.tauxMargeFournitureCentieme ?? Number.NEGATIVE_INFINITY;
    case "lignes":
      return d.nbLignes;
    case "auteur":
      return norm(d.auteur ?? "");
    default:
      return d.updatedAt.getTime();
  }
}

function comparateur(tri: EtatTri) {
  const signe = tri.sens === "asc" ? 1 : -1;
  return (a: DevisResume, b: DevisResume) => {
    const x = cle_(a, tri.cle);
    const y = cle_(b, tri.cle);
    if (typeof x === "number" && typeof y === "number") return (x - y) * signe;
    return String(x).localeCompare(String(y)) * signe;
  };
}

/* -----------------------------------------------------------------------------
 * NOUVEAU DEVIS
 * Deux chemins assumés : partir d'une AFFAIRE (le client et le n° Why suivent
 * tout seuls), ou d'un client libre — le devis d'avant-projet, quand l'affaire
 * n'existe pas encore.
 * -------------------------------------------------------------------------- */

function NouveauDevis({
  clients,
  affaires,
  onFerme,
  onCree,
}: {
  clients: string[];
  affaires: AffaireChoix[];
  onFerme: () => void;
  onCree: (id: string) => void;
}) {
  const [titre, setTitre] = useState("");
  const [clientNom, setClientNom] = useState("");
  const [numeroWhy, setNumeroWhy] = useState("");
  const [chantierId, setChantierId] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  function choisirAffaire(id: string) {
    setChantierId(id);
    const a = affaires.find((x) => x.id === id);
    if (a) {
      setClientNom(a.clientNom);
      setNumeroWhy(a.numeroWhy ?? "");
      if (!titre) setTitre(a.nom);
    }
  }

  function valider() {
    setErreur(null);
    demarrer(async () => {
      try {
        const d = await creerDevis({ titre, clientNom, numeroWhy, chantierId: chantierId || null });
        onCree(d.id);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Création impossible");
      }
    });
  }

  return (
    <div className="bloc anim-rise signal-ao mb-4">
      <EnteteBloc
        icone={Plus}
        titre="Nouveau devis"
        mention="le numéro est attribué à la création"
        actions={
          <button onClick={onFerme} className="text-sm text-muted hover:text-fg">
            Annuler
          </button>
        }
      />
      <div className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label htmlFor="dv-titre">Objet</Label>
            <Input
              id="dv-titre"
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              placeholder="GTB chaufferie — lot 3"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="dv-affaire">Affaire (facultatif)</Label>
            <select
              id="dv-affaire"
              value={chantierId}
              onChange={(e) => choisirAffaire(e.target.value)}
              className="h-[var(--control-h)] w-full rounded-md border border-border bg-surface px-3 text-sm text-fg"
            >
              <option value="">— Sans affaire —</option>
              {affaires.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nom} {a.numeroWhy ? `(${a.numeroWhy})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Client</Label>
            <Combobox
              value={clientNom}
              onInput={setClientNom}
              onPick={(o) => setClientNom(o.value)}
              options={clients.map((c) => ({ value: c }))}
              placeholder="Nom du client"
            />
          </div>
          <div>
            <Label htmlFor="dv-why">N° Why</Label>
            <Input
              id="dv-why"
              value={numeroWhy}
              onChange={(e) => setNumeroWhy(e.target.value)}
              placeholder="SE60-001"
              className="ref"
            />
          </div>
        </div>
        {erreur && <p className="mt-3 text-sm text-danger">{erreur}</p>}
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={valider} disabled={enCours}>
            {enCours ? "Création…" : "Créer et chiffrer"}
          </Button>
          <p className="text-xs text-subtle">
            Le numéro est attribué à la création, au format DT{"{AA}{NNNN}"}.
          </p>
        </div>
      </div>
    </div>
  );
}
