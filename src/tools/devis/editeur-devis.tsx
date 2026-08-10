"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  Asterisk,
  Boxes,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy as CopyIcon,
  FolderPlus,
  GitBranch,
  GripVertical,
  MoreHorizontal,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Trash2,
  TriangleAlert,
  Type,
  Undo2,
  Wrench,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  ColgroupColonnes,
  Combobox,
  EnteteColonnes,
  Input,
  Kbd,
  Label,
  ReglageColonnes,
  classeCellule,
  labelCellule,
  useColonnes,
  type ColonneReglee,
  type DefColonne,
} from "@/ui";
import { cn } from "@/lib/cn";
import {
  ajouterLigneLibre,
  ajouterLignePrestation,
  ajouterLigneProduit,
  ajouterLigneTexte,
  ajouterLot,
  ajouterProduitAvecAssocies,
  deplacerLigne,
  deplacerLot,
  dupliquerDevis,
  dupliquerLigne,
  majEnteteDevis,
  majLigne,
  majLot,
  nouvelleRevision,
  rafraichirLignes,
  reordonnerLignes,
  supprimerDevis,
  supprimerLigne,
  supprimerLot,
} from "./actions";
import { RepriseBom } from "./reprise-bom";
import { BlocPublication } from "./publication-devis";
import { FilDevisPanneau } from "./fil-devis";
import { PropositionAssocies } from "./proposition-associes";
import type { AssociationVue } from "@/tools/magasin/model";
import { TexteRiche } from "./texte-riche";
import {
  ETAT_DEVIS_AIDE,
  ETAT_DEVIS_LABEL,
  ORIGINE_COEF_LABEL,
  calculerDevis,
  chargeMainOeuvre,
  formatCoef,
  formatEuros,
  formatPourcent,
  formatQuantite,
  libelleDevis,
  ligneChiffree,
  parseCoef,
  parseEuros,
  parsePourcent,
  parseQuantite,
  parseRemise,
  simulerPrixCible,
  type ChargeUnite,
  type DevisComplet,
  type EtatDevis,
  type GenreLigne,
  type LigneCalculee,
  type LigneDevisVue,
  type LotCalcule,
  type FilDevis,
  type PrestationVue,
  type TotauxDevis,
} from "./model";
import type { ArticleChoix } from "./queries";
import type { AffaireChoix } from "./index-devis";
import "./editeur-devis.css";

/* =============================================================================
 * L'ÉDITEUR DE DEVIS
 *
 * Mise en page issue du handoff « 2a » (docs/DEVIS.md §22), validée à l'usage
 * le 2026-08-10 : elle a remplacé l'éditeur historique, qui est parti. Le
 * calcul, les actions et le modèle n'ont jamais bougé — seule la disposition a
 * changé.
 *
 * Ce que cette disposition porte, et pourquoi :
 *
 *  1. UNE COQUILLE PLEINE HAUTEUR. Seule la zone de lignes défile. La barre de
 *     devis (identité + paramètres) et la barre de totaux (le prix) ne quittent
 *     jamais l'écran : on tape un prix en voyant ce qu'il fait au total.
 *  2. LE PRIX NE VIT QU'EN BAS. Il était écrit trois fois (cartouche, aiguille
 *     du pupitre, cascade). Une seule source, dans le bâti sombre.
 *  3. LA COLONNE DE DROITE DEVIENT TROIS ONGLETS — composer, négocier,
 *     publier. Les trois métiers ne se lisaient plus : quatre blocs toujours
 *     dépliés, dont le plus gros (la publication) était celui qu'on touche le
 *     moins.
 *  4. UN SEUL TABLEAU pour tous les lots, entête de colonnes collé en haut et
 *     entête de lot collé dessous. L'alignement des colonnes entre deux lots
 *     n'est plus un réglage partagé : c'est la structure.
 *  5. UN RAIL DE LOTS à gauche — navigation ET sous-totaux au même endroit.
 *     Repliable, ouvert par défaut.
 * ========================================================================== */

/* --- Le cycle de vie d'un devis ---------------------------------------------
 * Trois états se SUIVENT (on chiffre, on envoie, le client répond) et un
 * quatrième est une SORTIE (refusé). Un menu déroulant les mettait sur le même
 * plan et n'annonçait rien : on lisait l'état courant, jamais le chemin.
 *
 * D'où une piste à trois jalons, avec le jalon suivant offert en clair. Le
 * refus reste accessible — il est réel — mais il n'est pas sur le chemin.
 * -------------------------------------------------------------------------- */
const PISTE_ETAT: EtatDevis[] = ["BROUILLON", "EMIS", "ACCEPTE"];

/** La teinte de chaque état, dans le vocabulaire du design system. */
const TON_ETAT: Record<EtatDevis, { signal: string; texte: string }> = {
  BROUILLON: { signal: "signal-brand", texte: "text-muted" },
  EMIS: { signal: "signal-brand", texte: "text-brand" },
  ACCEPTE: { signal: "signal-do", texte: "text-success" },
  REFUSE: { signal: "signal-accent", texte: "text-danger" },
};

/** Les deux lots que porte presque tout devis GTB. */
const LOTS_SUGGERES = ["Matériel", "Prestations"];

/**
 * La couleur d'un lot est DÉRIVÉE DE SON RANG, jamais stockée : un champ de
 * plus en base pour une pastille de 8 px ne se défend pas, et l'ordre des lots
 * est déjà la chose qu'on lit. On pioche dans les signaux E/S de la maison —
 * `ao` (violet) est réservé : c'est le signal de l'outil Devis lui-même.
 */
const SIGNAUX_LOT = ["signal-ai", "signal-di", "signal-do", "signal-com", "signal-accent"];
function signalLot(rang: number): string {
  return SIGNAUX_LOT[rang % SIGNAUX_LOT.length];
}

/**
 * D'où vient le coefficient, en UN MOT. La colonne fait quatre-vingts pixels :
 * « réglé sur la catégorie » y était coupé à « réglé s… », qui ne dit plus rien
 * — alors que le seul mot utile est le dernier. La phrase entière reste en
 * infobulle, et l'écran ne montre jamais un coefficient sans dire son origine.
 */
const ORIGINE_COEF_COURT: Record<string, string> = {
  ligne: "forcé",
  produit: "article",
  categorie: "catégorie",
  devis: "défaut",
};

/* --- Les colonnes du chiffrage ----------------------------------------------
 * Le défaut suit la grille du handoff, à une exception près : la RÉFÉRENCE est
 * repliée. Trois colonnes se partagent la largeur qui reste une fois le rail et
 * le panneau servis, et la désignation est une zone de texte qu'on MODIFIE —
 * elle ne se coupe pas à l'ellipse comme sur la maquette. Sortie, la référence
 * lui prenait cent pixels et « AUTOMATE DISTECH ECY-S1000-C50 » tombait sur
 * trois lignes ; repliée, elle continue de s'afficher SOUS la désignation (le
 * rendu le prévoit) et la table tient jusqu'à 1280 px sans défiler.
 * Un clic sur « Colonnes » la ressort — le réglage reste au poste.
 *
 * Clé de stockage distincte de l'écran historique : les deux cohabitent, ils ne
 * doivent pas se marcher dessus.
 * -------------------------------------------------------------------------- */
const COLONNES_LIGNES: DefColonne[] = [
  { cle: "poignee", libelle: "Déplacer", largeur: 24, min: 22, ancree: true, muette: true },
  {
    cle: "designation",
    libelle: "Désignation",
    souple: true,
    min: 150,
    essentielle: true,
    carteTitre: true,
    retourLigne: true,
  },
  { cle: "ref", libelle: "Référence", largeur: 96, tronque: true, masqueeDefaut: true },
  { cle: "qte", libelle: "Qté", largeur: 72, align: "droite" },
  { cle: "debourse", libelle: "Déboursé", largeur: 94, align: "droite" },
  { cle: "coef", libelle: "Coef.", largeur: 84, align: "droite" },
  { cle: "pv", libelle: "P.V. unit.", largeur: 94, align: "droite" },
  { cle: "remise", libelle: "Rem.", largeur: 72, align: "droite", masqueeDefaut: true },
  { cle: "total", libelle: "Total", largeur: 102, align: "droite" },
  { cle: "actions", libelle: "Actions", largeur: 96, min: 92, ancree: true, muette: true },
];

type Onglet = "composition" | "negocier" | "publier" | "fil";

/** L'épinglage du rail de lots — un réglage de poste, comme les colonnes, le
 *  thème et la densité. Lu en `useSyncExternalStore` : le rendu serveur donne
 *  le défaut (aucune divergence d'hydratation), et un autre onglet suit. */
const CLE_RAIL = "dumtools.devis.railEpingle";
const abonnesRail = new Set<() => void>();

function abonnerRail(fn: () => void) {
  abonnesRail.add(fn);
  window.addEventListener("storage", fn);
  return () => {
    abonnesRail.delete(fn);
    window.removeEventListener("storage", fn);
  };
}

function lireRailEpingle(): boolean {
  try {
    return window.localStorage.getItem(CLE_RAIL) === "1";
  } catch {
    return false;
  }
}

function ecrireRailEpingle(v: boolean) {
  try {
    window.localStorage.setItem(CLE_RAIL, v ? "1" : "0");
  } catch {
    /* stockage indisponible : le réglage vaut pour la session, c'est tout */
  }
  abonnesRail.forEach((fn) => fn());
}

/** Garde la proposition active dans le champ de vision aux flèches. */
function versLaVue(el: HTMLButtonElement | null) {
  el?.scrollIntoView({ block: "nearest" });
}

export function EditeurDevis({
  devis,
  prestations,
  affaires,
  clients,
  qui,
  fil,
  moiId,
  moiNom,
}: {
  devis: DevisComplet;
  prestations: PrestationVue[];
  affaires: AffaireChoix[];
  clients: string[];
  qui: string;
  /** Le fil de la chaîne de révisions (docs/DEVIS-FIL.md). */
  fil: FilDevis;
  moiId: string;
  moiNom: string;
}) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [reprise, setReprise] = useState(false);
  const [onglet, setOnglet] = useState<Onglet>("composition");
  /* Le rail dort replié et s'ouvre au survol ; on peut l'épingler, et ce choix
     reste au poste. */
  const railEpingle = useSyncExternalStore(abonnerRail, lireRailEpingle, () => false);
  const [railSurvol, setRailSurvol] = useState(false);
  /** Les lots repliés. Ouverts par défaut : on ouvre un devis pour le lire. */
  const [replies, setReplies] = useState<Set<string>>(() => new Set());
  const { entete, lots, lignes } = devis;
  const base = `/perso/${qui}/devis`;

  const colonnes = useColonnes("devis.lignes.v2", COLONNES_LIGNES);

  /* --- Réordonnancement optimiste (identique à l'éditeur historique) -------- */
  const [surcharge, setSurcharge] = useState<Map<
    string,
    { lotId: string | null; ordre: number }
  > | null>(null);

  /* On lâche l'ordre local quand le SERVEUR a changé d'ordre — pas à chaque
     rendu : comparer l'identité du tableau reçu déclencherait une mise à jour
     d'état pendant le rendu à chaque écriture (voir DEVIS.md §20). */
  const empreinte = lignes.map((l) => `${l.id}:${l.lotId ?? ""}:${l.ordre}`).join("|");
  const [ancre, setAncre] = useState(empreinte);
  if (ancre !== empreinte) {
    setAncre(empreinte);
    setSurcharge(null);
  }

  /* --- Retrait optimiste de la remise globale ------------------------------
   * La valeur locale ne s'applique QUE tant que le serveur montre encore celle
   * d'avant : aucun état à nettoyer (patron `entetePeinte`, DEVIS.md §20.4). */
  const [remiseLocale, setRemiseLocale] = useState<{ avant: string } | null>(null);
  const empreinteRemise = `${entete.remiseGlobalePourMille}/${entete.remiseGlobaleCents}`;
  const entetePeinte =
    remiseLocale && remiseLocale.avant === empreinteRemise
      ? { ...entete, remiseGlobalePourMille: null, remiseGlobaleCents: null }
      : entete;

  function retirerRemise() {
    setRemiseLocale({ avant: empreinteRemise });
    agir(() =>
      majEnteteDevis(entete.id, { remiseGlobalePourMille: null, remiseGlobaleCents: null }),
    );
  }

  const lignesAffichees = useMemo(
    () =>
      surcharge
        ? lignes.map((l) => {
            const o = surcharge.get(l.id);
            return o ? { ...l, lotId: o.lotId, ordre: o.ordre } : l;
          })
        : lignes,
    [lignes, surcharge],
  );

  const totaux = useMemo(
    () => calculerDevis(entetePeinte, lots, lignesAffichees),
    [entetePeinte, lots, lignesAffichees],
  );
  const charge = useMemo(() => chargeMainOeuvre(lignesAffichees), [lignesAffichees]);

  /**
   * Toutes les écritures passent par ici. ⚠️ Ni `useTransition`, ni double
   * rafraîchissement — les deux ont coûté cher et la mesure les a tranchés
   * (DEVIS.md §20) : une écriture dans une transition se perd une fois sur cinq.
   */
  async function agir(fn: () => Promise<unknown>) {
    setErreur(null);
    setEnCours(true);
    try {
      await fn();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Opération impossible");
    } finally {
      setEnCours(false);
    }
  }

  /* --- Glisser-déposer ------------------------------------------------------ */
  const dragId = useRef<string | null>(null);
  const [surLigne, setSurLigne] = useState<string | null>(null);
  const [texteNeuf, setTexteNeuf] = useState<string | null>(null);

  function deposer(lotCible: string | null, cibleId: string | null) {
    const source = dragId.current;
    dragId.current = null;
    setSurLigne(null);
    if (!source) return;

    const duLot = lignesAffichees
      .filter((l) => (l.lotId ?? null) === lotCible && l.id !== source)
      .sort((a, b) => a.ordre - b.ordre)
      .map((l) => l.id);
    const i = cibleId ? duLot.indexOf(cibleId) : duLot.length;
    duLot.splice(i < 0 ? duLot.length : i, 0, source);

    const majeur = new Map(surcharge ?? []);
    duLot.forEach((id, k) => majeur.set(id, { lotId: lotCible, ordre: (k + 1) * 1000 }));
    setSurcharge(majeur);
    agir(async () => {
      try {
        await reordonnerLignes(entete.id, lotCible, duLot);
      } catch (e) {
        setSurcharge(null);
        throw e;
      }
    });
  }

  function basculerLot(id: string) {
    setReplies((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  /** Un devis sans lot doit tout de même offrir un endroit où déposer. */
  const groupes: LotCalcule[] =
    totaux.lots.length > 0
      ? totaux.lots
      : [{ lot: null, lignes: [], sousTotalCents: 0, optionsCents: 0 }];

  return (
    <div
      data-plein-page
      className="editeur-devis signal-ao flex flex-col bg-page lg:h-full lg:overflow-hidden"
    >
      <BarreDevis
        entete={entete}
        base={base}
        affaires={affaires}
        clients={clients}
        enCours={enCours}
        agir={agir}
        onPublier={() => setOnglet("publier")}
        onRevision={() =>
          agir(async () => {
            const r = await nouvelleRevision(entete.id);
            router.push(`${base}/${r.id}`);
          })
        }
        onDupliquer={() =>
          agir(async () => {
            const r = await dupliquerDevis(entete.id);
            router.push(`${base}/${r.id}`);
          })
        }
        onSupprime={() =>
          agir(async () => {
            await supprimerDevis(entete.id);
            router.push(base);
          })
        }
      />

      {/* La barre de totaux est rendue ICI dans le DOM (elle suit l'identité au
          téléphone, où elle se colle en haut), et renvoyée EN BAS au bureau par
          `lg:order-last`. Une seule instance, deux places. */}
      <BarreTotaux
        totaux={totaux}
        entete={entetePeinte}
        enCours={enCours}
        majLe={entete.updatedAt}
        onNegocier={() => setOnglet("negocier")}
      />

      {erreur && (
        <p className="shrink-0 border-b border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
          {erreur}
        </p>
      )}

      {/* Le bandeau de fraîcheur : la seule fois où le référentiel reprend la
          parole — et il PROPOSE, il n'applique pas. */}
      {totaux.nbPerimees > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-warning/40 bg-warning/10 px-4 py-2 text-sm">
          <Clock className="h-4 w-4 shrink-0 text-warning" />
          <span className="text-fg">
            <strong>{totaux.nbPerimees}</strong> ligne{totaux.nbPerimees > 1 ? "s ont" : " a"} un
            prix d&apos;achat plus récent au magasin.
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={enCours}
            onClick={() => agir(() => rafraichirLignes(entete.id))}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Tout rafraîchir
          </Button>
        </div>
      )}

      {/* Le corps : rail · tableau · panneau. Seul le tableau défile. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 lg:flex-row">
        <RailLots
          lots={groupes}
          ouvert={railEpingle || railSurvol}
          epingle={railEpingle}
          onSurvol={() => setRailSurvol(true)}
          onSortie={() => setRailSurvol(false)}
          onEpingler={() => ecrireRailEpingle(!railEpingle)}
          devisId={entete.id}
          titresExistants={lots.map((l) => l.titre)}
          enCours={enCours}
          agir={agir}
        />

        {/* Le conteneur porte les variables de largeur de colonnes. */}
        <div
          {...colonnes.conteneur}
          className="bloc flex min-w-0 flex-1 flex-col lg:overflow-hidden"
        >
          <div className="bloc-entete shrink-0">
            <span className="font-mono text-xs tabular-nums text-muted">
              {totaux.nbLignes} ligne{totaux.nbLignes > 1 ? "s" : ""}
            </span>
            {totaux.nbOptions > 0 && (
              <span className="stamp">dont {totaux.nbOptions} en option</span>
            )}
            <span className="ml-auto flex shrink-0 items-center gap-3">
              <ReglageColonnes api={colonnes} />
            </span>
          </div>

          {/* LE SEUL DÉFILEMENT DE L'ÉCRAN. */}
          <div className="min-w-0 flex-1 overflow-auto">
            <table className="data-table data-table--form data-table--reglable table-cards ed-table">
              <ColgroupColonnes colonnes={colonnes.visibles} />
              <EnteteColonnes colonnes={colonnes.visibles} api={colonnes} />
              <tbody>
                {groupes.map((lot, rang) => (
                  <BlocLot
                    key={lot.lot?.id ?? "hors-lot"}
                    rang={rang}
                    devisId={entete.id}
                    lot={lot}
                    replie={!!lot.lot && replies.has(lot.lot.id)}
                    onBascule={() => lot.lot && basculerLot(lot.lot.id)}
                    colonnes={colonnes.visibles}
                    prestations={prestations}
                    enCours={enCours}
                    agir={agir}
                    dragId={dragId}
                    surLigne={surLigne}
                    setSurLigne={setSurLigne}
                    deposer={deposer}
                    texteNeuf={texteNeuf}
                    setTexteNeuf={setTexteNeuf}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <PiedTable
            devisId={entete.id}
            titresExistants={lots.map((l) => l.titre)}
            chantierId={entete.chantierId}
            enCours={enCours}
            agir={agir}
            onReprise={() => setReprise(true)}
          />
        </div>

        <Panneau
          onglet={onglet}
          setOnglet={setOnglet}
          fil={fil}
          moiId={moiId}
          moiNom={moiNom}
          entete={entetePeinte}
          totaux={totaux}
          charge={charge}
          enCours={enCours}
          agir={agir}
          onRetirerRemise={retirerRemise}
          base={base}
        />
      </div>

      {reprise && entete.chantierId && (
        <div className="shrink-0 px-3 pb-3">
          <RepriseBom
            devisId={entete.id}
            chantierId={entete.chantierId}
            chantierNom={entete.chantierNom ?? "l'affaire"}
            onFerme={() => setReprise(false)}
            onFini={() => setReprise(false)}
          />
        </div>
      )}
    </div>
  );
}

/* -----------------------------------------------------------------------------
 * LA BARRE DE DEVIS — identité, paramètres, sortie du document
 *
 * Elle ne porte AUCUN total : les paramètres qui entrent dans le calcul (coef,
 * TVA) sont ici parce qu'on les règle une fois ; le résultat est en bas.
 * -------------------------------------------------------------------------- */

function BarreDevis({
  entete,
  base,
  affaires,
  clients,
  enCours,
  agir,
  onPublier,
  onRevision,
  onDupliquer,
  onSupprime,
}: {
  entete: DevisComplet["entete"];
  base: string;
  affaires: AffaireChoix[];
  clients: string[];
  enCours: boolean;
  agir: (fn: () => Promise<unknown>) => void;
  onPublier: () => void;
  onRevision: () => void;
  onDupliquer: () => void;
  onSupprime: () => void;
}) {
  const [titre, setTitre] = useState(entete.titre);
  const [clientNom, setClientNom] = useState(entete.clientNom);
  const affaire = affaires.find((a) => a.id === entete.chantierId);

  return (
    <header className="relative z-30 shrink-0 border-b border-hairline bg-surface">
      <span aria-hidden className="rule-signal absolute inset-x-0 top-0 h-[2px]" />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        {/* Au téléphone l'identité prend sa propre ligne : coincée à côté des
            pastilles, elle ne leur laissait pas de quoi se poser. */}
        <div className="flex w-full min-w-0 items-center gap-2 lg:w-[19rem]">
          <Link
            href={base}
            title="Les devis"
            className="group -ml-1 flex h-8 w-6 shrink-0 items-center justify-center text-muted transition-colors hover:text-fg"
          >
            <ChevronLeft className="h-4.5 w-4.5 transition-transform duration-150 group-hover:-translate-x-0.5" />
          </Link>

          {/* Identité : le numéro, l'état, l'objet. */}
          <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="ref font-display text-lg font-bold leading-none tracking-[-0.01em] text-fg">
              {libelleDevis(entete.numero, entete.revision)}
            </h1>
            {entete.parentId && (
              <Link
                href={`${base}/${entete.parentId}`}
                title="Révision précédente"
                className="inline-flex items-center gap-1 text-xs text-muted hover:text-brand"
              >
                <GitBranch className="h-3 w-3" /> v{entete.revision - 1}
              </Link>
            )}
          </div>
          <input
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            onBlur={() => {
              if (titre !== entete.titre) agir(() => majEnteteDevis(entete.id, { titre }));
            }}
            placeholder="Objet du devis"
            className="champ-inline mt-0.5 w-full max-w-md text-sm text-muted focus:text-fg"
            title="Objet du devis — modifiable"
            aria-label="Objet du devis"
          />
          </div>
        </div>

        {/* Le cycle de vie, en clair : où en est ce devis, et quel est le pas
            suivant. C'est la décision la plus lourde de l'écran — elle ne peut
            pas être un menu déroulant de six millimètres. */}
        <CycleEtat entete={entete} enCours={enCours} agir={agir} />

        <span aria-hidden className="hidden h-8 w-px shrink-0 bg-hairline lg:block" />

        {/* Les paramètres en pastilles : un clic ouvre le champ, sur place. */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <Pastille
            libelle="Client"
            valeur={entete.clientNom}
            vide="Sans client"
            large
            contenu={
              <Combobox
                value={clientNom}
                onInput={setClientNom}
                onPick={(o) => {
                  setClientNom(o.value);
                  if (o.value !== entete.clientNom) {
                    agir(() => majEnteteDevis(entete.id, { clientNom: o.value }));
                  }
                }}
                onBlur={(saisie) => {
                  if (saisie.trim() && saisie !== entete.clientNom) {
                    agir(() => majEnteteDevis(entete.id, { clientNom: saisie }));
                  }
                }}
                options={clients.map((c) => ({ value: c }))}
                placeholder="Nom du client"
                inputClassName="h-[var(--control-h)]"
              />
            }
          />

          {/* L'affaire et son n° Why : c'est SOUS ce numéro que le devis est
              appelé au téléphone. Il s'affiche donc dans la pastille, en mono,
              à côté du nom — et non caché dans le panneau qui l'ouvre. */}
          <Pastille
            libelle="Affaire"
            valeur={affaire ? affaire.nom : ""}
            marque={entete.numeroWhy ?? undefined}
            vide="Rattacher à une affaire"
            large
            contenu={
              <>
                <Label htmlFor="ed-affaire">Affaire de rattachement</Label>
                <select
                  id="ed-affaire"
                  value={entete.chantierId ?? ""}
                  disabled={enCours}
                  onChange={(e) =>
                    agir(() =>
                      majEnteteDevis(entete.id, { chantierId: e.target.value || null }),
                    )
                  }
                  className="mt-1 h-[var(--control-h)] w-full rounded-md border border-border bg-surface px-2 text-sm text-fg focus:border-brand focus:outline-none"
                >
                  <option value="">— Sans affaire —</option>
                  {affaires.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nom} {a.numeroWhy ? `(${a.numeroWhy})` : ""}
                    </option>
                  ))}
                </select>

                <div className="mt-2.5 flex items-baseline justify-between gap-2 border-t border-hairline pt-2">
                  <span className="stamp">N° Why</span>
                  <span className="ref text-sm font-semibold text-fg">
                    {entete.numeroWhy ?? <span className="text-subtle">—</span>}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-snug text-subtle">
                  {entete.chantierId
                    ? "Il suit l'affaire : c'est là qu'il se corrige."
                    : "Rattacher une affaire renseigne le n° Why et ouvre la reprise de son matériel."}
                </p>
                {entete.chantierId && (
                  <Link
                    href={`/affaires/${entete.chantierId}`}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
                  >
                    Ouvrir la fiche affaire
                  </Link>
                )}
              </>
            }
          />

          <Pastille
            libelle="Coef"
            valeur={formatCoef(entete.coefDefautMillieme)}
            contenu={
              <ChampReglage
                label="Coefficient par défaut"
                aide="S'applique aux articles sans règle propre. Chaque ligne peut le forcer. Figé sur ce devis."
                valeur={formatCoef(entete.coefDefautMillieme)}
                disabled={enCours}
                onValide={(v) => {
                  const c = parseCoef(v);
                  if (c === null) return "Coefficient illisible";
                  agir(() => majEnteteDevis(entete.id, { coefDefautMillieme: c }));
                  return null;
                }}
              />
            }
          />

          <Pastille
            libelle="TVA"
            valeur={formatPourcent(entete.tauxTvaCentieme)}
            contenu={
              <ChoixTva
                valeur={entete.tauxTvaCentieme}
                disabled={enCours}
                onChoisir={(t) => agir(() => majEnteteDevis(entete.id, { tauxTvaCentieme: t }))}
              />
            }
          />

          <Pastille
            libelle="Validité"
            valeur={`${entete.validiteJours} j`}
            contenu={
              <ChampReglage
                label="Validité de l'offre, en jours"
                aide="Cale aussi la durée par défaut du lien envoyé au client."
                valeur={`${entete.validiteJours}`}
                disabled={enCours}
                onValide={(v) => {
                  const n = Number(v.replace(/[^\d]/g, ""));
                  if (!Number.isFinite(n) || n <= 0) return "Nombre de jours illisible";
                  agir(() => majEnteteDevis(entete.id, { validiteJours: n }));
                  return null;
                }}
              />
            }
          />
        </div>

        {/* Sortie du document. */}
        <div className="flex w-full shrink-0 items-center justify-end gap-2 lg:w-auto">
          <Link
            href={`${base}/${entete.id}/apercu`}
            className="press inline-flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg transition-[background-color,border-color] duration-150 hover:border-brand/45 hover:bg-surface-2"
          >
            Aperçu client
          </Link>
          <Button size="sm" onClick={onPublier}>
            Publier
          </Button>
          <MenuDocument
            entete={entete}
            enCours={enCours}
            onRevision={onRevision}
            onDupliquer={onDupliquer}
            onSupprime={onSupprime}
          />
        </div>
      </div>
    </header>
  );
}

/**
 * LE CYCLE DE VIE — chiffré, envoyé, répondu.
 *
 * Trois jalons sur une piste, le courant allumé, ceux qui sont derrière
 * marqués comme franchis. Le jalon SUIVANT est un bouton en clair : c'est le
 * geste, et il se lit de loin. Le refus n'est pas sur le chemin — il sort par
 * le côté, comme dans la vraie vie d'un devis.
 *
 * La couleur ne porte jamais l'information seule : chaque jalon garde son
 * libellé, et la LED ne fait que la redoubler.
 */
function CycleEtat({
  entete,
  enCours,
  agir,
}: {
  entete: DevisComplet["entete"];
  enCours: boolean;
  agir: (fn: () => Promise<unknown>) => void;
}) {
  const refuse = entete.etat === "REFUSE";
  const rang = refuse ? PISTE_ETAT.indexOf("EMIS") : PISTE_ETAT.indexOf(entete.etat);

  function poser(e: EtatDevis) {
    if (e === entete.etat) return;
    agir(() => majEnteteDevis(entete.id, { etat: e }));
  }

  return (
    /* Au téléphone le cycle prend sa propre rangée : partagée avec les
       pastilles de paramètres, il ne leur laissait que soixante pixels et
       elles sortaient de l'écran par la droite. */
    <div className="flex w-full min-w-0 shrink-0 flex-wrap items-center gap-1.5 lg:w-auto">
      <div className="flex items-center border border-border bg-surface">
        {PISTE_ETAT.map((e, i) => {
          const courant = !refuse && e === entete.etat;
          const franchi = i < rang || (refuse && i <= rang);
          return (
            <button
              key={e}
              type="button"
              disabled={enCours}
              onClick={() => poser(e)}
              title={ETAT_DEVIS_AIDE[e]}
              aria-current={courant ? "step" : undefined}
              className={cn(
                "flex items-center gap-1.5 border-r border-hairline px-2.5 py-1.5 text-xs transition-colors last:border-r-0",
                TON_ETAT[e].signal,
                courant
                  ? cn("bg-surface-2 font-semibold", TON_ETAT[e].texte)
                  : franchi
                    ? "text-muted hover:bg-surface-2"
                    : "text-subtle hover:bg-surface-2 hover:text-fg",
              )}
            >
              <span
                aria-hidden
                className={cn("led", courant ? "led-cur" : franchi ? "led-on" : "led-na")}
              />
              {ETAT_DEVIS_LABEL[e]}
            </button>
          );
        })}
      </div>

      {/* Le refus : réel, mais hors du chemin. Une fois posé, il prend la
          parole — c'est l'état du devis, pas une note de bas de page. */}
      {refuse ? (
        <span className="signal-accent inline-flex items-center gap-1.5 border border-danger/40 bg-danger/10 px-2.5 py-1.5 text-xs font-semibold text-danger">
          <span aria-hidden className="led led-on" />
          {ETAT_DEVIS_LABEL.REFUSE}
          <button
            type="button"
            disabled={enCours}
            onClick={() => poser("EMIS")}
            title="Revenir à « Émis » — le client s'est ravisé"
            className="press ml-0.5 text-danger/70 transition-colors hover:text-danger"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ) : (
        <button
          type="button"
          disabled={enCours}
          onClick={() => poser("REFUSE")}
          title={ETAT_DEVIS_AIDE.REFUSE}
          className="press border border-dashed border-border px-2 py-1.5 text-xs text-subtle transition-colors hover:border-danger/50 hover:text-danger"
        >
          Refusé
        </button>
      )}
    </div>
  );
}

/**
 * Une pastille de paramètre : elle AFFICHE la valeur et l'ouvre au clic.
 * Un pavé de champs permanent (le cartouche d'avant) prenait quatre lignes en
 * haut d'écran pour des réglages qu'on pose une fois.
 */
function Pastille({
  libelle,
  valeur,
  vide,
  contenu,
  large,
  marque,
}: {
  libelle: string;
  valeur: string;
  vide?: string;
  contenu: React.ReactNode;
  large?: boolean;
  /** Une référence technique à afficher DANS la pastille, en mono (n° Why). */
  marque?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const boite = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ouvert) return;
    function dehors(e: MouseEvent) {
      if (boite.current && !boite.current.contains(e.target as Node)) setOuvert(false);
    }
    function clavier(e: KeyboardEvent) {
      if (e.key === "Escape") setOuvert(false);
    }
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", clavier);
    return () => {
      document.removeEventListener("mousedown", dehors);
      document.removeEventListener("keydown", clavier);
    };
  }, [ouvert]);

  const renseigne = valeur.trim().length > 0;

  return (
    <div ref={boite} className="relative">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        className={cn(
          "press inline-flex max-w-full items-center gap-1.5 border px-2 py-1 text-xs transition-colors lg:max-w-[14rem]",
          renseigne
            ? "border-border bg-surface-2 text-fg hover:border-brand/45"
            : "border-dashed border-border bg-surface text-subtle hover:border-brand/45 hover:text-muted",
        )}
      >
        <span className="stamp shrink-0">{libelle}</span>
        <span className="min-w-0 truncate">{renseigne ? valeur : (vide ?? "—")}</span>
        {marque && (
          <span className="ref shrink-0 border-l border-hairline pl-1.5 text-accent">
            {marque}
          </span>
        )}
        <ChevronDown className="h-3 w-3 shrink-0 text-subtle" />
      </button>

      {ouvert && (
        <div
          className={cn(
            "absolute left-0 top-[calc(100%+0.35rem)] z-50 border border-border bg-surface p-3 shadow-lg",
            large ? "w-72" : "w-56",
          )}
        >
          {contenu}
        </div>
      )}
    </div>
  );
}

/** Ce qui ne se fait qu'une fois — hors du chemin de la saisie. */
function MenuDocument({
  entete,
  enCours,
  onRevision,
  onDupliquer,
  onSupprime,
}: {
  entete: DevisComplet["entete"];
  enCours: boolean;
  onRevision: () => void;
  onDupliquer: () => void;
  onSupprime: () => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [confirme, setConfirme] = useState(false);
  const boite = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ouvert) return;
    function dehors(e: MouseEvent) {
      if (boite.current && !boite.current.contains(e.target as Node)) {
        setOuvert(false);
        setConfirme(false);
      }
    }
    function clavier(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOuvert(false);
        setConfirme(false);
      }
    }
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", clavier);
    return () => {
      document.removeEventListener("mousedown", dehors);
      document.removeEventListener("keydown", clavier);
    };
  }, [ouvert]);

  return (
    <div ref={boite} className="relative">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        title="Le document"
        aria-label="Le document"
        className="press flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted transition-colors hover:border-brand/45 hover:text-fg"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {ouvert && (
        <div className="absolute right-0 top-[calc(100%+0.35rem)] z-50 w-64 border border-border bg-surface py-1 shadow-lg">
          <p className="stamp px-3 py-1.5">Le document</p>
          {/* Deux gestes voisins qu'il ne faut pas confondre : la révision
              poursuit CE devis (même numéro, chaînée) ; la copie en ouvre un
              autre (nouveau numéro, aucun lien). */}
          <button
            disabled={enCours}
            onClick={onRevision}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-fg hover:bg-surface-2"
          >
            <GitBranch className="h-4 w-4 shrink-0 text-subtle" /> Nouvelle révision
          </button>
          <button
            disabled={enCours}
            onClick={onDupliquer}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-fg hover:bg-surface-2"
          >
            <CopyIcon className="h-4 w-4 shrink-0 text-subtle" /> Dupliquer — nouveau devis
          </button>

          <div className="border-t border-hairline pt-1">
            {confirme ? (
              <div className="px-3 py-2">
                <p className="mb-2 text-sm text-fg">
                  Supprimer {libelleDevis(entete.numero, entete.revision)} ?
                </p>
                <div className="flex gap-2">
                  <Button variant="danger" size="sm" onClick={onSupprime} disabled={enCours}>
                    Supprimer
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirme(false)}>
                    Annuler
                  </Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirme(true)}
                disabled={enCours}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
              >
                <Trash2 className="h-4 w-4 shrink-0" /> Supprimer ce devis
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* -----------------------------------------------------------------------------
 * LE RAIL DE LOTS — navigation ET sous-totaux au même endroit
 * -------------------------------------------------------------------------- */

function RailLots({
  lots,
  ouvert,
  epingle,
  onSurvol,
  onSortie,
  onEpingler,
  devisId,
  titresExistants,
  enCours,
  agir,
}: {
  lots: LotCalcule[];
  /** Déployé — par le survol, ou parce qu'il est épinglé. */
  ouvert: boolean;
  /** Fixé ouvert : il reprend alors sa place dans le flux. */
  epingle: boolean;
  onSurvol: () => void;
  onSortie: () => void;
  onEpingler: () => void;
  devisId: string;
  titresExistants: string[];
  enCours: boolean;
  agir: (fn: () => Promise<unknown>) => void;
}) {
  const [saisie, setSaisie] = useState<string | null>(null);

  /**
   * Sauter à un lot depuis le panneau flottant, ET fixer le rail.
   *
   * Un panneau de survol qui se referme dès qu'on a cliqué dedans laisse
   * revenir le curseur sur un rail replié : on venait de choisir un lot, on
   * n'a plus rien pour choisir le suivant. Cliquer un lot est donc le geste
   * qui dit « je travaille avec cette liste » — le rail s'installe.
   *
   * ⚠️ Le défilement est repoussé APRÈS le rendu : l'épinglage fait passer le
   * rail de 36 à 160 px, le tableau se remet en page, et un `scrollIntoView`
   * lancé avant viserait la position d'avant.
   */
  function ouvrirLot(id: string | null) {
    if (!epingle) onEpingler();
    requestAnimationFrame(() => {
      document
        .getElementById(`ed-lot-${id ?? "hors-lot"}`)
        ?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }

  /* Tant qu'on saisit le nom d'un nouveau lot, le panneau tient — sortir la
     souris pour aller au clavier ne doit pas effacer ce qu'on est en train
     d'écrire. C'est le seul geste du panneau qui n'épingle PAS le rail : on
     crée un lot en passant, on ne s'installe pas pour autant. */
  const deploye = epingle || ouvert || saisie !== null;

  /* --- Replié au repos, ouvert au survol, épinglable ------------------------
   * Le rail donne 160 px de large à trois cartes qu'on ne consulte que pour
   * sauter d'un lot à l'autre : au repos il rend cette largeur au tableau.
   *
   * ⚠️ Au survol il s'ouvre EN SURIMPRESSION, jamais en poussant le tableau —
   * sinon la table se redessine sous le curseur au moment précis où l'on passe
   * à côté, et les colonnes sautent. C'est le seul endroit du plan de travail
   * où une ombre est permise : le rail survole vraiment, il ne s'y pose pas
   * (voir la règle des ombres, CLAUDE.md).
   *
   * Épinglé, il reprend sa place dans le flux et la table se range à côté.  */
  const corps = (
    <>
      <div className="flex items-center gap-2 px-0.5">
        <span className="stamp">Lots</span>
        <span aria-hidden className="h-px flex-1 bg-hairline" />
        <button
          type="button"
          onClick={onEpingler}
          aria-pressed={epingle}
          title={epingle ? "Détacher le rail (il se repliera)" : "Garder le rail ouvert"}
          className={cn(
            "press transition-colors",
            epingle ? "text-brand" : "text-subtle hover:text-fg",
          )}
        >
          {epingle ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
        {lots.map((l, rang) => (
          <button
            key={l.lot?.id ?? "hors-lot"}
            type="button"
            onClick={() => ouvrirLot(l.lot?.id ?? null)}
            className="bloc min-w-40 shrink-0 px-2.5 py-2 text-left transition-colors hover:border-brand/45 hover:bg-surface-2 lg:min-w-0"
          >
            <span className="flex items-center gap-1.5">
              <span aria-hidden className={cn("ed-puce", signalLot(rang))} />
              <span className="min-w-0 flex-1 truncate font-display text-xs font-semibold text-fg">
                {l.lot?.titre ?? "Hors lot"}
              </span>
            </span>
            <span className="mt-0.5 block text-[0.68rem] text-subtle">
              {l.lignes.length} ligne{l.lignes.length > 1 ? "s" : ""}
              {l.optionsCents > 0 && " · options"}
            </span>
            <span className="ref mt-0.5 block text-sm font-semibold text-fg">
              {formatEuros(l.sousTotalCents)}
            </span>
          </button>
        ))}

        {saisie === null ? (
          <button
            type="button"
            onClick={() => setSaisie("")}
            className="flex min-w-40 shrink-0 items-center justify-center gap-1.5 border border-dashed border-border px-2.5 py-2 text-xs text-muted transition-colors hover:border-brand/45 hover:text-fg lg:min-w-0"
          >
            <FolderPlus className="h-3.5 w-3.5" /> Nouveau lot
          </button>
        ) : (
          <div className="min-w-40 shrink-0 border border-border p-2 lg:min-w-0">
            <Input
              autoFocus
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              placeholder="Armoire, Bâtiment A…"
              className="h-8 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && saisie.trim()) {
                  agir(() => ajouterLot(devisId, saisie.trim()));
                  setSaisie(null);
                }
                if (e.key === "Escape") setSaisie(null);
              }}
            />
            <div className="mt-1.5 flex gap-1.5">
              <Button
                size="sm"
                disabled={enCours || !saisie.trim()}
                onClick={() => {
                  agir(() => ajouterLot(devisId, saisie.trim()));
                  setSaisie(null);
                }}
              >
                Créer
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSaisie(null)}>
                Annuler
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Les raccourcis qui existent VRAIMENT. En annoncer d'autres serait pire
          que de n'en annoncer aucun. */}
      <div className="mt-auto hidden border border-border px-2.5 py-2 lg:block">
        <p className="stamp mb-1.5">Raccourcis</p>
        {[
          ["Choisir", "↑ ↓"],
          ["Ajouter", "⏎"],
          ["Annuler", "Échap"],
        ].map(([quoi, touche]) => (
          <p key={quoi} className="flex items-center justify-between py-0.5 text-[0.7rem] text-muted">
            {quoi} <Kbd>{touche}</Kbd>
          </p>
        ))}
      </div>

      {titresExistants.length === 0 && (
        <p className="hidden text-[0.7rem] leading-snug text-subtle lg:block">
          Un devis sans lot fonctionne : les lignes se posent « hors lot ».
        </p>
      )}
    </>
  );

  /* Au téléphone il n'y a ni survol ni place à rendre : le rail est une bande
     de cartes qui défile, toujours là. */
  return (
    <>
      <aside className="flex shrink-0 flex-col gap-2 lg:hidden">{corps}</aside>

      <div
        className={cn(
          "relative hidden shrink-0 lg:block",
          epingle ? "lg:w-40 xl:w-44" : "lg:w-9",
        )}
        onMouseEnter={onSurvol}
        onMouseLeave={onSortie}
      >
        {/* La tranche : ce qu'on voit quand le rail dort. Elle porte les
            pastilles des lots — de loin, on sait déjà combien il y en a. */}
        {!epingle && (
          <button
            type="button"
            onClick={onEpingler}
            title="Les lots — survoler pour ouvrir, cliquer pour épingler"
            className="bloc flex h-full w-9 flex-col items-center gap-2 py-3 text-muted transition-colors hover:text-fg"
          >
            <ChevronRight className="h-4 w-4 shrink-0" />
            <span className="flex flex-col items-center gap-1.5">
              {lots.map((l, rang) => (
                <span
                  key={l.lot?.id ?? "hors-lot"}
                  aria-hidden
                  className={cn("ed-puce", signalLot(rang))}
                />
              ))}
            </span>
            <span className="stamp mt-1 [writing-mode:vertical-rl]">Lots</span>
          </button>
        )}

        {deploye && (
          <aside
            className={cn(
              "flex flex-col gap-2",
              epingle
                ? "h-full overflow-y-auto overscroll-contain"
                : // En surimpression : le tableau ne bouge pas d'un pixel.
                  "absolute left-0 top-0 z-40 max-h-[min(32rem,100%)] w-44 overflow-y-auto overscroll-contain border border-border bg-page p-2 shadow-lg",
            )}
          >
            {corps}
          </aside>
        )}
      </div>
    </>
  );
}

/* -----------------------------------------------------------------------------
 * UN LOT DANS LE TABLEAU — un entête collant, ses lignes, sa ligne de saisie
 * -------------------------------------------------------------------------- */

function BlocLot({
  rang,
  devisId,
  lot,
  replie,
  onBascule,
  colonnes,
  prestations,
  enCours,
  agir,
  dragId,
  surLigne,
  setSurLigne,
  deposer,
  texteNeuf,
  setTexteNeuf,
}: {
  rang: number;
  devisId: string;
  lot: LotCalcule;
  replie: boolean;
  onBascule: () => void;
  colonnes: ColonneReglee[];
  prestations: PrestationVue[];
  enCours: boolean;
  agir: (fn: () => Promise<unknown>) => void;
  dragId: React.RefObject<string | null>;
  surLigne: string | null;
  setSurLigne: (id: string | null) => void;
  deposer: (lotCible: string | null, cibleId: string | null) => void;
  texteNeuf: string | null;
  setTexteNeuf: (id: string) => void;
}) {
  const [titre, setTitre] = useState(lot.lot?.titre ?? "");
  const lotId = lot.lot?.id ?? null;
  const n = Math.max(1, colonnes.length);
  // Le compte annoncé est celui des lignes qui PÈSENT dans le sous-total.
  const nbComptees = lot.lignes.filter(
    (l) => !l.ligne.option && ligneChiffree(l.ligne.genre),
  ).length;

  return (
    <>
      <tr id={`ed-lot-${lotId ?? "hors-lot"}`} className="ed-lot">
        <td colSpan={n} className="ed-cell-pleine">
          <span className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onBascule}
              disabled={!lot.lot}
              title={replie ? "Déplier le lot" : "Replier le lot"}
              className="flex h-5 w-5 shrink-0 items-center justify-center text-subtle transition-colors hover:text-fg disabled:opacity-40"
            >
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", replie && "-rotate-90")}
              />
            </button>
            <span aria-hidden className={cn("ed-puce", signalLot(rang))} />
            {lot.lot ? (
              <input
                value={titre}
                onChange={(e) => setTitre(e.target.value)}
                onBlur={() => {
                  if (titre !== lot.lot!.titre) agir(() => majLot(lot.lot!.id, { titre }));
                }}
                className="champ-inline w-44 font-display text-sm font-semibold text-fg"
                title="Nom du lot — modifiable"
                aria-label="Nom du lot"
              />
            ) : (
              <span className="font-display text-sm font-semibold text-muted">Hors lot</span>
            )}
            <span className="stamp shrink-0">
              {nbComptees} ligne{nbComptees > 1 ? "s" : ""}
              {lot.optionsCents > 0 && ` · + ${formatEuros(lot.optionsCents)} en option`}
            </span>

            <span className="ml-auto flex shrink-0 items-center gap-2">
              <span className="ref text-sm font-semibold text-fg">
                {formatEuros(lot.sousTotalCents)}
              </span>
              {lot.lot && (
                <span className="actions-rangee flex items-center gap-0.5">
                  <button
                    title="Monter le lot"
                    disabled={enCours}
                    onClick={() => agir(() => deplacerLot(lot.lot!.id, "haut"))}
                    className="p-0.5 text-subtle transition-colors hover:text-fg"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    title="Descendre le lot"
                    disabled={enCours}
                    onClick={() => agir(() => deplacerLot(lot.lot!.id, "bas"))}
                    className="p-0.5 text-subtle transition-colors hover:text-fg"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    title="Supprimer le lot (les lignes sont conservées, hors lot)"
                    disabled={enCours}
                    onClick={() => agir(() => supprimerLot(lot.lot!.id))}
                    className="p-0.5 text-subtle transition-colors hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              )}
            </span>
          </span>
        </td>
      </tr>

      {!replie &&
        lot.lignes.map((lc) => (
          <LigneTableau
            key={lc.ligne.id}
            lc={lc}
            devisId={devisId}
            colonnes={colonnes}
            enCours={enCours}
            agir={agir}
            survolee={surLigne === lc.ligne.id}
            ouvrirTexte={texteNeuf === lc.ligne.id}
            onDragStart={() => (dragId.current = lc.ligne.id)}
            onDragOver={(e) => {
              e.preventDefault();
              setSurLigne(lc.ligne.id);
            }}
            onDragLeave={() => setSurLigne(null)}
            onDrop={() => deposer(lotId, lc.ligne.id)}
          />
        ))}

      {!replie && (
        <RangeeSaisie
          colSpan={n}
          devisId={devisId}
          lotId={lotId}
          prestations={prestations}
          enCours={enCours}
          agir={agir}
          onTexteCree={setTexteNeuf}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => deposer(lotId, null)}
        />
      )}
    </>
  );
}

/* -----------------------------------------------------------------------------
 * LA LIGNE DE SAISIE — au bas de son lot, TOUJOURS OUVERTE
 *
 * Un seul champ qui cherche EN MÊME TEMPS dans les articles du magasin et dans
 * les prestations, plus deux raccourcis pour le « divers » et le commentaire.
 * -------------------------------------------------------------------------- */

function RangeeSaisie({
  colSpan,
  devisId,
  lotId,
  prestations,
  enCours,
  agir,
  onTexteCree,
  onDragOver,
  onDrop,
}: {
  colSpan: number;
  devisId: string;
  lotId: string | null;
  prestations: PrestationVue[];
  enCours: boolean;
  agir: (fn: () => Promise<unknown>) => void;
  onTexteCree: (ligneId: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
}) {
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const [articles, setArticles] = useState<ArticleChoix[]>([]);
  const [cherche, setCherche] = useState(false);
  const [propose, setPropose] = useState<{
    article: ArticleChoix;
    associations: AssociationVue[];
  } | null>(null);
  const jeton = useRef(0);
  const [actif, setActif] = useState(0);

  const prestationsFiltrees = useMemo(() => {
    const f = q.trim().toLowerCase();
    if (!f) return [];
    return prestations
      .filter(
        (p) =>
          p.actif &&
          (p.libelle.toLowerCase().includes(f) || p.famille.toLowerCase().includes(f)),
      )
      .slice(0, 6);
  }, [prestations, q]);

  async function chercher(valeur: string) {
    setQ(valeur);
    setActif(0);
    const monJeton = ++jeton.current;
    if (valeur.trim().length < 2) {
      setArticles([]);
      return;
    }
    setCherche(true);
    try {
      const res = await fetch(`/api/devis/articles?q=${encodeURIComponent(valeur)}`);
      const data = (await res.json()) as ArticleChoix[];
      // Réponse d'une frappe précédente : on la jette, sinon la liste
      // « remonte » le temps quand le réseau est lent.
      if (monJeton === jeton.current) setArticles(data);
    } catch {
      if (monJeton === jeton.current) setArticles([]);
    } finally {
      if (monJeton === jeton.current) setCherche(false);
    }
  }

  // La ligne de saisie reste en place après un ajout : on enchaîne.
  function apresAjout() {
    setQ("");
    setArticles([]);
    setPropose(null);
  }

  function ajouterPrestation(p: PrestationVue) {
    agir(async () => {
      await ajouterLignePrestation(devisId, p.id, { lotId });
      apresAjout();
    });
  }

  /**
   * Clic sur un article. On interroge ses ASSOCIATIONS avant de rien poser :
   * aucune → on ajoute tout de suite ; au moins une → on ouvre la proposition,
   * et RIEN n'est ajouté tant qu'on n'a pas validé.
   */
  function choisirArticle(a: ArticleChoix) {
    agir(async () => {
      let assocs: AssociationVue[] = [];
      try {
        const res = await fetch(
          `/api/devis/associations?produitId=${encodeURIComponent(a.produitId)}`,
        );
        if (res.ok) assocs = (await res.json()) as AssociationVue[];
      } catch {
        assocs = [];
      }
      if (assocs.length === 0) {
        await ajouterLigneProduit(devisId, a.produitId, { lotId });
        apresAjout();
        return;
      }
      setPropose({ article: a, associations: assocs });
    });
  }

  /** La n-ième proposition, prestations d'abord puis articles. */
  function lancer(i: number) {
    if (propose || i < 0) return;
    if (i < prestationsFiltrees.length) {
      ajouterPrestation(prestationsFiltrees[i]);
      return;
    }
    const a = articles[i - prestationsFiltrees.length];
    if (a) choisirArticle(a);
  }

  const total = prestationsFiltrees.length + articles.length;
  const listeVisible = focus && (q.trim().length > 0 || total > 0);

  return (
    <>
      <tr className="ed-saisie" onDragOver={onDragOver} onDrop={onDrop}>
        <td colSpan={colSpan} className="ed-cell-pleine">
          <div className="flex flex-wrap items-center gap-2 px-3 py-1.5">
            <Plus className="h-3.5 w-3.5 shrink-0 text-brand" />
            <input
              value={q}
              onChange={(e) => chercher(e.target.value)}
              onFocus={() => setFocus(true)}
              onBlur={() => window.setTimeout(() => setFocus(false), 150)}
              placeholder="Désignation ou référence…"
              aria-label="Ajouter une ligne : chercher un article ou une prestation"
              className="champ-inline min-w-48 flex-1 text-sm"
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActif((a) => Math.min(a + 1, total - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActif((a) => Math.max(a - 1, 0));
                } else if (e.key === "Enter" && total > 0) {
                  e.preventDefault();
                  lancer(actif);
                } else if (e.key === "Escape") {
                  setQ("");
                  setArticles([]);
                  e.currentTarget.blur();
                }
              }}
            />
            <span aria-hidden className="hidden h-4 w-px bg-hairline sm:block" />
            <Button
              size="sm"
              variant="ghost"
              disabled={enCours}
              title="Une ligne chiffrée à la main"
              onClick={() =>
                agir(async () => {
                  await ajouterLigneLibre(devisId, {
                    genre: "LIBRE",
                    designation: q.trim() || "Divers",
                    lotId,
                  });
                  apresAjout();
                })
              }
            >
              <Plus className="h-3.5 w-3.5" /> Divers
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={enCours}
              title="Un texte libre : titres, listes, tableau, image — « / » ouvre les blocs"
              onClick={() =>
                agir(async () => {
                  const { id } = await ajouterLigneTexte(devisId, { lotId, texte: q.trim() });
                  onTexteCree(id);
                  apresAjout();
                })
              }
            >
              <Type className="h-3.5 w-3.5" /> Texte
            </Button>
          </div>
        </td>
      </tr>

      {/* La proposition d'associés, ou la liste de résultats. Jamais les deux :
          deux listes empilées, on ne sait plus laquelle répond à quoi. */}
      {propose && (
        <tr className="ed-saisie">
          <td colSpan={colSpan} className="ed-cell-pleine">
            <div className="px-3 pb-3">
              <PropositionAssocies
                article={propose.article}
                associations={propose.associations}
                enCours={enCours}
                onAnnuler={() => setPropose(null)}
                onValider={(lignes) =>
                  agir(async () => {
                    await ajouterProduitAvecAssocies(devisId, lignes, { lotId });
                    apresAjout();
                  })
                }
              />
            </div>
          </td>
        </tr>
      )}

      {!propose && listeVisible && (
        <tr className="ed-saisie">
          <td colSpan={colSpan} className="ed-cell-pleine">
            <div className="mx-3 mb-3 max-h-72 overflow-y-auto border border-border bg-surface">
              {cherche && articles.length === 0 && (
                <p className="px-3 py-2 text-sm text-subtle">Recherche…</p>
              )}
              {prestationsFiltrees.map((p, i) => (
                <button
                  key={p.id}
                  disabled={enCours}
                  ref={i === actif ? versLaVue : undefined}
                  onMouseEnter={() => setActif(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => ajouterPrestation(p)}
                  className={cn(
                    "flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left text-sm last:border-0",
                    i === actif ? "bg-brand-soft" : "hover:bg-surface-2",
                  )}
                >
                  <Wrench className="h-4 w-4 shrink-0 text-io-ao" />
                  <span className="flex-1 truncate text-fg">{p.libelle}</span>
                  <span className="hidden text-xs text-subtle sm:inline">{p.famille}</span>
                  <span className="font-semibold text-fg">
                    {formatEuros(p.prixVenteCents)}
                    <span className="ml-0.5 text-xs font-normal text-subtle">/{p.unite}</span>
                  </span>
                </button>
              ))}
              {articles.map((a, i) => {
                const rang = prestationsFiltrees.length + i;
                return (
                  <button
                    key={a.produitId}
                    disabled={enCours}
                    ref={rang === actif ? versLaVue : undefined}
                    onMouseEnter={() => setActif(rang)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choisirArticle(a)}
                    className={cn(
                      "flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left text-sm last:border-0",
                      rang === actif ? "bg-brand-soft" : "hover:bg-surface-2",
                    )}
                  >
                    <Boxes className="h-4 w-4 shrink-0 text-io-ai" />
                    <span className="ref shrink-0 text-muted">{a.refInterne}</span>
                    <span className="flex-1 truncate text-fg">{a.designation}</span>
                    {/* Le déboursé est annoncé AVANT l'ajout, et on dit d'où il
                        sort. Un article sans prix connu doit se voir ici. */}
                    {a.debourseCents === null ? (
                      <span className="inline-flex items-center gap-1 text-xs text-warning">
                        <TriangleAlert className="h-3 w-3" /> sans prix
                      </span>
                    ) : (
                      <span className="whitespace-nowrap text-muted">
                        {formatEuros(a.debourseCents)}
                        <span className="ml-1 text-xs text-subtle">
                          {a.sourcePrix === "pmp" ? "payé" : "tarif"}
                        </span>
                      </span>
                    )}
                  </button>
                );
              })}
              {!cherche && articles.length === 0 && q.trim().length >= 2 && (
                <p className="px-3 py-2 text-sm text-subtle">
                  Aucun article du magasin ne correspond — « Divers » chiffre la ligne à la
                  main.
                </p>
              )}
              {q.trim().length < 2 && total === 0 && (
                <p className="px-3 py-2 text-xs text-subtle">
                  Deux caractères pour chercher dans le magasin et les prestations.
                </p>
              )}
              {total > 0 && (
                <p className="sticky bottom-0 border-t border-border bg-surface-2 px-3 py-1 text-[0.68rem] text-subtle">
                  <Kbd>↑</Kbd> <Kbd>↓</Kbd> pour choisir · <Kbd>Entrée</Kbd> pour ajouter ·{" "}
                  <Kbd>Échap</Kbd> pour vider
                </p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* -----------------------------------------------------------------------------
 * LE PIED DU TABLEAU — les lots suggérés et la reprise de BOM
 * -------------------------------------------------------------------------- */

function PiedTable({
  devisId,
  titresExistants,
  chantierId,
  enCours,
  agir,
  onReprise,
}: {
  devisId: string;
  titresExistants: string[];
  chantierId: string | null;
  enCours: boolean;
  agir: (fn: () => Promise<unknown>) => void;
  onReprise: () => void;
}) {
  /* Un lot suggéré reste proposé TANT QU'IL N'EXISTE PAS — et non « tant que le
     devis est vide » : créer « Matériel » faisait sinon disparaître
     « Prestations » du même coup. */
  const aProposer = LOTS_SUGGERES.filter(
    (t) => !titresExistants.some((e) => e.trim().toLowerCase() === t.toLowerCase()),
  );

  if (aProposer.length === 0 && !chantierId) return null;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-hairline bg-surface-2 px-3 py-2">
      {aProposer.map((titre) => (
        <Button
          key={titre}
          size="sm"
          variant="outline"
          disabled={enCours}
          onClick={() => agir(() => ajouterLot(devisId, titre))}
        >
          <FolderPlus className="h-3.5 w-3.5" /> Lot « {titre} »
        </Button>
      ))}
      {chantierId && (
        <Button size="sm" variant="ghost" onClick={onReprise}>
          <Boxes className="h-3.5 w-3.5" /> Reprendre le matériel de l&apos;affaire
        </Button>
      )}
    </div>
  );
}

/* -----------------------------------------------------------------------------
 * UNE LIGNE
 * -------------------------------------------------------------------------- */

function LigneTableau({
  lc,
  devisId,
  colonnes,
  enCours,
  agir,
  survolee,
  ouvrirTexte,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  lc: LigneCalculee;
  devisId: string;
  colonnes: ColonneReglee[];
  enCours: boolean;
  agir: (fn: () => Promise<unknown>) => void;
  survolee: boolean;
  ouvrirTexte: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: () => void;
}) {
  const l = lc.ligne;
  const chiffree = ligneChiffree(l.genre);
  // Une rangée qu'on est en train d'écrire ne se glisse pas : sous un parent
  // `draggable`, Chrome refuse de sélectionner du texte à la souris.
  const [enEdition, setEnEdition] = useState(false);
  const dnd = {
    draggable: !enEdition,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
  };
  const liseret = survolee ? "outline outline-1 -outline-offset-1 outline-brand/50" : "";

  if (!chiffree) {
    return (
      <tr {...dnd} className={cn("bg-surface-2/40", liseret)}>
        <td className="align-top">
          <Poignee />
        </td>
        <td colSpan={Math.max(1, colonnes.length - 1)} className="cell-card-title">
          <span className="flex items-start gap-2">
            <TexteRiche
              ligneId={l.id}
              devisId={devisId}
              contenu={l.contenu}
              designation={l.designation}
              version={l.version}
              majLe={l.majLe}
              ouvertDefaut={ouvrirTexte}
              disabled={enCours}
              onEdition={setEnEdition}
            />
            <span className="shrink-0">
              <BoutonsLigne l={l} enCours={enCours} agir={agir} />
            </span>
          </span>
        </td>
      </tr>
    );
  }

  // Le coefficient se saisit dès qu'il y a un déboursé à multiplier — quel que
  // soit le genre, et MÊME s'il a été effacé par un prix de vente forcé.
  const coefSaisissable = l.debourseCents !== null;

  function cellule(c: ColonneReglee): React.ReactNode {
    switch (c.cle) {
      case "poignee":
        return <Poignee />;

      case "designation":
        return (
          <div className="flex items-start gap-2">
            <span className="mt-1 shrink-0" title={GENRE_AIDE[l.genre]}>
              {l.genre === "PRODUIT" ? (
                <Boxes className="h-3.5 w-3.5 text-io-ai" />
              ) : l.genre === "PRESTATION" ? (
                <Wrench className="h-3.5 w-3.5 text-io-ao" />
              ) : (
                <Plus className="h-3.5 w-3.5 text-subtle" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <ChampTexte
                valeur={l.designation}
                disabled={enCours}
                onValide={(v) => agir(() => majLigne(l.id, { designation: v }))}
              />
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-subtle">
                {/* La référence reste sous la désignation tant que sa colonne
                    est repliée : la sortir ne doit pas être la seule façon de
                    la voir. */}
                {l.refInterne && !colonnes.some((x) => x.cle === "ref") && (
                  <span className="ref">{l.refInterne}</span>
                )}
                {l.option && <Badge tone="accent">Option</Badge>}
                {lc.perimee && (
                  <span
                    className="inline-flex items-center gap-1 text-warning"
                    title={`Prix au magasin aujourd'hui : ${formatEuros(l.debourseActuelCents)}`}
                  >
                    <Clock className="h-3 w-3" />
                    {formatEuros(l.debourseActuelCents)} aujourd&apos;hui
                  </span>
                )}
                {l.genre === "PRODUIT" && l.debourseCents === null && (
                  <span className="inline-flex items-center gap-1 text-warning">
                    <TriangleAlert className="h-3 w-3" /> aucun prix d&apos;achat connu
                  </span>
                )}
              </div>
            </div>
          </div>
        );

      case "ref":
        return l.refInterne ? (
          <span className="ref text-muted">{l.refInterne}</span>
        ) : (
          <span className="text-subtle">—</span>
        );

      case "qte":
        return (
          <ChampCase
            valeur={formatQuantite(l.quantiteMillieme)}
            suffixe={l.unite}
            disabled={enCours}
            onValide={(v) => {
              const q = parseQuantite(v);
              if (q === null || q < 0) return "Quantité illisible";
              agir(() => majLigne(l.id, { quantiteMillieme: q }));
              return null;
            }}
          />
        );

      case "debourse":
        return (
          <ChampCase
            valeur={l.debourseCents === null ? "" : formatEuros(l.debourseCents)}
            placeholder="—"
            disabled={enCours}
            titre="Ce que l'article nous coûte. Le renseigner ouvre le calcul par coefficient."
            onValide={(v) => {
              if (v.trim() === "") {
                agir(() => majLigne(l.id, { debourseCents: null }));
                return null;
              }
              const c = parseEuros(v);
              if (c === null) return "Montant illisible";
              agir(() => majLigne(l.id, { debourseCents: c }));
              return null;
            }}
          />
        );

      case "coef":
        return (
          <>
            {coefSaisissable ? (
              <ChampCase
                valeur={l.coefMillieme === null ? "" : formatQuantite(l.coefMillieme)}
                placeholder="—"
                disabled={enCours}
                titre={
                  l.coefMillieme === null
                    ? "Prix de vente forcé — saisir un coefficient rend la ligne au calcul"
                    : ORIGINE_COEF_LABEL[l.origineCoef]
                }
                onValide={(v) => {
                  const c = parseCoef(v);
                  if (c === null) return "Coefficient illisible";
                  agir(() => majLigne(l.id, { coefMillieme: c }));
                  return null;
                }}
              />
            ) : (
              <span className="text-subtle" title={aideSansCoef(l.genre)}>
                —
              </span>
            )}
            {/* D'où vient ce coefficient — l'écran ne l'affiche JAMAIS sans le
                dire. Coupé à l'ellipse : « réglé sur la catégorie » est plus
                large que sa colonne et venait s'écrire sous le prix de vente,
                où on le lisait comme une mention de CE prix-là. */}
            <span
              title={
                l.coefMillieme === null
                  ? libelleSansCoef(l.genre)
                  : ORIGINE_COEF_LABEL[l.origineCoef]
              }
              className={cn(
                "mt-0.5 block truncate text-[0.65rem] leading-tight",
                l.origineCoef === "ligne" && l.coefMillieme !== null
                  ? "text-accent"
                  : "text-subtle",
              )}
            >
              {l.coefMillieme === null
                ? libelleSansCoef(l.genre)
                : (ORIGINE_COEF_COURT[l.origineCoef] ?? ORIGINE_COEF_LABEL[l.origineCoef])}
            </span>
          </>
        );

      case "pv":
        return (
          <ChampCase
            valeur={formatEuros(l.pvUnitaireCents)}
            disabled={enCours}
            titre="Saisir un prix ici efface le coefficient de la ligne"
            onValide={(v) => {
              const c = parseEuros(v);
              if (c === null) return "Montant illisible";
              agir(() => majLigne(l.id, { pvUnitaireCents: c }));
              return null;
            }}
          />
        );

      case "remise":
        return (
          <ChampCase
            valeur={l.remisePourMille === 0 ? "" : formatPourcent(l.remisePourMille * 10)}
            placeholder="—"
            disabled={enCours}
            onValide={(v) => {
              if (v.trim() === "") {
                agir(() => majLigne(l.id, { remisePourMille: 0 }));
                return null;
              }
              const r = parseRemise(v);
              if (r === null) return "Remise illisible (0 à 100 %)";
              agir(() => majLigne(l.id, { remisePourMille: r }));
              return null;
            }}
          />
        );

      case "total":
        return (
          <>
            {formatEuros(lc.totalCents)}
            {lc.remiseCents > 0 && (
              <span className="block text-[0.65rem] font-normal text-subtle line-through">
                {formatEuros(lc.brutCents)}
              </span>
            )}
          </>
        );

      case "actions":
        return <BoutonsLigne l={l} enCours={enCours} agir={agir} />;

      default:
        return null;
    }
  }

  return (
    <tr {...dnd} className={cn(l.option && "opacity-70", liseret)}>
      {colonnes.map((c) => (
        <td
          key={c.cle}
          data-label={labelCellule(c)}
          className={classeCellule(
            c,
            cn(
              c.cle === "designation" && "cell-title",
              c.cle === "total" && "font-semibold text-fg",
            ),
          )}
        >
          {cellule(c)}
        </td>
      ))}
    </tr>
  );
}

/** Ce que dit le pictogramme en tête de désignation. */
const GENRE_AIDE: Record<GenreLigne, string> = {
  PRODUIT: "Article du magasin",
  PRESTATION: "Main d'œuvre, au taux de vente",
  LIBRE: "Ligne libre, chiffrée à la main",
  TEXTE: "Texte libre",
};

function Poignee() {
  return (
    <span
      className="flex cursor-grab items-center justify-center text-subtle active:cursor-grabbing"
      title="Glisser pour déplacer (y compris vers un autre lot)"
    >
      <GripVertical className="h-4 w-4" />
    </span>
  );
}

/**
 * Une ligne sans coefficient n'est pas forcément une ligne « forcée » : une
 * PRESTATION n'en a pas par construction (taux de vente direct), un « divers »
 * non plus tant qu'on ne lui a pas donné de déboursé.
 */
function libelleSansCoef(genre: GenreLigne): string {
  if (genre === "PRESTATION") return "taux vendu";
  if (genre === "LIBRE") return "prix saisi";
  return "P.V. forcé";
}

function aideSansCoef(genre: GenreLigne): string {
  if (genre === "PRESTATION") return "Taux de vente du référentiel de prestations";
  if (genre === "LIBRE")
    return "Prix saisi à la main — renseigner un déboursé ouvre le coefficient";
  return "Aucun déboursé connu : il n'y a rien à multiplier";
}

function BoutonsLigne({
  l,
  enCours,
  agir,
}: {
  l: LigneDevisVue;
  enCours: boolean;
  agir: (fn: () => Promise<unknown>) => void;
}) {
  return (
    /* `.actions-rangee` : au repos les boutons s'effacent, la colonne de droite
       cesse d'être une grille de pictogrammes. Ils reviennent au survol ET au
       focus clavier — et restent visibles là où il n'y a pas de survol. */
    <span className="actions-rangee flex items-center justify-end gap-0.5">
      {/* Les flèches restent : le glisser-déposer ne marche pas au doigt. */}
      <button
        title="Monter"
        disabled={enCours}
        onClick={() => agir(() => deplacerLigne(l.id, "haut"))}
        className="p-1 text-subtle transition-colors hover:text-fg"
      >
        <ArrowUp className="h-3.5 w-3.5" />
      </button>
      <button
        title="Descendre"
        disabled={enCours}
        onClick={() => agir(() => deplacerLigne(l.id, "bas"))}
        className="p-1 text-subtle transition-colors hover:text-fg"
      >
        <ArrowDown className="h-3.5 w-3.5" />
      </button>
      {/* Dupliquer : la même sonde à un autre étage. Repasser par le magasin
          recopierait le prix D'AUJOURD'HUI. */}
      <button
        title="Dupliquer la ligne, juste en dessous"
        disabled={enCours}
        onClick={() => agir(() => dupliquerLigne(l.id))}
        className="p-1 text-subtle transition-colors hover:text-brand"
      >
        <CopyIcon className="h-3.5 w-3.5" />
      </button>
      {ligneChiffree(l.genre) && (
        /* L'astérisque : sur un devis, l'option se marque d'une étoile. */
        <button
          title={l.option ? "Remettre au devis" : "Passer en option (hors total)"}
          disabled={enCours}
          onClick={() => agir(() => majLigne(l.id, { option: !l.option }))}
          className={cn(
            "p-1 transition-colors hover:text-accent",
            l.option ? "text-accent" : "text-subtle",
          )}
        >
          <Asterisk className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        title="Supprimer la ligne"
        disabled={enCours}
        onClick={() => agir(() => supprimerLigne(l.id))}
        className="p-1 text-subtle transition-colors hover:text-danger"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

/* -----------------------------------------------------------------------------
 * LE PANNEAU — trois onglets, trois métiers
 *
 * Quatre blocs toujours dépliés se disputaient 320 px, dont le plus gros — la
 * publication — était celui qu'on touche le moins. Un onglet à la fois : on
 * compose, puis on négocie, puis on publie.
 * -------------------------------------------------------------------------- */

const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: "composition", libelle: "Composition" },
  { cle: "negocier", libelle: "Négocier" },
  { cle: "publier", libelle: "Publier" },
  { cle: "fil", libelle: "Fil" },
];

function Panneau({
  onglet,
  setOnglet,
  fil,
  moiId,
  moiNom,
  entete,
  totaux,
  charge,
  enCours,
  agir,
  onRetirerRemise,
  base,
}: {
  onglet: Onglet;
  setOnglet: (o: Onglet) => void;
  fil: FilDevis;
  moiId: string;
  moiNom: string;
  entete: DevisComplet["entete"];
  totaux: TotauxDevis;
  charge: ChargeUnite[];
  enCours: boolean;
  agir: (fn: () => Promise<unknown>) => void;
  onRetirerRemise: () => void;
  base: string;
}) {
  return (
    <aside className="bloc flex shrink-0 flex-col lg:w-[17.5rem] lg:overflow-hidden xl:w-[19.5rem]">
      <div className="flex shrink-0 gap-1 border-b border-hairline bg-surface-2 p-1">
        {ONGLETS.map((o) => (
          <button
            key={o.cle}
            type="button"
            onClick={() => setOnglet(o.cle)}
            aria-pressed={onglet === o.cle}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium transition-colors",
              onglet === o.cle
                ? "border border-hairline bg-surface text-fg"
                : "border border-transparent text-muted hover:text-fg",
            )}
          >
            {o.libelle}
            {/* Le fil annonce ce qu'il porte : le compte de messages, et un
                point quand il y a du neuf. Rien quand il est vide — un « 0 »
                posé là inviterait à ouvrir pour rien. */}
            {o.cle === "fil" && fil.nbMessages > 0 && (
              <span
                className={cn(
                  "rounded px-1 font-mono text-[0.6rem] tabular-nums",
                  fil.nbNonLus > 0
                    ? "bg-accent text-accent-fg font-semibold"
                    : "bg-surface-2 text-subtle",
                )}
              >
                {fil.nbMessages}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ⚠️ Le fil gère SON défilement (la liste défile, le composeur reste
          collé en bas) : le conteneur d'onglet lui cède la main plutôt que
          d'empiler deux zones de défilement l'une dans l'autre. Un seul
          défilement par écran — c'est la règle de la coquille pleine hauteur
          (docs/DEVIS.md §22.4). */}
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          onglet === "fil" ? "overflow-hidden" : "lg:overflow-y-auto lg:overscroll-contain",
        )}
      >
        {onglet === "composition" && (
          <OngletComposition totaux={totaux} charge={charge} entete={entete} base={base} />
        )}
        {onglet === "negocier" && (
          <OngletNegocier
            entete={entete}
            totaux={totaux}
            enCours={enCours}
            agir={agir}
            onRetirerRemise={onRetirerRemise}
          />
        )}
        {onglet === "publier" && (
          <BlocPublication entete={entete} enCours={enCours} agir={agir} />
        )}
        {onglet === "fil" && (
          <FilDevisPanneau
            devisId={entete.id}
            fil={fil}
            moiId={moiId}
            moiNom={moiNom}
            aUneAffaire={!!entete.chantierId}
          />
        )}
      </div>
    </aside>
  );
}

/* --- Onglet 1 : COMPOSITION -------------------------------------------------
 * De quoi le prix est fait — et ce qui, dans le tableau, se voit mal.
 * -------------------------------------------------------------------------- */

function OngletComposition({
  totaux,
  charge,
  entete,
  base,
}: {
  totaux: TotauxDevis;
  charge: ChargeUnite[];
  entete: DevisComplet["entete"];
  base: string;
}) {
  const taux = totaux.tauxMargeFournitureNetteCentieme;
  const aPerte = taux !== null && totaux.margeFournitureNetteCents <= 0;
  const vendu = totaux.venduFournitureNetCents;
  const partDebourse = vendu > 0 && !aPerte ? (totaux.debourseCents / vendu) * 100 : 100;

  // La composition du net, lot par lot : la barre montre les poids, la liste
  // donne les montants. Les options n'y entrent pas — elles ne sont pas au net.
  const netLots = totaux.lots.reduce((s, l) => s + l.sousTotalCents, 0);

  return (
    <div className="divide-y divide-hairline">
      {/* 1. La marge — le chiffre qu'on surveille pendant qu'on compose. */}
      <section className="px-4 py-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="stamp">Marge fourniture</span>
          <span className="text-xs text-muted">
            {taux === null ? "aucun déboursé" : formatEuros(totaux.margeFournitureNetteCents)}
          </span>
        </div>
        <p
          className={cn(
            "chiffre chiffre-sm mt-1.5",
            taux === null ? "text-subtle" : aPerte ? "text-danger" : "text-success",
          )}
        >
          {taux === null ? "—" : formatPourcent(taux)}
        </p>

        {taux === null ? (
          <p className="mt-2 text-xs leading-snug text-subtle">
            Aucune ligne ne porte de déboursé connu : il n&apos;y a rien à comparer. La main
            d&apos;œuvre est saisie au taux de vente, son coût n&apos;entre pas dans ce calcul.
          </p>
        ) : (
          <>
            <div className="jauge jauge-anim mt-2.5" aria-hidden>
              <span className="bg-brand/40" style={{ width: `${partDebourse}%` }} />
              {!aPerte && <span className="flex-1 bg-success" />}
            </div>
            <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs">
              <span className="inline-flex items-center gap-1.5 text-muted">
                <span aria-hidden className="h-2 w-2 shrink-0 bg-brand/40" />
                Déboursé
                <strong className="font-semibold tabular-nums text-fg">
                  {formatEuros(totaux.debourseCents)}
                </strong>
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5",
                  aPerte ? "text-danger" : "text-muted",
                )}
              >
                <span
                  aria-hidden
                  className={cn("h-2 w-2 shrink-0", aPerte ? "bg-danger" : "bg-success")}
                />
                {aPerte ? "À perte" : "Marge"}
              </span>
            </div>
            {/* La marge affichée est la marge NETTE : la remise globale porte sur
                le total et non sur les lignes ; l'ignorer la surestimerait
                exactement au moment où l'on vient de lâcher du prix. */}
            {totaux.remiseGlobaleCents > 0 && totaux.tauxMargeFournitureCentieme !== null && (
              <p className="mt-1.5 text-xs text-subtle">
                Avant remise globale : {formatEuros(totaux.margeFournitureCents)} ·{" "}
                {formatPourcent(totaux.tauxMargeFournitureCentieme)}
              </p>
            )}
          </>
        )}
      </section>

      {/* 2. La composition du net HT, lot par lot. */}
      {totaux.lots.length > 0 && (
        <section className="px-4 py-3.5">
          <span className="stamp">Composition du net HT</span>
          {netLots > 0 && (
            <div className="jauge jauge-anim mt-2" aria-hidden>
              {totaux.lots.map((l, rang) => (
                <span
                  key={l.lot?.id ?? "hors-lot"}
                  className={cn("ed-puce block h-auto w-auto", signalLot(rang))}
                  style={{ width: `${(l.sousTotalCents / netLots) * 100}%` }}
                />
              ))}
            </div>
          )}
          <dl className="mt-2 space-y-1 text-sm">
            {totaux.lots.map((l, rang) => (
              <div
                key={l.lot?.id ?? "hors-lot"}
                className="flex items-baseline justify-between gap-3"
              >
                <dt className="flex min-w-0 items-center gap-1.5 text-muted">
                  <span aria-hidden className={cn("ed-puce", signalLot(rang))} />
                  <span className="truncate">{l.lot?.titre ?? "Hors lot"}</span>
                </dt>
                <dd className="shrink-0 tabular-nums text-fg">
                  {formatEuros(l.sousTotalCents)}
                </dd>
              </div>
            ))}
            {totaux.optionsCents > 0 && (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="min-w-0 truncate text-accent">Options, hors total</dt>
                <dd className="shrink-0 tabular-nums text-accent">
                  {formatEuros(totaux.optionsCents)}
                </dd>
              </div>
            )}
          </dl>
        </section>
      )}

      {/* 3. Ce que le devis engage en TRAVAIL. « 58 000 € » ne dit pas si l'on
             part pour trois jours ou pour trois semaines. */}
      {charge.length > 0 && (
        <section className="flex items-baseline justify-between gap-3 px-4 py-3">
          <span className="stamp">Main d&apos;œuvre</span>
          <span className="text-sm tabular-nums text-fg">
            {charge.map((c) => `${formatQuantite(c.quantiteMillieme)} ${c.unite}`).join(" · ")}
            <span className="ml-1.5 text-xs text-subtle">hors options</span>
          </span>
        </section>
      )}

      {/* 4. Les points d'attention — ce qui se voit mal dans un tableau. Rien
             n'est calculé ici que le moteur ne dise déjà : ce sont les mêmes
             signaux, rassemblés là où on les cherche. */}
      {(totaux.nbSansPrix > 0 || totaux.nbPerimees > 0 || totaux.nbOptions > 0) && (
        <section className="px-4 py-3.5">
          <span className="stamp">Points d&apos;attention</span>
          <ul className="mt-2 space-y-2 text-xs leading-snug">
            {totaux.nbSansPrix > 0 && (
              <li className="flex gap-2 text-fg">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                <span>
                  {totaux.nbSansPrix} ligne{totaux.nbSansPrix > 1 ? "s" : ""} sans prix
                  d&apos;achat connu : exclue{totaux.nbSansPrix > 1 ? "s" : ""} du déboursé et
                  de la marge. Elles comptent bien dans le total vendu.
                </span>
              </li>
            )}
            {totaux.nbPerimees > 0 && (
              <li className="flex gap-2 text-fg">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                <span>
                  {totaux.nbPerimees} ligne{totaux.nbPerimees > 1 ? "s ont" : " a"} un prix
                  d&apos;achat plus récent au magasin. Le devis montre ce qui a été chiffré
                  tant que vous ne demandez pas le rafraîchissement.
                </span>
              </li>
            )}
            {totaux.nbOptions > 0 && (
              <li className="flex gap-2 text-fg">
                <Asterisk className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                <span>
                  {totaux.nbOptions} ligne{totaux.nbOptions > 1 ? "s" : ""} en option :{" "}
                  {formatEuros(totaux.optionsCents)} chiffrés, jamais additionnés au total.
                </span>
              </li>
            )}
          </ul>
        </section>
      )}

      {/* 5. La chaîne des révisions — la seule histoire que l'outil connaisse. */}
      {entete.parentId && (
        <section className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="stamp">Révisions</span>
          <Link
            href={`${base}/${entete.parentId}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
          >
            <GitBranch className="h-3.5 w-3.5" /> Voir la v{entete.revision - 1}
          </Link>
        </section>
      )}
    </div>
  );
}

/* --- Onglet 2 : NÉGOCIER ----------------------------------------------------
 * Les deux façons de lâcher du prix, et la cascade qui dit où va le net.
 * Règle : CE QUI SE POSE SE RETIRE, et ça se voit sans chercher.
 * -------------------------------------------------------------------------- */

function OngletNegocier({
  entete,
  totaux,
  enCours,
  agir,
  onRetirerRemise,
}: {
  entete: DevisComplet["entete"];
  totaux: TotauxDevis;
  enCours: boolean;
  agir: (fn: () => Promise<unknown>) => void;
  onRetirerRemise: () => void;
}) {
  return (
    <div className="divide-y divide-hairline">
      {/* La `key` porte la valeur du serveur : quand elle change, le champ se
          remonte avec la bonne valeur initiale. C'est ce qui remplace la
          resynchronisation pendant le rendu (voir `RemiseGlobale`). */}
      <RemiseGlobale
        key={`${entete.remiseGlobalePourMille ?? "-"}/${entete.remiseGlobaleCents ?? "-"}`}
        entete={entete}
        totaux={totaux}
        enCours={enCours}
        agir={agir}
        onRetirerRemise={onRetirerRemise}
      />
      <PrixCible entete={entete} totaux={totaux} enCours={enCours} agir={agir} />

      {/* La cascade : d'où vient le net, et où il va. */}
      <dl className="space-y-1.5 px-4 py-3 text-sm">
        <Poste label="Total HT" valeur={formatEuros(totaux.totalHtCents)} />
        {totaux.remiseGlobaleCents > 0 && (
          <Poste
            label="Remise globale"
            valeur={`− ${formatEuros(totaux.remiseGlobaleCents)}`}
            ton="accent"
            /* La remise se retire LÀ OÙ ON LA LIT. */
            action={
              <button
                type="button"
                disabled={enCours}
                onClick={onRetirerRemise}
                title="Retirer la remise globale"
                className="press rounded p-0.5 text-subtle transition-colors hover:bg-surface-2 hover:text-danger"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            }
          />
        )}
        <Poste label="Net HT" valeur={formatEuros(totaux.netHtCents)} fort />
        <Poste
          label={`TVA ${formatPourcent(entete.tauxTvaCentieme)}`}
          valeur={formatEuros(totaux.tvaCents)}
        />
        <Poste label="Total TTC" valeur={formatEuros(totaux.totalTtcCents)} fort />
        {totaux.optionsCents > 0 && (
          <Poste
            label="Options, non comptées"
            valeur={formatEuros(totaux.optionsCents)}
            ton="accent"
          />
        )}
      </dl>
    </div>
  );
}

/* --- La remise globale ------------------------------------------------------
 * Un seul champ, une bascule d'unité, et la remise effective annoncée sous le
 * champ avec son bouton « Retirer ».
 * -------------------------------------------------------------------------- */

function RemiseGlobale({
  entete,
  totaux,
  enCours,
  agir,
  onRetirerRemise,
}: {
  entete: DevisComplet["entete"];
  totaux: TotauxDevis;
  enCours: boolean;
  agir: (fn: () => Promise<unknown>) => void;
  onRetirerRemise: () => void;
}) {
  // L'unité suit ce qui est ENREGISTRÉ : après un prix cible (qui pose des
  // euros), la bascule se met d'elle-même sur « € ».
  const uniteServeur: "pourcent" | "euros" =
    entete.remiseGlobaleCents !== null ? "euros" : "pourcent";
  const valeurServeur =
    entete.remiseGlobaleCents !== null
      ? formatEuros(entete.remiseGlobaleCents)
      : entete.remiseGlobalePourMille
        ? formatPourcent(entete.remiseGlobalePourMille * 10)
        : "";

  /* ⚠️ Pas de resynchronisation PENDANT LE RENDU ici : ce composant est le seul
     dont la valeur serveur change au moment PRÉCIS où l'on retire la remise
     (DEVIS.md §20). La remise à zéro se fait par la `key` posée par le parent. */
  const [unite, setUnite] = useState(uniteServeur);
  const [v, setV] = useState(valeurServeur);
  const [erreur, setErreur] = useState<string | null>(null);

  const posee = totaux.remiseGlobaleCents > 0;

  function valider(saisie: string) {
    const t = saisie.trim();
    if (t === "") {
      retirer();
      return;
    }
    if (unite === "pourcent") {
      const r = parseRemise(t);
      if (r === null) {
        setErreur("Remise illisible (0 à 100 %)");
        return;
      }
      setErreur(null);
      agir(() => majEnteteDevis(entete.id, { remiseGlobalePourMille: r }));
    } else {
      const c = parseEuros(t);
      if (c === null) {
        setErreur("Montant illisible");
        return;
      }
      setErreur(null);
      agir(() => majEnteteDevis(entete.id, { remiseGlobaleCents: c }));
    }
  }

  function retirer() {
    setErreur(null);
    setV("");
    onRetirerRemise();
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2">
        <Label htmlFor="ed-remise" className="flex-1">
          Remise globale
        </Label>
        {/* La bascule d'unité : ce que je m'apprête à taper. Ce qui est
            réellement appliqué est dit juste en dessous, en euros. */}
        <span className="inline-flex overflow-hidden rounded-md border border-border">
          {(["pourcent", "euros"] as const).map((u) => (
            <button
              key={u}
              type="button"
              aria-pressed={unite === u}
              onClick={() => {
                setUnite(u);
                if (u !== uniteServeur) setV("");
                setErreur(null);
              }}
              className={cn(
                "px-2 py-0.5 font-mono text-xs transition-colors",
                unite === u
                  ? "bg-brand text-brand-fg"
                  : "bg-surface text-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              {u === "pourcent" ? "%" : "€"}
            </button>
          ))}
        </span>
      </div>

      <Input
        id="ed-remise"
        value={v}
        disabled={enCours}
        placeholder={unite === "pourcent" ? "ex. 3 %" : "ex. 1 500 €"}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          if (v.trim() === valeurServeur.trim()) return;
          valider(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setV(valeurServeur);
            setErreur(null);
            e.currentTarget.blur();
          }
        }}
        className={cn("mt-1 text-sm tabular-nums", erreur && "border-danger")}
      />
      {erreur && <p className="mt-1 text-xs text-danger">{erreur}</p>}

      {posee ? (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="text-accent">− {formatEuros(totaux.remiseGlobaleCents)} appliqués</span>
          <button
            type="button"
            disabled={enCours}
            onClick={retirer}
            className="press inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-muted transition-colors hover:border-danger/50 hover:text-danger"
          >
            <X className="h-3 w-3" /> Retirer
          </button>
        </p>
      ) : (
        <p className="mt-1.5 text-xs text-subtle">
          Un pourcentage suit le total quand les lignes bougent ; un montant reste fixe.
        </p>
      )}
    </div>
  );
}

/* --- Le prix cible — l'inverse du chiffrage ---------------------------------
 * Le moteur va du déboursé vers le prix ; en négociation la question part de
 * l'autre bout. On simule AVANT d'appliquer, et ON PEUT REVENIR EN ARRIÈRE :
 * pas seulement « retirer la remise » — REMETTRE CELLE D'AVANT.
 * -------------------------------------------------------------------------- */

function PrixCible({
  entete,
  totaux,
  enCours,
  agir,
}: {
  entete: DevisComplet["entete"];
  totaux: TotauxDevis;
  enCours: boolean;
  agir: (fn: () => Promise<unknown>) => void;
}) {
  const [saisie, setSaisie] = useState("");
  const cible = parseEuros(saisie);
  const simulation = cible === null ? null : simulerPrixCible(totaux, cible);

  /** Ce qu'il y avait avant la dernière application, et ce qu'elle a posé. */
  const [retour, setRetour] = useState<{
    pourMille: number | null;
    cents: number | null;
    posee: number;
    cible: number;
  } | null>(null);

  // La marche arrière ne vaut que tant que la remise appliquée est TOUJOURS
  // celle qu'on a posée : dès qu'on y a retouché, la proposition mentirait.
  const annulable = retour !== null && entete.remiseGlobaleCents === retour.posee;

  function appliquer() {
    if (!simulation || simulation.cibleAuDessus) return;
    setRetour({
      pourMille: entete.remiseGlobalePourMille,
      cents: entete.remiseGlobaleCents,
      posee: simulation.remiseCents,
      cible: cible!,
    });
    agir(async () => {
      await majEnteteDevis(entete.id, { remiseGlobaleCents: simulation.remiseCents });
      setSaisie("");
    });
  }

  function annuler() {
    if (!retour) return;
    const avant =
      retour.cents !== null
        ? { remiseGlobaleCents: retour.cents }
        : retour.pourMille !== null
          ? { remiseGlobalePourMille: retour.pourMille }
          : { remiseGlobalePourMille: null, remiseGlobaleCents: null };
    agir(async () => {
      await majEnteteDevis(entete.id, avant);
      setRetour(null);
    });
  }

  return (
    <div className="px-4 py-3">
      <Label htmlFor="ed-cible">Atteindre un prix (net HT)</Label>
      <div className="mt-1 flex gap-2">
        <Input
          id="ed-cible"
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") appliquer();
            if (e.key === "Escape") setSaisie("");
          }}
          placeholder="ex. 60 000 €"
          disabled={enCours}
          className="text-sm tabular-nums"
        />
        <Button
          variant="outline"
          size="md"
          disabled={enCours || !simulation || simulation.cibleAuDessus}
          onClick={appliquer}
        >
          Appliquer
        </Button>
      </div>

      {/* La marche arrière, offerte tant qu'elle est vraie. */}
      {annulable && saisie.trim() === "" ? (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="text-muted">
            Posé pour atteindre <strong className="text-fg">{formatEuros(retour!.cible)}</strong>
          </span>
          <button
            type="button"
            disabled={enCours}
            onClick={annuler}
            title={
              retour!.cents === null && retour!.pourMille === null
                ? "Revenir à un devis sans remise globale"
                : "Remettre la remise qui s'appliquait avant"
            }
            className="press inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-muted transition-colors hover:border-brand/50 hover:text-brand"
          >
            <Undo2 className="h-3 w-3" /> Annuler
          </button>
        </p>
      ) : simulation === null ? (
        <p className="mt-1.5 text-xs text-subtle">
          On calcule la remise globale qu&apos;il faudrait, et ce qu&apos;il resterait de marge.
        </p>
      ) : simulation.cibleAuDessus ? (
        <p className="mt-1.5 text-xs text-subtle">
          Ce prix est au-dessus du total HT ({formatEuros(totaux.totalHtCents)}) : il n&apos;y a
          rien à remiser. Un devis ne se gonfle pas par une remise — ce sont les prix qui montent.
        </p>
      ) : (
        <div className="mt-1.5 space-y-0.5 text-xs">
          <p className="text-muted">
            Remise nécessaire :{" "}
            <strong className="text-fg">
              {formatEuros(simulation.remiseCents)} ·{" "}
              {formatPourcent(simulation.remisePourMille * 10)}
            </strong>
          </p>
          {simulation.margeNetteCents === null ? (
            <p className="text-subtle">
              Aucun déboursé connu : impossible de dire ce qu&apos;il resterait de marge.
            </p>
          ) : (
            <p className={cn(simulation.aPerte ? "text-danger" : "text-muted")}>
              {simulation.aPerte ? "⚠ À perte sur la fourniture : " : "Marge restante : "}
              <strong>
                {formatEuros(simulation.margeNetteCents)}
                {simulation.tauxMargeNetteCentieme !== null &&
                  ` · ${formatPourcent(simulation.tauxMargeNetteCentieme)}`}
              </strong>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* -----------------------------------------------------------------------------
 * LA BARRE DE TOTAUX — la SEULE source permanente du prix
 *
 * Le net HT était écrit à trois endroits : dans le cartouche, en aiguille du
 * pupitre, et dans la cascade. Ici il n'est écrit qu'une fois, dans le bâti,
 * et il ne quitte jamais l'écran.
 * -------------------------------------------------------------------------- */

function BarreTotaux({
  totaux,
  entete,
  enCours,
  majLe,
  onNegocier,
}: {
  totaux: TotauxDevis;
  entete: DevisComplet["entete"];
  enCours: boolean;
  majLe: Date;
  onNegocier: () => void;
}) {
  const taux = totaux.tauxMargeFournitureNetteCentieme;
  const aPerte = taux !== null && totaux.margeFournitureNetteCents <= 0;

  return (
    <div className="ed-totaux sticky top-0 z-20 shrink-0 lg:static lg:order-last">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 px-4 py-2">
        <span className="flex items-baseline gap-2">
          <span className="ed-stamp">Net HT</span>
          <span className="ref text-xl font-bold leading-none tracking-[-0.01em]">
            {formatEuros(totaux.netHtCents)}
          </span>
        </span>

        <span className="flex items-baseline gap-2">
          <span className="ed-stamp">TTC</span>
          <span className="ref text-sm ed-lbl">
            {formatEuros(totaux.totalTtcCents)}
            <span className="ml-1.5">TVA {formatPourcent(entete.tauxTvaCentieme)}</span>
          </span>
        </span>

        <span className="flex items-baseline gap-2">
          <span className="ed-stamp">Marge</span>
          <span className={cn("ref text-sm", taux === null ? "ed-lbl" : aPerte ? "ed-ko" : "ed-ok")}>
            {taux === null
              ? "—"
              : `${formatPourcent(taux)} · ${formatEuros(totaux.margeFournitureNetteCents)}`}
          </span>
        </span>

        {totaux.optionsCents > 0 && (
          <span className="flex items-baseline gap-2">
            <span className="ed-stamp">Options</span>
            <span className="ref ed-opt text-sm">{formatEuros(totaux.optionsCents)}</span>
          </span>
        )}

        <span className="ml-auto flex shrink-0 items-center gap-3">
          <span className="ed-lbl text-xs">
            {enCours
              ? "Enregistrement…"
              : `Enregistré à ${majLe.toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`}
          </span>
          <button
            type="button"
            onClick={onNegocier}
            className="press rounded-md border border-[color:var(--chrome-border)] px-3 py-1 text-xs font-medium transition-colors hover:bg-[color:var(--chrome-hover)]"
          >
            Négocier
          </button>
        </span>
      </div>
    </div>
  );
}

/** Une ligne de la cascade. `action` porte le geste qui défait ce que la ligne
 *  annonce — une remise se retire là où on la lit. */
function Poste({
  label,
  valeur,
  fort,
  ton,
  action,
}: {
  label: string;
  valeur: string;
  fort?: boolean;
  ton?: "accent" | "danger";
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="min-w-0 truncate text-muted">{label}</dt>
      <dd
        className={cn(
          "flex shrink-0 items-center gap-1.5 tabular-nums",
          fort ? "font-display text-base font-semibold text-fg" : "text-fg",
          ton === "accent" && "text-accent",
          ton === "danger" && "text-danger",
        )}
      >
        {valeur}
        {action}
      </dd>
    </div>
  );
}

/* -----------------------------------------------------------------------------
 * PETITS CHAMPS ÉDITABLES
 * Validation au blur ou à Entrée, message d'erreur en place. Échap annule.
 * -------------------------------------------------------------------------- */

/**
 * Le libellé d'une ligne — une ZONE DE TEXTE, pas un champ d'une ligne : une
 * désignation de catalogue fait couramment quarante caractères, et c'est
 * justement la colonne qu'on lit sur un devis.
 */
function ChampTexte({
  valeur,
  onValide,
  disabled,
  className,
}: {
  valeur: string;
  onValide: (v: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [v, setV] = useState(valeur);

  function ajuster(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  return (
    <textarea
      ref={ajuster}
      rows={1}
      value={v}
      disabled={disabled}
      onChange={(e) => {
        setV(e.target.value);
        ajuster(e.target);
      }}
      onBlur={() => {
        if (v.trim() && v !== valeur) onValide(v.trim());
        else if (!v.trim()) setV(valeur);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          setV(valeur);
          e.currentTarget.blur();
        }
      }}
      className={cn(
        "champ-inline champ-inline-texte resize-none overflow-hidden text-sm leading-snug text-fg",
        className,
      )}
    />
  );
}

function ChampCase({
  valeur,
  onValide,
  disabled,
  placeholder,
  suffixe,
  titre,
}: {
  valeur: string;
  /** Renvoie un message d'erreur, ou null si la saisie est acceptée. */
  onValide: (v: string) => string | null;
  disabled?: boolean;
  placeholder?: string;
  suffixe?: string;
  titre?: string;
}) {
  const [v, setV] = useState(valeur);
  const [erreur, setErreur] = useState<string | null>(null);
  // La valeur venue du serveur reprend la main dès qu'elle change (après une
  // écriture), sans écraser une saisie en cours.
  const [ancre, setAncre] = useState(valeur);
  if (ancre !== valeur) {
    setAncre(valeur);
    setV(valeur);
  }

  return (
    <span className="flex flex-col items-stretch">
      <span className="flex items-baseline justify-end gap-1">
        <input
          value={v}
          disabled={disabled}
          title={titre}
          placeholder={placeholder}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => {
            if (v === valeur) {
              setErreur(null);
              return;
            }
            setErreur(onValide(v));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setV(valeur);
              setErreur(null);
              e.currentTarget.blur();
            }
          }}
          className={cn(
            "champ-inline min-w-0 flex-1 text-right text-sm tabular-nums text-fg",
            erreur && "border-danger text-danger",
          )}
        />
        {suffixe && <span className="shrink-0 text-xs text-subtle">{suffixe}</span>}
      </span>
      {erreur && <span className="text-right text-[0.65rem] text-danger">{erreur}</span>}
    </span>
  );
}

/**
 * LA TVA — deux taux, et la porte ouverte.
 *
 * Sur un devis GTB il n'y a en pratique que deux réponses : 20 %, ou 0 % en
 * autoliquidation quand on est sous-traitant du bâtiment. Les faire taper à la
 * main était une saisie libre pour un choix binaire — et le 0 % (le cas qui se
 * décide, celui qui a une raison réglementaire) n'était annoncé nulle part.
 * Le champ libre reste : 10 % existe, et un taux n'est pas notre décision.
 */
const TVA_USUELLES: { centieme: number; libelle: string; aide: string }[] = [
  { centieme: 2000, libelle: "20 %", aide: "Taux normal" },
  { centieme: 0, libelle: "0 %", aide: "Autoliquidation — sous-traitance bâtiment" },
];

function ChoixTva({
  valeur,
  disabled,
  onChoisir,
}: {
  valeur: number;
  disabled?: boolean;
  onChoisir: (centieme: number) => void;
}) {
  const usuel = TVA_USUELLES.some((t) => t.centieme === valeur);
  const [libre, setLibre] = useState(!usuel);
  const [v, setV] = useState(formatPourcent(valeur));
  const [erreur, setErreur] = useState<string | null>(null);

  return (
    <div>
      <Label>Taux de TVA</Label>
      <div className="mt-1 space-y-1">
        {TVA_USUELLES.map((t) => (
          <button
            key={t.centieme}
            type="button"
            disabled={disabled}
            onClick={() => {
              setLibre(false);
              setErreur(null);
              setV(formatPourcent(t.centieme));
              onChoisir(t.centieme);
            }}
            className={cn(
              "flex w-full items-baseline gap-2 border px-2.5 py-1.5 text-left text-sm transition-colors",
              !libre && valeur === t.centieme
                ? "border-brand bg-brand-soft font-semibold text-brand"
                : "border-border text-fg hover:border-brand/45 hover:bg-surface-2",
            )}
          >
            <span className="shrink-0 tabular-nums">{t.libelle}</span>
            <span className="min-w-0 truncate text-xs font-normal text-subtle">{t.aide}</span>
          </button>
        ))}

        <button
          type="button"
          disabled={disabled}
          onClick={() => setLibre(true)}
          className={cn(
            "flex w-full items-baseline gap-2 border px-2.5 py-1.5 text-left text-sm transition-colors",
            libre
              ? "border-brand bg-brand-soft font-semibold text-brand"
              : "border-border text-fg hover:border-brand/45 hover:bg-surface-2",
          )}
        >
          Autre taux…
        </button>
      </div>

      {libre && (
        <>
          <Input
            autoFocus
            value={v}
            disabled={disabled}
            placeholder="ex. 10 %"
            onChange={(e) => setV(e.target.value)}
            onBlur={() => {
              const t = parsePourcent(v);
              if (t === null) {
                setErreur("Taux illisible");
                return;
              }
              setErreur(null);
              if (t !== valeur) onChoisir(t);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className={cn("mt-1.5 tabular-nums", erreur && "border-danger")}
          />
          {erreur && <p className="mt-0.5 text-xs text-danger">{erreur}</p>}
        </>
      )}
    </div>
  );
}

/** Le champ d'un paramètre, dans le popover de sa pastille. */
function ChampReglage({
  label,
  valeur,
  aide,
  onValide,
  disabled,
}: {
  label: string;
  valeur: string;
  aide?: string;
  onValide: (v: string) => string | null;
  disabled?: boolean;
}) {
  const [v, setV] = useState(valeur);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ancre, setAncre] = useState(valeur);
  if (ancre !== valeur) {
    setAncre(valeur);
    setV(valeur);
  }
  return (
    <div>
      <Label>{label}</Label>
      <Input
        autoFocus
        value={v}
        disabled={disabled}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => setErreur(v === valeur ? null : onValide(v))}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className={cn("tabular-nums", erreur && "border-danger")}
      />
      {erreur && <p className="mt-0.5 text-xs text-danger">{erreur}</p>}
      {aide && !erreur && <p className="mt-1 text-xs leading-snug text-subtle">{aide}</p>}
    </div>
  );
}
