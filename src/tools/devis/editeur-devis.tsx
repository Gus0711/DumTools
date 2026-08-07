"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  Boxes,
  ChevronLeft,
  Clock,
  Copy,
  FolderPlus,
  GitBranch,
  GripVertical,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
  TriangleAlert,
  Type,
  Wrench,
  X,
} from "lucide-react";
import { Badge, Button, Input, Label } from "@/ui";
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
import { PropositionAssocies } from "./proposition-associes";
import type { AssociationVue } from "@/tools/magasin/model";
import { TexteRiche } from "./texte-riche";
import {
  ETATS_DEVIS,
  ETAT_DEVIS_AIDE,
  ETAT_DEVIS_LABEL,
  ORIGINE_COEF_LABEL,
  calculerDevis,
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
  type DevisComplet,
  type EtatDevis,
  type GenreLigne,
  type LigneCalculee,
  type LigneDevisVue,
  type LotCalcule,
  type PrestationVue,
} from "./model";
import type { ArticleChoix } from "./queries";
import type { AffaireChoix } from "./index-devis";

/* =============================================================================
 * L'ÉDITEUR DE DEVIS
 *
 * Le calcul est fait ICI, en direct, par le même moteur pur que le serveur
 * (model.ts) : les totaux bougent sous les doigts sans aller-retour. Le serveur
 * refait le même calcul à la lecture — ils ne peuvent pas diverger.
 *
 * La composition emprunte sa grammaire à la LISTE DE POINTS du Projet GTB :
 * on ajoute une ligne AU BAS DE SON LOT, en place, et on la déplace à la
 * poignée. Une barre de saisie unique en tête d'écran obligeait à choisir le
 * lot de destination dans un menu avant chaque ajout — le geste le plus répété
 * de l'outil coûtait un aller-retour à chaque ligne.
 * ========================================================================== */

const TON_ETAT: Record<EtatDevis, "neutral" | "brand" | "success" | "danger"> = {
  BROUILLON: "neutral",
  EMIS: "brand",
  ACCEPTE: "success",
  REFUSE: "danger",
};

/** Les deux lots que porte presque tout devis GTB. Proposés tels quels sur un
 *  devis neuf : la première question n'est pas « comment crée-t-on un lot ? ». */
const LOTS_SUGGERES = ["Matériel", "Prestations"];

export function EditeurDevis({
  devis,
  prestations,
  affaires,
  clients,
}: {
  devis: DevisComplet;
  prestations: PrestationVue[];
  affaires: AffaireChoix[];
  clients: string[];
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [reprise, setReprise] = useState(false);
  const { entete, lots, lignes } = devis;

  /* --- Réordonnancement optimiste ------------------------------------------
   * Le glisser-déposer doit se voir AVANT la réponse du serveur, sinon la ligne
   * « revient » sous le doigt le temps de l'aller-retour. On superpose donc un
   * ordre local aux données reçues, qu'on lâche dès que le serveur a répondu.  */
  const [surcharge, setSurcharge] = useState<Map<
    string,
    { lotId: string | null; ordre: number }
  > | null>(null);
  const [ancre, setAncre] = useState(lignes);
  if (ancre !== lignes) {
    setAncre(lignes);
    setSurcharge(null);
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
    () => calculerDevis(entete, lots, lignesAffichees),
    [entete, lots, lignesAffichees],
  );

  /** Toutes les écritures passent par ici : une gestion d'erreur, un rafraîchissement. */
  function agir(fn: () => Promise<unknown>) {
    setErreur(null);
    demarrer(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Opération impossible");
      }
    });
  }

  /* --- Glisser-déposer ------------------------------------------------------
   * On renvoie au serveur l'ORDRE COMPLET du lot d'arrivée, pas un « avant /
   * après » : une seule écriture, et l'ordre enregistré est exactement celui
   * qu'on voyait à l'écran. Déposer sur un autre lot y déplace la ligne. */
  const dragId = useRef<string | null>(null);
  const [surLigne, setSurLigne] = useState<string | null>(null);

  /* La ligne de texte qu'on vient de créer s'ouvre en écriture, curseur dedans :
   * on a demandé un texte, la première chose à faire est de le taper. L'id ne
   * se remet jamais à null — la ligne n'est ouverte qu'une fois, à son
   * apparition, et la refermer ne doit pas la rouvrir au rendu suivant. */
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
    agir(() => reordonnerLignes(entete.id, lotCible, duLot));
  }

  // Un devis sans aucun lot doit tout de même offrir un endroit où déposer une
  // ligne : on rend un groupe « hors lot » vide plutôt qu'un écran sans prise.
  const groupes: LotCalcule[] =
    totaux.lots.length > 0
      ? totaux.lots
      : [{ lot: null, lignes: [], sousTotalCents: 0, optionsCents: 0 }];

  return (
    <div className="mx-auto max-w-[1700px] px-4 py-5 md:px-7 md:py-7">
      <EnteteDevis
        entete={entete}
        affaires={affaires}
        clients={clients}
        totaux={totaux}
        enCours={enCours}
        agir={agir}
      />

      {erreur && (
        <p className="mb-4 border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {erreur}
        </p>
      )}

      {/* Le bandeau de fraîcheur : la seule fois où le référentiel reprend la
          parole — et il PROPOSE, il n'applique pas. */}
      {totaux.nbPerimees > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm">
          <Clock className="h-4 w-4 shrink-0 text-warning" />
          <span className="text-fg">
            <strong>{totaux.nbPerimees}</strong> ligne{totaux.nbPerimees > 1 ? "s ont" : " a"}{" "}
            un prix d&apos;achat plus récent au magasin.
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={enCours}
            onClick={() => agir(() => rafraichirLignes(entete.id))}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Tout rafraîchir
          </Button>
          <span className="text-xs text-subtle">
            Le devis affiche ce qui a été chiffré tant que vous ne le demandez pas.
          </span>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          {groupes.map((lot) => (
            <BlocLot
              key={lot.lot?.id ?? "hors-lot"}
              devisId={entete.id}
              lot={lot}
              prestations={prestations}
              enCours={enCours}
              agir={agir}
              coefDefaut={entete.coefDefautMillieme}
              dragId={dragId}
              surLigne={surLigne}
              setSurLigne={setSurLigne}
              deposer={deposer}
              texteNeuf={texteNeuf}
              setTexteNeuf={setTexteNeuf}
            />
          ))}

          <BarreLots
            devisId={entete.id}
            titresExistants={lots.map((l) => l.titre)}
            chantierId={entete.chantierId}
            enCours={enCours}
            agir={agir}
            onReprise={() => setReprise(true)}
          />

          {reprise && entete.chantierId && (
            <RepriseBom
              devisId={entete.id}
              chantierId={entete.chantierId}
              chantierNom={entete.chantierNom ?? "l'affaire"}
              onFerme={() => setReprise(false)}
              onFini={() => {
                setReprise(false);
                router.refresh();
              }}
            />
          )}
        </div>

        <PanneauTotaux
          entete={entete}
          totaux={totaux}
          enCours={enCours}
          agir={agir}
          onSupprime={() =>
            agir(async () => {
              await supprimerDevis(entete.id);
              router.push("/perso/gus/devis");
            })
          }
          onRevision={() =>
            agir(async () => {
              const r = await nouvelleRevision(entete.id);
              router.push(`/perso/gus/devis/${r.id}`);
            })
          }
        />
      </div>
    </div>
  );
}

/* -----------------------------------------------------------------------------
 * LES LOTS — création
 * Un devis neuf ne demande pas « comment crée-t-on un lot ? » : les deux lots de
 * presque tous les devis GTB sont proposés tels quels.
 * -------------------------------------------------------------------------- */

function BarreLots({
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
  const [saisie, setSaisie] = useState<string | null>(null);

  /**
   * Un lot suggéré reste proposé TANT QU'IL N'EXISTE PAS — et non « tant que le
   * devis est vide ». Créer « Matériel » faisait sinon disparaître « Prestations »
   * du même coup : on se retrouvait à chercher comment ajouter le second lot
   * juste après avoir créé le premier.
   */
  const aProposer = LOTS_SUGGERES.filter(
    (t) => !titresExistants.some((e) => e.trim().toLowerCase() === t.toLowerCase()),
  );
  const existants = titresExistants.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
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

      {saisie === null ? (
        <Button
          size="sm"
          variant={aProposer.length > 0 ? "ghost" : "outline"}
          onClick={() => setSaisie("")}
        >
          <FolderPlus className="h-3.5 w-3.5" />{" "}
          {existants ? "Ajouter un lot" : "Autre lot…"}
        </Button>
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <Input
            autoFocus
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            placeholder="Nom du lot (Armoire, Bâtiment A…)"
            className="h-8 w-56 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && saisie.trim()) {
                agir(() => ajouterLot(devisId, saisie.trim()));
                setSaisie(null);
              }
              if (e.key === "Escape") setSaisie(null);
            }}
          />
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
          <button onClick={() => setSaisie(null)} className="p-1 text-subtle hover:text-fg">
            <X className="h-4 w-4" />
          </button>
        </span>
      )}

      {chantierId && (
        <Button size="sm" variant="ghost" onClick={onReprise}>
          <Boxes className="h-3.5 w-3.5" /> Reprendre le matériel de l&apos;affaire
        </Button>
      )}
    </div>
  );
}

/* -----------------------------------------------------------------------------
 * UN LOT ET SES LIGNES
 * -------------------------------------------------------------------------- */

function BlocLot({
  devisId,
  lot,
  prestations,
  enCours,
  agir,
  coefDefaut,
  dragId,
  surLigne,
  setSurLigne,
  deposer,
  texteNeuf,
  setTexteNeuf,
}: {
  devisId: string;
  lot: LotCalcule;
  prestations: PrestationVue[];
  enCours: boolean;
  agir: (fn: () => Promise<unknown>) => void;
  coefDefaut: number;
  dragId: React.RefObject<string | null>;
  surLigne: string | null;
  setSurLigne: (id: string | null) => void;
  deposer: (lotCible: string | null, cibleId: string | null) => void;
  /** La ligne de texte qu'on vient de créer — elle s'ouvre en écriture. */
  texteNeuf: string | null;
  setTexteNeuf: (id: string) => void;
}) {
  const [titre, setTitre] = useState(lot.lot?.titre ?? "");
  const lotId = lot.lot?.id ?? null;
  // Le compte annoncé est celui des lignes qui PÈSENT dans le sous-total :
  // options exclues, et textes libres aussi — « 2 lignes » à côté de « 0,00 € »
  // fait recompter le devis à la main.
  const nbComptees = lot.lignes.filter(
    (l) => !l.ligne.option && ligneChiffree(l.ligne.genre),
  ).length;

  return (
    <section className="bloc">
      <header className="bloc-entete flex flex-wrap items-center gap-3">
        {lot.lot ? (
          <input
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            onBlur={() => {
              if (titre !== lot.lot!.titre) agir(() => majLot(lot.lot!.id, { titre }));
            }}
            className="champ-inline min-w-40 flex-1 font-display text-base font-semibold text-fg"
            title="Nom du lot — modifiable"
          />
        ) : (
          <span className="min-w-40 flex-1 font-display text-base font-semibold text-muted">
            Hors lot
          </span>
        )}
        <span className="text-sm text-subtle">
          {nbComptees} ligne{nbComptees > 1 ? "s" : ""}
        </span>
        <span className="font-display text-base font-semibold text-fg">
          {formatEuros(lot.sousTotalCents)}
        </span>
        {lot.optionsCents > 0 && (
          <span className="text-xs text-subtle">+ {formatEuros(lot.optionsCents)} en option</span>
        )}
        {lot.lot && (
          <span className="flex items-center gap-1">
            <button
              title="Monter le lot"
              disabled={enCours}
              onClick={() => agir(() => deplacerLot(lot.lot!.id, "haut"))}
              className="p-1 text-subtle hover:text-fg"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
            <button
              title="Descendre le lot"
              disabled={enCours}
              onClick={() => agir(() => deplacerLot(lot.lot!.id, "bas"))}
              className="p-1 text-subtle hover:text-fg"
            >
              <ArrowDown className="h-4 w-4" />
            </button>
            <button
              title="Supprimer le lot (les lignes sont conservées, hors lot)"
              disabled={enCours}
              onClick={() => agir(() => supprimerLot(lot.lot!.id))}
              className="p-1 text-subtle hover:text-danger"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </span>
        )}
      </header>

      {lot.lignes.length > 0 && (
        <div className="overflow-x-auto">
          <table className="data-table data-table--form table-cards">
            <thead>
              <tr>
                <th className="w-8" />
                <th className="w-[30%] min-w-48">Désignation</th>
                <th className="w-[9%] cell-num">Qté</th>
                <th className="w-[11%] cell-num">Déboursé</th>
                <th className="w-[9%] cell-num">Coef.</th>
                <th className="w-[11%] cell-num">P.V. unit.</th>
                <th className="w-[8%] cell-num">Rem.</th>
                <th className="w-[12%] cell-num">Total</th>
                {/* Quatre boutons à poser : sans largeur minimale, la corbeille
                    sortait du cadre dès qu'une désignation était longue. */}
                <th className="w-28 min-w-[7rem]" />
              </tr>
            </thead>
            <tbody>
              {lot.lignes.map((lc) => (
                <LigneTableau
                  key={lc.ligne.id}
                  lc={lc}
                  devisId={devisId}
                  enCours={enCours}
                  agir={agir}
                  coefDefaut={coefDefaut}
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
            </tbody>
          </table>
        </div>
      )}

      {/* La zone d'ajout vit AU BAS DE SON LOT — comme la liste de points. Elle
          est rendue hors du tableau : la liste de résultats serait rognée par le
          défilement horizontal si elle vivait dans une cellule. */}
      <ZoneAjout
        devisId={devisId}
        lotId={lotId}
        lotTitre={lot.lot?.titre ?? null}
        prestations={prestations}
        enCours={enCours}
        agir={agir}
        onTexteCree={setTexteNeuf}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => deposer(lotId, null)}
      />
    </section>
  );
}

/* -----------------------------------------------------------------------------
 * LA ZONE D'AJOUT — une par lot, au bas de ses lignes
 *
 * Un seul champ qui cherche EN MÊME TEMPS dans les articles du magasin et dans
 * les prestations, plus deux raccourcis pour le « divers » et le commentaire.
 * Choisir la nature de la ligne AVANT de taper coûterait un clic à chaque
 * saisie — c'est exactement ce qu'on ne peut pas se permettre ici.
 * -------------------------------------------------------------------------- */

function ZoneAjout({
  devisId,
  lotId,
  lotTitre,
  prestations,
  enCours,
  agir,
  onTexteCree,
  onDragOver,
  onDrop,
}: {
  devisId: string;
  lotId: string | null;
  lotTitre: string | null;
  prestations: PrestationVue[];
  enCours: boolean;
  agir: (fn: () => Promise<unknown>) => void;
  /** L'id de la ligne de texte qu'on vient de créer : elle s'ouvre en écriture. */
  onTexteCree: (ligneId: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [q, setQ] = useState("");
  const [articles, setArticles] = useState<ArticleChoix[]>([]);
  const [cherche, setCherche] = useState(false);
  /** L'article choisi qui attend qu'on tranche ses associés. */
  const [propose, setPropose] = useState<{
    article: ArticleChoix;
    associations: AssociationVue[];
  } | null>(null);
  const jeton = useRef(0);

  const prestationsFiltrees = useMemo(() => {
    const f = q.trim().toLowerCase();
    if (!f) return prestations.filter((p) => p.actif).slice(0, 5);
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

  // La zone reste ouverte après un ajout : on enchaîne les lignes d'un lot sans
  // avoir à rouvrir le champ à chaque fois.
  function apresAjout() {
    setQ("");
    setArticles([]);
    setPropose(null);
  }

  /**
   * Clic sur un article. On interroge ses ASSOCIATIONS avant de rien poser :
   *
   *  - aucune → on ajoute tout de suite, exactement comme avant. Ouvrir un
   *    panneau pour dire « rien à signaler » ferait fermer sans lire ;
   *  - au moins une → on ouvre la proposition, et RIEN n'est ajouté tant qu'on
   *    n'a pas validé (y compris l'article lui-même).
   *
   * Une lecture qui échoue ne doit pas empêcher d'ajouter l'article : on
   * retombe sur le comportement simple plutôt que de bloquer la saisie.
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

  if (!ouvert) {
    return (
      <button
        onClick={() => setOuvert(true)}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <Plus className="h-4 w-4" />
        Ajouter une ligne{lotTitre ? ` à « ${lotTitre} »` : ""}
      </button>
    );
  }

  return (
    <div className="border-t border-border p-3" onDragOver={onDragOver} onDrop={onDrop}>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          autoFocus
          value={q}
          onChange={(e) => chercher(e.target.value)}
          placeholder="Référence, désignation, prestation…"
          className="h-9 min-w-56 flex-1 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOuvert(false);
          }}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={enCours}
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
              // La ligne s'ouvre en écriture dans la foulée : on vient de
              // demander un texte, la première chose à faire est de le taper.
              const { id } = await ajouterLigneTexte(devisId, { lotId, texte: q.trim() });
              onTexteCree(id);
              apresAjout();
            })
          }
        >
          <Type className="h-3.5 w-3.5" /> Texte
        </Button>
        <button
          onClick={() => setOuvert(false)}
          className="p-1 text-subtle hover:text-fg"
          title="Fermer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tant qu'un article attend qu'on tranche ses associés, la liste de
          résultats s'efface : deux listes empilées, on ne sait plus laquelle
          répond à quoi. */}
      {propose ? (
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
      ) : (
      <div className="mt-2 max-h-72 overflow-y-auto border border-border">
        {cherche && articles.length === 0 && (
          <p className="px-3 py-2 text-sm text-subtle">Recherche…</p>
        )}
        {prestationsFiltrees.map((p) => (
          <button
            key={p.id}
            disabled={enCours}
            onClick={() =>
              agir(async () => {
                await ajouterLignePrestation(devisId, p.id, { lotId });
                apresAjout();
              })
            }
            className="flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left text-sm last:border-0 hover:bg-surface-2"
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
        {articles.map((a) => (
          <button
            key={a.produitId}
            disabled={enCours}
            onClick={() => choisirArticle(a)}
            className="flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left text-sm last:border-0 hover:bg-surface-2"
          >
            <Boxes className="h-4 w-4 shrink-0 text-io-ai" />
            <span className="ref shrink-0 text-muted">{a.refInterne}</span>
            <span className="flex-1 truncate text-fg">{a.designation}</span>
            {/* Le déboursé est annoncé AVANT l'ajout, et on dit d'où il sort.
                Un article sans prix connu doit se voir ici, pas après coup. */}
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
        ))}
        {!cherche && articles.length === 0 && q.trim().length >= 2 && (
          <p className="px-3 py-2 text-sm text-subtle">
            Aucun article du magasin ne correspond — « Divers » chiffre la ligne à la main.
          </p>
        )}
        {q.trim().length < 2 && (
          <p className="px-3 py-2 text-xs text-subtle">
            Tapez deux caractères pour chercher dans le magasin. Les prestations sont listées
            ci-dessus.
          </p>
        )}
      </div>
      )}

      {/* Le référentiel se corrige DEPUIS le devis : c'est en composant qu'on
          s'aperçoit qu'un taux est faux ou qu'une prestation manque, et l'index
          était jusqu'ici le seul chemin pour y aller. */}
      <p className="mt-2 text-xs text-subtle">
        Un taux à corriger, une prestation qui manque ?{" "}
        <Link
          href="/perso/gus/devis/referentiels"
          className="font-semibold text-brand hover:underline"
        >
          Gérer les prestations & coefficients
        </Link>
      </p>
    </div>
  );
}

/* -----------------------------------------------------------------------------
 * UNE LIGNE
 * -------------------------------------------------------------------------- */

function LigneTableau({
  lc,
  devisId,
  enCours,
  agir,
  coefDefaut,
  survolee,
  ouvrirTexte,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  lc: LigneCalculee;
  devisId: string;
  enCours: boolean;
  agir: (fn: () => Promise<unknown>) => void;
  coefDefaut: number;
  survolee: boolean;
  /** Cette ligne de texte vient d'être créée : elle s'ouvre en écriture. */
  ouvrirTexte: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: () => void;
}) {
  const l = lc.ligne;
  const chiffree = ligneChiffree(l.genre);
  // Une rangée qu'on est en train d'écrire ne se glisse pas : sous un parent
  // `draggable`, Chrome refuse de sélectionner du texte à la souris. Le setter
  // d'état est passé tel quel à l'enfant — son identité est stable, l'effet qui
  // le rappelle ne tourne donc pas à chaque rendu.
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
        <td colSpan={8} className="cell-card-title">
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
  // soit le genre de la ligne, et MÊME s'il a été effacé par un prix de vente
  // forcé. Sans ça, forcer un prix une fois interdisait de revenir au calcul.
  const coefSaisissable = l.debourseCents !== null;

  return (
    <tr {...dnd} className={cn(l.option && "opacity-70", liseret)}>
      <td>
        <Poignee />
      </td>

      <td className="cell-title cell-card-title cell-wrap">
        <div className="flex items-start gap-2">
          <span className="mt-1 shrink-0">
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
              {l.refInterne && <span className="ref">{l.refInterne}</span>}
              {l.option && <Badge tone="accent">Option</Badge>}
              {lc.perimee && (
                <span
                  className="inline-flex items-center gap-1 text-warning"
                  title={`Prix au magasin aujourd'hui : ${formatEuros(l.debourseActuelCents)}`}
                >
                  <Clock className="h-3 w-3" />
                  {formatEuros(l.debourseActuelCents)}{" "}
                  aujourd&apos;hui
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
      </td>

      <td data-label="Quantité" className="cell-num">
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
      </td>

      <td data-label="Déboursé" className="cell-num">
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
      </td>

      <td data-label="Coefficient" className="cell-num">
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
        {/* D'où vient ce coefficient — l'écran ne l'affiche JAMAIS sans le dire. */}
        <span
          className={cn(
            "mt-0.5 block text-[0.65rem] leading-tight",
            l.origineCoef === "ligne" && l.coefMillieme !== null ? "text-accent" : "text-subtle",
          )}
        >
          {l.coefMillieme === null
            ? libelleSansCoef(l.genre)
            : l.origineCoef === "devis" && l.coefMillieme === coefDefaut
              ? "défaut"
              : ORIGINE_COEF_LABEL[l.origineCoef]}
        </span>
      </td>

      <td data-label="P.V. unitaire" className="cell-num">
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
      </td>

      <td data-label="Remise" className="cell-num">
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
      </td>

      <td data-label="Total" className="cell-num font-semibold">
        {formatEuros(lc.totalCents)}
        {lc.remiseCents > 0 && (
          <span className="block text-[0.65rem] font-normal text-subtle line-through">
            {formatEuros(lc.brutCents)}
          </span>
        )}
      </td>

      <td>
        <BoutonsLigne l={l} enCours={enCours} agir={agir} />
      </td>
    </tr>
  );
}

/** La poignée de déplacement — même repère visuel que la liste de points. */
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
 * non plus tant qu'on ne lui a pas donné de déboursé. Dire « P.V. forcé »
 * partout laisserait croire à une décision là où il n'y en a pas eu.
 */
function libelleSansCoef(genre: GenreLigne): string {
  if (genre === "PRESTATION") return "taux vendu";
  if (genre === "LIBRE") return "prix saisi";
  return "P.V. forcé";
}

function aideSansCoef(genre: GenreLigne): string {
  if (genre === "PRESTATION") return "Taux de vente du référentiel de prestations";
  if (genre === "LIBRE") return "Prix saisi à la main — renseigner un déboursé ouvre le coefficient";
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
    <span className="flex items-center justify-end gap-0.5">
      {/* Les flèches restent : le glisser-déposer ne marche pas au doigt, et
          c'est le seul moyen de bouger une ligne sur téléphone. */}
      <button
        title="Monter"
        disabled={enCours}
        onClick={() => agir(() => deplacerLigne(l.id, "haut"))}
        className="p-1 text-subtle hover:text-fg"
      >
        <ArrowUp className="h-3.5 w-3.5" />
      </button>
      <button
        title="Descendre"
        disabled={enCours}
        onClick={() => agir(() => deplacerLigne(l.id, "bas"))}
        className="p-1 text-subtle hover:text-fg"
      >
        <ArrowDown className="h-3.5 w-3.5" />
      </button>
      {ligneChiffree(l.genre) && (
        <button
          title={l.option ? "Remettre au devis" : "Passer en option (hors total)"}
          disabled={enCours}
          onClick={() => agir(() => majLigne(l.id, { option: !l.option }))}
          className={cn("p-1 hover:text-accent", l.option ? "text-accent" : "text-subtle")}
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        title="Supprimer la ligne"
        disabled={enCours}
        onClick={() => agir(() => supprimerLigne(l.id))}
        className="p-1 text-subtle hover:text-danger"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

/* -----------------------------------------------------------------------------
 * LE CARTOUCHE — identification et réglages de chiffrage
 * -------------------------------------------------------------------------- */

function EnteteDevis({
  entete,
  affaires,
  clients,
  totaux,
  enCours,
  agir,
}: {
  entete: DevisComplet["entete"];
  affaires: AffaireChoix[];
  clients: string[];
  totaux: ReturnType<typeof calculerDevis>;
  enCours: boolean;
  agir: (fn: () => Promise<unknown>) => void;
}) {
  const [titre, setTitre] = useState(entete.titre);
  const [clientNom, setClientNom] = useState(entete.clientNom);

  return (
    <div className="cartouche anim-rise mb-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        {/* flex-1 : sans lui, le bloc se dimensionne sur son contenu et le
            champ d'objet (w-full) se retrouve tronqué à quelques caractères. */}
        <div className="min-w-0 flex-1">
          <Link
            href="/perso/gus/devis"
            className="mb-1.5 inline-flex items-center gap-1 text-sm text-muted hover:text-brand"
          >
            <ChevronLeft className="h-4 w-4" /> Les devis
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="ref font-display text-2xl font-semibold text-fg">
              {libelleDevis(entete.numero, entete.revision)}
            </h1>
            <Badge tone={TON_ETAT[entete.etat]} point>
              {ETAT_DEVIS_LABEL[entete.etat]}
            </Badge>
            {entete.parentId && (
              <Link
                href={`/perso/gus/devis/${entete.parentId}`}
                className="inline-flex items-center gap-1 text-xs text-muted hover:text-brand"
              >
                <GitBranch className="h-3 w-3" /> révision précédente
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
            className="champ-inline mt-1 w-full max-w-2xl text-base text-muted focus:text-fg"
            title="Objet du devis — modifiable"
          />
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/perso/gus/devis/referentiels"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
          >
            <Settings2 className="h-4 w-4" /> Prestations & coefficients
          </Link>
          <select
            value={entete.etat}
            disabled={enCours}
            onChange={(e) => agir(() => majEnteteDevis(entete.id, { etat: e.target.value }))}
            className="h-[var(--control-h)] rounded-md border border-border bg-surface px-3 text-sm text-fg"
            title={ETAT_DEVIS_AIDE[entete.etat]}
          >
            {ETATS_DEVIS.map((e) => (
              <option key={e} value={e}>
                {ETAT_DEVIS_LABEL[e]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="cartouche-champs mt-4">
        <div>
          <Label>Client</Label>
          <Input
            value={clientNom}
            list="devis-clients"
            onChange={(e) => setClientNom(e.target.value)}
            onBlur={() => {
              if (clientNom !== entete.clientNom) {
                agir(() => majEnteteDevis(entete.id, { clientNom }));
              }
            }}
            placeholder="Nom du client"
          />
          <datalist id="devis-clients">
            {clients.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div>
          <Label htmlFor="e-affaire">Affaire</Label>
          <select
            id="e-affaire"
            value={entete.chantierId ?? ""}
            disabled={enCours}
            onChange={(e) =>
              agir(() => majEnteteDevis(entete.id, { chantierId: e.target.value || null }))
            }
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
          <Label>N° Why</Label>
          <p className="ref flex h-[var(--control-h)] items-center text-fg">
            {entete.numeroWhy ?? <span className="text-subtle">—</span>}
          </p>
        </div>
        <ChampNombre
          label="Coef. par défaut"
          valeur={formatCoef(entete.coefDefautMillieme)}
          aide="S'applique aux articles sans règle propre. Chaque ligne peut le forcer. Figé sur ce devis."
          disabled={enCours}
          onValide={(saisie) => {
            const c = parseCoef(saisie);
            if (c === null) return "Coefficient illisible";
            agir(() => majEnteteDevis(entete.id, { coefDefautMillieme: c }));
            return null;
          }}
        />
        <ChampNombre
          label="TVA"
          valeur={formatPourcent(entete.tauxTvaCentieme)}
          aide="0 % = autoliquidation (sous-traitance bâtiment)."
          disabled={enCours}
          onValide={(saisie) => {
            const t = parsePourcent(saisie);
            if (t === null) return "Taux illisible";
            agir(() => majEnteteDevis(entete.id, { tauxTvaCentieme: t }));
            return null;
          }}
        />
        <ChampNombre
          label="Validité"
          valeur={`${entete.validiteJours} j`}
          disabled={enCours}
          onValide={(saisie) => {
            const n = Number(saisie.replace(/[^\d]/g, ""));
            if (!Number.isFinite(n)) return "Nombre de jours illisible";
            agir(() => majEnteteDevis(entete.id, { validiteJours: n }));
            return null;
          }}
        />
        <div>
          <Label>Lignes</Label>
          <p className="flex h-[var(--control-h)] items-center text-fg">
            {totaux.nbLignes}
            {totaux.nbOptions > 0 && (
              <span className="ml-1.5 text-sm text-subtle">dont {totaux.nbOptions} en option</span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

/* -----------------------------------------------------------------------------
 * LE PANNEAU DE TOTAUX
 * En haut ce qu'on montre au client, en bas — plus petit — ce qui nous regarde.
 * -------------------------------------------------------------------------- */

function PanneauTotaux({
  entete,
  totaux,
  enCours,
  agir,
  onSupprime,
  onRevision,
}: {
  entete: DevisComplet["entete"];
  totaux: ReturnType<typeof calculerDevis>;
  enCours: boolean;
  agir: (fn: () => Promise<unknown>) => void;
  onSupprime: () => void;
  onRevision: () => void;
}) {
  const [confirme, setConfirme] = useState(false);

  return (
    <aside className="lg:sticky lg:top-4 lg:self-start">
      <div className="bloc p-4">
        <h2 className="stamp mb-3">Totaux</h2>
        <dl className="space-y-1.5 text-sm">
          <Poste label="Total HT" valeur={formatEuros(totaux.totalHtCents)} />
          {totaux.remiseGlobaleCents > 0 && (
            <Poste
              label="Remise globale"
              valeur={`− ${formatEuros(totaux.remiseGlobaleCents)}`}
              ton="accent"
            />
          )}
          <Poste label="Net HT" valeur={formatEuros(totaux.netHtCents)} fort />
          <Poste
            label={`TVA ${formatPourcent(entete.tauxTvaCentieme)}`}
            valeur={formatEuros(totaux.tvaCents)}
          />
          <Poste label="Total TTC" valeur={formatEuros(totaux.totalTtcCents)} fort />
        </dl>

        {totaux.optionsCents > 0 && (
          <p className="mt-3 border-t border-border pt-3 text-sm text-muted">
            <span className="stamp block">Options, non comptées</span>
            <span className="font-semibold text-fg">{formatEuros(totaux.optionsCents)}</span>
          </p>
        )}

        <div className="mt-3 border-t border-border pt-3">
          <Label htmlFor="remise-g">Remise globale</Label>
          <div className="mt-1 flex gap-2">
            <Input
              id="remise-g"
              defaultValue={
                entete.remiseGlobalePourMille
                  ? formatPourcent(entete.remiseGlobalePourMille * 10)
                  : ""
              }
              placeholder="ex. 3 %"
              disabled={enCours}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v === "") {
                  agir(() => majEnteteDevis(entete.id, { remiseGlobalePourMille: null }));
                  return;
                }
                const r = parseRemise(v);
                if (r !== null) agir(() => majEnteteDevis(entete.id, { remiseGlobalePourMille: r }));
              }}
              className="text-sm"
            />
            <Input
              defaultValue={entete.remiseGlobaleCents ? formatEuros(entete.remiseGlobaleCents) : ""}
              placeholder="ou en €"
              disabled={enCours}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v === "") {
                  agir(() => majEnteteDevis(entete.id, { remiseGlobaleCents: null }));
                  return;
                }
                const c = parseEuros(v);
                if (c !== null) agir(() => majEnteteDevis(entete.id, { remiseGlobaleCents: c }));
              }}
              className="text-sm"
            />
          </div>
          <p className="mt-1 text-xs text-subtle">
            L&apos;une ou l&apos;autre : poser un montant efface le pourcentage.
          </p>
        </div>
      </div>

      {/* Ce qui nous regarde. Le libellé dit « fourniture » et pas « devis » :
          la main d'œuvre est saisie au taux de vente, son coût est inconnu. */}
      <div className="bloc mt-4 p-4">
        <h2 className="stamp mb-3">Marge sur la fourniture</h2>
        <dl className="space-y-1.5 text-sm">
          <Poste label="Déboursé" valeur={formatEuros(totaux.debourseCents)} />
          <Poste label="Vendu (fourniture)" valeur={formatEuros(totaux.venduFournitureCents)} />
          <Poste
            label="Marge"
            valeur={
              totaux.tauxMargeFournitureCentieme === null
                ? "—"
                : `${formatEuros(totaux.margeFournitureCents)} · ${formatPourcent(totaux.tauxMargeFournitureCentieme)}`
            }
            fort
            ton={totaux.margeFournitureCents <= 0 ? "danger" : undefined}
          />
        </dl>
        {totaux.nbSansPrix > 0 && (
          <p className="mt-3 flex items-start gap-2 border-t border-border pt-3 text-xs text-warning">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {totaux.nbSansPrix} ligne{totaux.nbSansPrix > 1 ? "s" : ""}{" "}
              sans prix d&apos;achat connu : exclue{totaux.nbSansPrix > 1 ? "s" : ""} du déboursé et de la marge. Elles
              comptent bien dans le total vendu.
            </span>
          </p>
        )}
        <p className="mt-3 text-xs text-subtle">
          La main d&apos;œuvre est saisie au taux de vente : son coût n&apos;est pas connu de
          l&apos;outil, elle n&apos;entre donc pas dans ce calcul.
        </p>
      </div>

      <div className="mt-4 space-y-2">
        <Button variant="outline" className="w-full" disabled={enCours} onClick={onRevision}>
          <GitBranch className="h-4 w-4" /> Nouvelle révision
        </Button>
        {confirme ? (
          <div className="border border-danger/40 bg-danger/10 p-3 text-sm">
            <p className="mb-2 text-fg">
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
          <Button
            variant="ghost"
            className="w-full text-danger"
            onClick={() => setConfirme(true)}
            disabled={enCours}
          >
            <Trash2 className="h-4 w-4" /> Supprimer ce devis
          </Button>
        )}
      </div>
    </aside>
  );
}

function Poste({
  label,
  valeur,
  fort,
  ton,
}: {
  label: string;
  valeur: string;
  fort?: boolean;
  ton?: "accent" | "danger";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd
        className={cn(
          "tabular-nums",
          fort ? "font-display text-base font-semibold text-fg" : "text-fg",
          ton === "accent" && "text-accent",
          ton === "danger" && "text-danger",
        )}
      >
        {valeur}
      </dd>
    </div>
  );
}

/* -----------------------------------------------------------------------------
 * PETITS CHAMPS ÉDITABLES
 * Validation au blur ou à Entrée, message d'erreur en place. Échap annule.
 * -------------------------------------------------------------------------- */

/**
 * Le libellé d'une ligne — une ZONE DE TEXTE, pas un champ d'une ligne.
 *
 * Une désignation de catalogue fait couramment quarante caractères
 * (« AUTOMATE DISTECH ECB-253 AVEC ALIMENTATION ») : dans un `<input>`, elle se
 * coupait au milieu, or c'est justement la colonne qu'on lit sur un devis.
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
    <span className="inline-flex flex-col items-end">
      <span className="inline-flex items-baseline gap-1">
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
            "champ-inline w-[4.75rem] text-right text-sm tabular-nums text-fg",
            erreur && "border-danger text-danger",
          )}
        />
        {suffixe && <span className="text-xs text-subtle">{suffixe}</span>}
      </span>
      {erreur && <span className="text-[0.65rem] text-danger">{erreur}</span>}
    </span>
  );
}

function ChampNombre({
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
        value={v}
        disabled={disabled}
        title={aide}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => setErreur(v === valeur ? null : onValide(v))}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className={cn("tabular-nums", erreur && "border-danger")}
      />
      {erreur && <p className="mt-0.5 text-xs text-danger">{erreur}</p>}
    </div>
  );
}
