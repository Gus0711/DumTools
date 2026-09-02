"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Briefcase,
  Building2,
  Circle,
  CircleDashed,
  CircleCheck,
  CircleDot,
  NotebookPen,
  Plus,
  RotateCcw,
  Search,
  Tag,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import type { Obligation } from "./obligations";
import { CorpsTache, corpsRempli } from "./corps-tache";
import { Button, Chiffre, EtatVide, RangeeChiffres } from "@/ui";
import { cn } from "@/lib/cn";
import { useReprendreFiltres, useSyncUrl } from "@/lib/filtres-url";
import type { EtatTache, PrioriteTache } from "@/generated/prisma/enums";
import {
  ETATS_TACHE,
  ETATS_TACHE_DEFAUT,
  PRIORITES,
  RANG_PRIORITE,
  type AssignableUser,
  type DomaineVue,
  type TacheDetail,
} from "./taches";
import {
  assignerTache,
  changerEcheanceTache,
  changerEtatTacheEnFin,
  changerPrioriteTache,
  creerTacheLibre,
  renommerTache,
  supprimerTache,
} from "./taches-actions";

/* =============================================================================
 * « MES TÂCHES » — L'ÉCRAN
 *
 * Le BLOC du même nom (accueil, tableau de bord) répond à « qu'est-ce que je
 * fais maintenant » : borné, terminées écartées. L'écran répond au reste —
 * « qu'est-ce qui reste sur cette affaire », « qu'ai-je fait », « qu'est-ce que
 * personne n'a pris », « qu'est-ce qui est en retard ».
 *
 * QUATRE PARTIS PRIS, et ils se tiennent :
 *
 * 1. TOUT SE CHANGE SUR LA LIGNE. Statut, priorité, échéance : trois `select` /
 *    `input` natifs, pas de menu maison. On garde le clavier, le tactile et le
 *    sélecteur de date du téléphone pour rien, et la ligne reste une ligne.
 *    La pastille ronde reste À CÔTÉ du libellé d'état : elle se lit de loin, le
 *    mot se lit de près, et l'un rattrape l'autre pour qui distingue mal les
 *    couleurs.
 *
 * 2. UNE TÂCHE EST RATTACHÉE À UNE AFFAIRE **OU** À UN DOMAINE. Une seule
 *    colonne « Rattachée à » les montre toutes les deux, avec un glyphe qui
 *    distingue les deux natures. Deux colonnes dont l'une est toujours vide
 *    auraient coûté de la largeur pour rien.
 *
 * 3. L'ÉCHÉANCE PORTE L'URGENCE, PAS LA PRIORITÉ. « Haute » dit ce qui compte,
 *    l'échéance dit ce qui presse — ce n'est pas la même question. Le tri par
 *    défaut, « Ce qui presse », classe donc sur le retard AVANT la priorité.
 *
 * 4. L'ORDRE EST FIGÉ AU MONTAGE. Cocher une tâche ne doit pas la faire sauter
 *    sous le curseur, et une tâche terminée alors que les terminées sont
 *    masquées reste visible jusqu'au prochain chargement — sinon on ne peut pas
 *    défaire un clic malheureux.
 * ========================================================================== */

const SUIVANT: Record<EtatTache, EtatTache> = {
  A_FAIRE: "EN_COURS",
  EN_COURS: "TERMINEE",
  TERMINEE: "A_FAIRE",
};

const PASTILLE: Record<EtatTache, { icone: typeof Circle; cls: string; titre: string }> = {
  A_FAIRE: { icone: Circle, cls: "text-subtle", titre: "À faire" },
  EN_COURS: { icone: CircleDot, cls: "text-accent", titre: "En cours" },
  TERMINEE: { icone: CircleCheck, cls: "text-success", titre: "Terminée" },
};

const RANG_ETAT: Record<EtatTache, number> = { EN_COURS: 0, A_FAIRE: 1, TERMINEE: 2 };

type Tri = "presse" | "priorite" | "affaire" | "recente";

const TRIS: { value: Tri; label: string }[] = [
  { value: "presse", label: "Ce qui presse" },
  { value: "priorite", label: "Par priorité" },
  { value: "affaire", label: "Par rattachement" },
  { value: "recente", label: "Modifiée en dernier" },
];

/** Jours d'écart entre une échéance et aujourd'hui — en jours de CALENDRIER.
 *  Comparer des chaînes `AAAA-MM-JJ` évite le piège du fuseau : deux dates
 *  pures ne se décalent pas d'un jour selon l'heure qu'il est. */
function ecartJours(jour: string): number {
  const [a, m, j] = jour.split("-").map(Number);
  const cible = new Date(a!, m! - 1, j!).getTime();
  const n = new Date();
  const nuit = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  return Math.round((cible - nuit) / 86400000);
}

function libelleEcheance(jour: string): { texte: string; ton: string } {
  const d = ecartJours(jour);
  if (d < 0)
    return {
      texte: d === -1 ? "en retard d'un jour" : `en retard de ${-d} jours`,
      ton: "text-danger font-semibold",
    };
  if (d === 0) return { texte: "aujourd'hui", ton: "text-danger font-semibold" };
  if (d === 1) return { texte: "demain", ton: "text-accent-strong font-medium" };
  if (d <= 7) return { texte: `dans ${d} jours`, ton: "text-accent-strong" };
  return {
    texte: new Date(jour).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }),
    ton: "text-muted",
  };
}

export function MesTachesEcran({
  taches: initiales,
  obligations,
  domaines,
  affaires,
  clientsRef,
  utilisateurs,
  moiId,
}: {
  taches: TacheDetail[];
  /** Ce que le système DÉDUIT et que personne n'a écrit — voir obligations.ts.
   *  Elles ne se cochent pas : elles s'éteignent quand leur cause disparaît. */
  obligations: Obligation[];
  domaines: DomaineVue[];
  affaires: { id: string; nom: string; clientNom: string; numeroWhy: string | null }[];
  clientsRef: { id: string; nom: string }[];
  utilisateurs: AssignableUser[];
  moiId: string | null;
}) {
  const params = useSearchParams();
  const [taches, setTaches] = useState(initiales);
  const [erreur, setErreur] = useState("");
  const [query, setQuery] = useState(() => params.get("q") ?? "");
  const [qui, setQui] = useState(() => params.get("qui") ?? "moi");
  const [client, setClient] = useState(() => params.get("client") ?? "");
  const [rattachement, setRattachement] = useState(() => params.get("ou") ?? "");
  const [tri, setTri] = useState<Tri>(
    () => (TRIS.find((t) => t.value === params.get("tri"))?.value ?? "presse") as Tri,
  );
  const [etats, setEtats] = useState<Set<EtatTache>>(() => {
    const brut = params.get("etats");
    if (brut === "aucun") return new Set();
    if (brut) return new Set(brut.split(",") as EtatTache[]);
    return new Set(ETATS_TACHE_DEFAUT);
  });
  const [avecDeduites, setAvecDeduites] = useState(() => params.get("deduites") !== "0");
  /** La tâche dont le corps est ouvert — UNE seule à la fois : deux éditeurs
   *  BlockNote côte à côte, c'est deux ProseMirror pour une seule attention. */
  const [corpsOuvert, setCorpsOuvert] = useState<string | null>(null);
  const [creation, setCreation] = useState(false);
  const tmpSeq = useRef(0);

  useReprendreFiltres(
    "mes-taches",
    ["q", "qui", "client", "ou", "etats", "tri", "deduites"],
    (v) => {
    setQuery(v("q") ?? "");
    setQui(v("qui") ?? "moi");
    setClient(v("client") ?? "");
    setRattachement(v("ou") ?? "");
    const t = v("tri");
    if (t && TRIS.some((x) => x.value === t)) setTri(t as Tri);
      const e = v("etats");
      if (e === "aucun") setEtats(new Set());
      else if (e) setEtats(new Set(e.split(",") as EtatTache[]));
      setAvecDeduites(v("deduites") !== "0");
    },
  );

  const etatsParDefaut =
    etats.size === ETATS_TACHE_DEFAUT.length && ETATS_TACHE_DEFAUT.every((e) => etats.has(e));

  useSyncUrl(
    {
      q: query,
      qui: qui === "moi" ? "" : qui,
      client,
      ou: rattachement,
      etats: etatsParDefaut ? "" : [...etats].join(",") || "aucun",
      tri: tri === "presse" ? "" : tri,
      deduites: avecDeduites ? "" : "0",
    },
    "mes-taches",
  );

  /* --- Qui ---------------------------------------------------------------- */

  const parPersonne = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of taches) {
      if (t.etat === "TERMINEE") continue;
      m.set(t.assigneId ?? "AUCUN", (m.get(t.assigneId ?? "AUCUN") ?? 0) + 1);
    }
    return m;
  }, [taches]);

  const estAMoi = (t: TacheDetail) => moiId != null && t.assigneId === moiId;

  /* --- Filtrage ----------------------------------------------------------- */

  const [instantane] = useState(() => initiales.map((t) => t.id));
  const rang = useMemo(() => new Map(instantane.map((id, i) => [id, i])), [instantane]);

  const filtrees = useMemo(() => {
    const f = query.trim().toLowerCase();
    return taches.filter((t) => {
      if (!etats.has(t.etat)) return false;
      if (qui === "moi" && !estAMoi(t)) return false;
      if (qui === "AUCUN" && t.assigneId !== null) return false;
      if (qui !== "moi" && qui !== "tous" && qui !== "AUCUN" && t.assigneId !== qui) return false;
      // Le CLIENT est une question à part : il vaut pour une tâche d'affaire
      // comme pour une tâche posée directement sur le client.
      if (client === "AUCUN" && t.clientId !== null) return false;
      if (client && client !== "AUCUN" && t.clientId !== client) return false;
      if (rattachement === "AFFAIRE" && t.affaireId === null) return false;
      if (rattachement === "CLIENT" && !t.clientDirect) return false;
      if (rattachement === "INTERNE" && (t.affaireId !== null || t.clientId !== null))
        return false;
      if (rattachement.startsWith("d:") && t.domaineId !== rattachement.slice(2)) return false;
      if (!f) return true;
      return (
        t.titre.toLowerCase().includes(f) ||
        (t.affaireNom ?? "").toLowerCase().includes(f) ||
        (t.clientNom ?? "").toLowerCase().includes(f) ||
        (t.domaineNom ?? "").toLowerCase().includes(f) ||
        (t.numeroWhy ?? "").toLowerCase().includes(f)
      );
    });
    // `estAMoi` est une fonction locale stable en pratique (elle ne lit que moiId).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taches, etats, qui, client, rattachement, query, moiId]);

  /**
   * Les obligations passent par les mêmes filtres que les tâches — sauf ceux
   * qui n'ont pas de sens pour elles : ni état (elles ne se cochent pas), ni
   * priorité. Leur destinataire est celui qui SUIT l'affaire.
   */
  const obligationsFiltrees = useMemo(() => {
    if (!avecDeduites) return [];
    const f = query.trim().toLowerCase();
    return obligations.filter((o) => {
      // `pourTous` : un référentiel incomplet gêne tout le monde, y compris sur
      // les affaires qu'on ne suit pas. Le filtre « qui » ne doit pas le taire,
      // sinon ce que personne ne suit n'est vu par personne.
      if (!o.pourTous) {
        if (qui === "moi" && o.suiviParId !== moiId) return false;
        if (qui === "AUCUN" && o.suiviParId !== null) return false;
        if (qui !== "moi" && qui !== "tous" && qui !== "AUCUN" && o.suiviParId !== qui)
          return false;
      }
      if (client === "AUCUN" && o.clientId !== null) return false;
      if (client && client !== "AUCUN" && o.clientId !== client) return false;
      if (rattachement === "AFFAIRE" && o.affaireId === null) return false;
      // Une obligation naît d'une affaire ou d'un devis : jamais d'un domaine
      // interne ni d'un client seul. Ces deux filtres-là la font donc taire.
      if (rattachement === "CLIENT" || rattachement === "INTERNE") return false;
      if (rattachement.startsWith("d:")) return false;
      if (!f) return true;
      return (
        o.titre.toLowerCase().includes(f) ||
        (o.affaireNom ?? "").toLowerCase().includes(f) ||
        (o.clientNom ?? "").toLowerCase().includes(f)
      );
    });
  }, [obligations, avecDeduites, qui, client, rattachement, query, moiId]);

  const visibles = useMemo(() => {
    const stable = (a: TacheDetail, b: TacheDetail) =>
      (rang.get(a.id) ?? 1e9) - (rang.get(b.id) ?? 1e9);
    // Sans échéance = pas en retard, mais pas prioritaire non plus : on la
    // range APRÈS tout ce qui a une date, jamais devant.
    const urgence = (t: TacheDetail) => (t.echeance ? ecartJours(t.echeance) : 9999);
    return [...filtrees].sort((a, b) => {
      if (tri === "priorite")
        return (
          RANG_PRIORITE[a.priorite] - RANG_PRIORITE[b.priorite] ||
          RANG_ETAT[a.etat] - RANG_ETAT[b.etat] ||
          stable(a, b)
        );
      // Par rattachement : les clients d'abord (alphabétique), l'interne en
      // dernier — le « ￿ » le pousse en fin de tri sans cas particulier.
      if (tri === "affaire") {
        const cle = (t: TacheDetail) => t.clientNom ?? `￿${t.domaineNom ?? ""}`;
        return (
          cle(a).localeCompare(cle(b)) ||
          (a.affaireNom ?? "").localeCompare(b.affaireNom ?? "") ||
          RANG_ETAT[a.etat] - RANG_ETAT[b.etat] ||
          stable(a, b)
        );
      }
      if (tri === "recente") return b.modifieeLe.localeCompare(a.modifieeLe) || stable(a, b);
      // « Ce qui presse » : le retard d'abord, la priorité ensuite. Les
      // terminées descendent quoi qu'il arrive — elles ne pressent plus.
      return (
        RANG_ETAT[a.etat] === 2 && RANG_ETAT[b.etat] !== 2
          ? 1
          : RANG_ETAT[b.etat] === 2 && RANG_ETAT[a.etat] !== 2
            ? -1
            : urgence(a) - urgence(b) ||
              RANG_PRIORITE[a.priorite] - RANG_PRIORITE[b.priorite] ||
              RANG_ETAT[a.etat] - RANG_ETAT[b.etat] ||
              stable(a, b)
      );
    });
  }, [filtrees, tri, rang]);

  /**
   * La liste rendue : tâches et obligations dans UNE colonne de temps.
   *
   * Plutôt que d'inventer un troisième axe de tri, on projette les obligations
   * sur l'échelle qui existe déjà — celle de l'urgence :
   *   · une ALERTE (quelque chose est faux ou périmé) vaut « aujourd'hui » ;
   *   · un RAPPEL (quelque chose attend) vaut « sans date ».
   * Deux règles, énonçables en une phrase, et rien de nouveau à comprendre.
   * Les autres tris (priorité, rattachement, récence) rangent les obligations
   * en fin de liste : elles n'ont ni priorité ni date de modification, et leur
   * inventer une valeur ferait mentir la colonne.
   */
  const rendues = useMemo(() => {
    const taches = visibles.map((t) => ({ type: "tache" as const, t }));
    const obl = obligationsFiltrees.map((o) => ({ type: "obligation" as const, o }));
    if (obl.length === 0) return taches;
    if (tri !== "presse") return [...taches, ...obl];

    const cle = (x: (typeof taches)[number] | (typeof obl)[number]) =>
      x.type === "tache"
        ? x.t.etat === "TERMINEE"
          ? 1e6
          : x.t.echeance
            ? ecartJours(x.t.echeance)
            : 9999
        : x.o.gravite === "alerte"
          ? 0
          : 9999;
    return [...taches, ...obl].sort((a, b) => cle(a) - cle(b));
  }, [visibles, obligationsFiltrees, tri]);

  /* --- Compteurs (sur le périmètre « qui », pas sur les autres filtres) ---- */

  const duPerimetre = useMemo(
    () =>
      taches.filter((t) => {
        if (qui === "moi") return estAMoi(t);
        if (qui === "AUCUN") return t.assigneId === null;
        if (qui === "tous") return true;
        return t.assigneId === qui;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [taches, qui, moiId],
  );
  const enRetard = duPerimetre.filter(
    (t) => t.etat !== "TERMINEE" && t.echeance && ecartJours(t.echeance) < 0,
  ).length;
  const enCours = duPerimetre.filter((t) => t.etat === "EN_COURS").length;
  const aFaire = duPerimetre.filter((t) => t.etat === "A_FAIRE").length;
  const terminees = duPerimetre.filter((t) => t.etat === "TERMINEE").length;

  const parEtat = useMemo(() => {
    const m = new Map<EtatTache, number>();
    for (const t of duPerimetre) m.set(t.etat, (m.get(t.etat) ?? 0) + 1);
    return m;
  }, [duPerimetre]);

  /** Les obligations du périmètre « qui » — sans les autres filtres, comme les
   *  puces d'état : un compteur doit dire ce qu'on trouverait en élargissant,
   *  pas ce qui reste après avoir tout restreint. */
  const obligationsPerimetre = useMemo(
    () =>
      obligations.filter((o) => {
        if (o.pourTous) return true;
        if (qui === "moi") return o.suiviParId === moiId;
        if (qui === "AUCUN") return o.suiviParId === null;
        if (qui === "tous") return true;
        return o.suiviParId === qui;
      }),
    [obligations, qui, moiId],
  );

  const clients = useMemo(() => {
    const m = new Map<string, { nom: string; n: number }>();
    for (const t of duPerimetre) {
      if (!t.clientId) continue;
      const c = m.get(t.clientId) ?? { nom: t.clientNom ?? "", n: 0 };
      c.n += 1;
      m.set(t.clientId, c);
    }
    return [...m].sort((a, b) => a[1].nom.localeCompare(b[1].nom));
  }, [duPerimetre]);

  const sansClient = duPerimetre.filter((t) => t.clientId === null).length;

  const filtreActif =
    query.trim() !== "" ||
    qui !== "moi" ||
    client !== "" ||
    rattachement !== "" ||
    !etatsParDefaut ||
    !avecDeduites ||
    tri !== "presse";

  function reinitialiser() {
    setQuery("");
    setQui("moi");
    setClient("");
    setRattachement("");
    setEtats(new Set(ETATS_TACHE_DEFAUT));
    setTri("presse");
    setAvecDeduites(true);
  }

  /* --- Mutations, toutes optimistes --------------------------------------- */

  function muter(id: string, champs: Partial<TacheDetail>, action: () => Promise<unknown>) {
    const avant = taches;
    setTaches((cur) => cur.map((t) => (t.id === id ? { ...t, ...champs } : t)));
    setErreur("");
    action().catch((e) => {
      setTaches(avant);
      setErreur(e instanceof Error ? e.message : "Erreur — modification annulée");
    });
  }

  function creer(p: {
    titre: string;
    chantierId: string | null;
    clientId: string | null;
    domaine: string | null;
    priorite: PrioriteTache;
    echeance: string | null;
  }) {
    const tempId = `tmp-${++tmpSeq.current}`;
    const affaire = p.chantierId ? affaires.find((a) => a.id === p.chantierId) : null;
    const cli = p.clientId ? clientsRef.find((c) => c.id === p.clientId) : null;
    const domaine = p.domaine
      ? domaines.find((d) => d.nom.toLowerCase() === p.domaine!.trim().toLowerCase())
      : null;
    const optimiste: TacheDetail = {
      id: tempId,
      titre: p.titre,
      etat: "A_FAIRE",
      priorite: p.priorite,
      echeance: p.echeance,
      affaireId: affaire?.id ?? null,
      affaireNom: affaire?.nom ?? null,
      // Le client vient de l'affaire, ou du rattachement direct — jamais des
      // deux : même règle que `resoudreRattachement`, côté serveur.
      clientId: cli?.id ?? null,
      clientNom: affaire?.clientNom ?? cli?.nom ?? null,
      clientDirect: !affaire && !!cli,
      numeroWhy: affaire?.numeroWhy ?? null,
      domaineId: domaine?.id ?? null,
      domaineNom: domaine?.nom ?? p.domaine?.trim() ?? null,
      assigneId: moiId,
      assigneNom: utilisateurs.find((u) => u.id === moiId)?.nom ?? null,
      creeeLe: new Date().toISOString(),
      modifieeLe: new Date().toISOString(),
      contenu: null,
      version: 0,
    };
    setTaches((cur) => [optimiste, ...cur]);
    setErreur("");
    creerTacheLibre({
      titre: p.titre,
      chantierId: p.chantierId,
      clientId: p.clientId,
      domaine: p.domaine,
      priorite: p.priorite,
      echeance: p.echeance,
    })
      .then(({ id }) => setTaches((cur) => cur.map((t) => (t.id === tempId ? { ...t, id } : t))))
      .catch((e) => {
        setTaches((cur) => cur.filter((t) => t.id !== tempId));
        setErreur(e instanceof Error ? e.message : "Erreur — tâche non créée");
      });
  }

  return (
    <>
      <RangeeChiffres className="mb-5">
        {/* QUATRE compteurs : un cinquième passait seul à la ligne et laissait
            un pavé vide. « En cours » et « À faire » ont fusionné en « À
            traiter » — les deux puces d'état juste en dessous portent déjà le
            détail, et un chiffre qui répète une puce ne se lit plus. */}
        <Chiffre
          label="À traiter"
          valeur={aFaire + enCours}
          detail={enCours > 0 ? `dont ${enCours} en cours` : "rien de lancé"}
        />
        <Chiffre
          label="En retard"
          valeur={enRetard}
          ton={enRetard > 0 ? "danger" : "success"}
          detail={enRetard > 0 ? "échéance dépassée" : "rien de dépassé"}
        />
        <Chiffre
          label="Signalées"
          valeur={obligationsPerimetre.length}
          ton={obligationsPerimetre.some((o) => o.gravite === "alerte") ? "danger" : "neutre"}
          detail="déduites, non écrites"
        />
        <Chiffre label="Terminées" valeur={terminees} ton="success" detail="depuis toujours" />
      </RangeeChiffres>

      <section className="bloc signal-accent">
        <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-3 py-2">
          <div className="relative min-w-48 max-w-72 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher…"
              className={cn(
                "h-9 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm text-fg",
                "transition-[border-color,box-shadow] duration-150",
                "placeholder:text-subtle hover:border-brand/40 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20",
              )}
            />
          </div>

          <select
            value={qui}
            onChange={(e) => setQui(e.target.value)}
            aria-label="Filtrer par personne"
            className={selectFiltre}
          >
            <option value="moi">Moi ({parPersonne.get(moiId ?? "") ?? 0})</option>
            <option value="tous">Tout le monde</option>
            <option value="AUCUN">Personne ({parPersonne.get("AUCUN") ?? 0})</option>
            {utilisateurs
              .filter((u) => u.id !== moiId)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nom} ({parPersonne.get(u.id) ?? 0})
                </option>
              ))}
          </select>

          {/* DEUX sélecteurs, pas un seul mêlant tout : « quel client » et
              « quelle nature de rattachement » sont deux questions, et la liste
              unique où les clients dormaient dans un `optgroup` ne se voyait
              pas — on ne trouve pas ce qu'on ne sait pas chercher. */}
          <select
            value={client}
            onChange={(e) => setClient(e.target.value)}
            aria-label="Filtrer par client"
            className={cn(selectFiltre, client ? "text-fg" : "text-subtle")}
          >
            <option value="">Client : tous</option>
            {clients.map(([id, c]) => (
              <option key={id} value={id}>
                {c.nom} ({c.n})
              </option>
            ))}
            {sansClient > 0 && <option value="AUCUN">Sans client ({sansClient})</option>}
          </select>

          <select
            value={rattachement}
            onChange={(e) => setRattachement(e.target.value)}
            aria-label="Filtrer par nature de rattachement"
            className={cn(selectFiltre, rattachement ? "text-fg" : "text-subtle")}
          >
            <option value="">Partout</option>
            <option value="AFFAIRE">Sur une affaire</option>
            <option value="CLIENT">Sur un client, sans affaire</option>
            <option value="INTERNE">Interne</option>
            <optgroup label="Un domaine en particulier">
              {domaines
                .filter((d) => d.actif)
                .map((d) => (
                  <option key={d.id} value={`d:${d.id}`}>
                    {d.nom}
                  </option>
                ))}
            </optgroup>
          </select>

          <select
            value={tri}
            onChange={(e) => setTri(e.target.value as Tri)}
            aria-label="Trier"
            className={selectFiltre}
          >
            {TRIS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          <div className="ml-auto flex min-w-0 items-center gap-1.5 overflow-x-auto sm:flex-wrap sm:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {ETATS_TACHE.map((e) => {
              const actif = etats.has(e.value);
              const p = PASTILLE[e.value];
              const Icone = p.icone;
              return (
                <button
                  key={e.value}
                  type="button"
                  onClick={() =>
                    setEtats((s) => {
                      const n = new Set(s);
                      if (n.has(e.value)) n.delete(e.value);
                      else n.add(e.value);
                      return n;
                    })
                  }
                  aria-pressed={actif}
                  className={cn(
                    "inline-flex min-h-[2.25rem] shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs font-medium sm:min-h-0 sm:px-2.5 sm:py-1",
                    "transition-[opacity,border-color,background-color] duration-150",
                    actif
                      ? "border-border bg-surface-2 text-fg opacity-100"
                      : "border-transparent text-muted opacity-55 hover:opacity-90",
                  )}
                >
                  <Icone className={cn("h-3.5 w-3.5 shrink-0", actif && p.cls)} />
                  {e.label}
                  <span className="font-mono tabular-nums opacity-70">
                    {parEtat.get(e.value) ?? 0}
                  </span>
                </button>
              );
            })}
            {/* D'une autre nature que les puces d'état : celles-ci trient ce
                qu'on a écrit, celui-ci fait entrer (ou taire) ce que le système
                a déduit. D'où le trait qui l'en sépare. */}
            <span className="mx-0.5 hidden h-5 w-px bg-hairline sm:block" aria-hidden />
            <button
              type="button"
              onClick={() => setAvecDeduites((v) => !v)}
              aria-pressed={avecDeduites}
              title="Ce que le système signale : besoin matériel jamais arrêté, éléments non reliés, devis échus…"
              className={cn(
                "inline-flex min-h-[2.25rem] shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs font-medium sm:min-h-0 sm:px-2.5 sm:py-1",
                "transition-[opacity,border-color,background-color] duration-150",
                avecDeduites
                  ? "border-border bg-surface-2 text-fg opacity-100"
                  : "border-transparent text-muted opacity-55 hover:opacity-90",
              )}
            >
              <CircleDashed className="h-3.5 w-3.5 shrink-0" />
              Signalées
              <span className="font-mono tabular-nums opacity-70">
                {obligationsPerimetre.length}
              </span>
            </button>

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

        {erreur && (
          <p className="flex items-center gap-1.5 border-b border-hairline bg-danger/8 px-4 py-2 text-sm text-danger">
            <TriangleAlert className="h-4 w-4 shrink-0" /> {erreur}
          </p>
        )}

        {/* --- Créer ------------------------------------------------------- */}
        {creation ? (
          <FormulaireCreation
            affaires={affaires}
            clientsRef={clientsRef}
            domaines={domaines}
            onAnnuler={() => setCreation(false)}
            onCreer={(p) => {
              creer(p);
              setCreation(false);
            }}
          />
        ) : (
          <div className="border-b border-hairline px-3 py-2">
            <Button size="sm" variant="ghost" onClick={() => setCreation(true)}>
              <Plus className="h-4 w-4" /> Nouvelle tâche
            </Button>
          </div>
        )}

        {rendues.length === 0 ? (
          <EtatVide
            dessin="carnet"
            titre={taches.length === 0 ? "Aucune tâche" : "Aucune tâche ne correspond"}
            texte={
              taches.length === 0
                ? "Créez la première ci-dessus — avec ou sans affaire."
                : "Élargissez les états retenus, changez de personne, ou effacez la recherche."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table table-cards">
              <thead>
                <tr>
                  <th>Tâche</th>
                  <th>Client</th>
                  <th>Rattachée à</th>
                  <th>Échéance</th>
                  <th>Priorité</th>
                  <th>Statut</th>
                  {qui !== "moi" && <th>Assignée à</th>}
                  <th />
                </tr>
              </thead>
              <tbody>
                {rendues.map((x) =>
                  x.type === "obligation" ? (
                    <LigneObligation
                      key={x.o.id}
                      obligation={x.o}
                      montrerAssigne={qui !== "moi"}
                    />
                  ) : (
                  <Ligne
                    key={x.t.id}
                    tache={x.t}
                    montrerAssigne={qui !== "moi"}
                    utilisateurs={utilisateurs}
                    moiId={moiId}
                    deplie={corpsOuvert === x.t.id}
                    onDeplier={() =>
                      setCorpsOuvert((cur) => (cur === x.t.id ? null : x.t.id))
                    }
                    nbColonnes={qui !== "moi" ? 8 : 7}
                    onEtat={(etat) =>
                      muter(x.t.id, { etat }, () => changerEtatTacheEnFin(x.t.id, etat))
                    }
                    onPriorite={(priorite) =>
                      muter(x.t.id, { priorite }, () => changerPrioriteTache(x.t.id, priorite))
                    }
                    onEcheance={(echeance) =>
                      muter(x.t.id, { echeance }, () => changerEcheanceTache(x.t.id, echeance))
                    }
                    onTitre={(titre) =>
                      muter(x.t.id, { titre }, () => renommerTache(x.t.id, titre))
                    }
                    onAssigne={(u) =>
                      muter(
                        x.t.id,
                        { assigneId: u?.id ?? null, assigneNom: u?.nom ?? null },
                        () => assignerTache(x.t.id, u?.id ?? null),
                      )
                    }
                    onSupprimer={() => {
                      const avant = taches;
                      setTaches((cur) => cur.filter((y) => y.id !== x.t.id));
                      supprimerTache(x.t.id).catch((e) => {
                        setTaches(avant);
                        setErreur(e instanceof Error ? e.message : "Suppression annulée");
                      });
                    }}
                  />
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

const selectFiltre = cn(
  "h-9 w-44 shrink-0 cursor-pointer rounded-md border border-border bg-surface px-2 text-sm text-fg",
  "transition-[border-color] duration-150 hover:border-brand/40 focus:border-brand focus:outline-none",
);

/** Un `select` déguisé en badge : la valeur se lit comme du texte, la commande
 *  n'apparaît qu'au survol. On garde ainsi le clavier et le tactile natifs sans
 *  poser une bordure de formulaire sur chaque ligne du tableau. */
const selectBadge = cn(
  "cursor-pointer appearance-none rounded-md border border-transparent bg-transparent",
  "px-1.5 py-0.5 text-xs font-medium transition-colors",
  "hover:border-border hover:bg-surface-2 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20",
);

function Ligne({
  tache: t,
  montrerAssigne,
  utilisateurs,
  moiId,
  deplie,
  onDeplier,
  nbColonnes,
  onEtat,
  onPriorite,
  onEcheance,
  onTitre,
  onAssigne,
  onSupprimer,
}: {
  tache: TacheDetail;
  montrerAssigne: boolean;
  utilisateurs: AssignableUser[];
  moiId: string | null;
  deplie: boolean;
  onDeplier: () => void;
  /** Pour le `colSpan` de la rangée du corps — la colonne « Assignée à »
   *  n'existe que hors du filtre « moi ». */
  nbColonnes: number;
  onEtat: (e: EtatTache) => void;
  onPriorite: (p: PrioriteTache) => void;
  onEcheance: (j: string | null) => void;
  onTitre: (titre: string) => void;
  onAssigne: (u: AssignableUser | null) => void;
  onSupprimer: () => void;
}) {
  const [edition, setEdition] = useState(false);
  const p = PASTILLE[t.etat];
  const Pastille = p.icone;
  const prio = PRIORITES.find((x) => x.value === t.priorite)!;
  const enAttente = t.id.startsWith("tmp-");
  const rempli = corpsRempli(t.contenu);

  return (
    <>
    <tr className={cn("group/ligne", enAttente && "opacity-50")}>
      <td className="cell-title cell-card-title cell-wrap">
        <span className="flex items-start gap-2">
          {edition ? (
            <input
              autoFocus
              defaultValue={t.titre}
              onFocus={(e) => e.target.select()}
              onBlur={(e) => {
                setEdition(false);
                const v = e.target.value.trim();
                if (v && v !== t.titre) onTitre(v);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setEdition(false);
              }}
              className="min-w-0 flex-1 rounded border border-brand bg-surface px-1.5 py-0.5 text-sm text-fg focus:outline-none"
            />
          ) : (
            <span className="flex min-w-0 flex-1 items-start gap-1.5">
              <button
                type="button"
                onClick={() => setEdition(true)}
                disabled={enAttente}
                title="Modifier le libellé"
                className={cn(
                  "min-w-0 flex-1 break-words text-left transition-colors hover:text-brand",
                  t.etat === "TERMINEE" && "text-muted line-through",
                )}
              >
                {t.titre}
              </button>
              {/* Le repère de corps : il dit s'il y a quelque chose à lire SANS
                  qu'on ait à déplier dix lignes pour le découvrir. Plein quand
                  la tâche porte une note, en pointillé sinon. */}
              <button
                type="button"
                onClick={() => onDeplier()}
                disabled={enAttente}
                aria-expanded={deplie}
                title={
                  rempli
                    ? "Voir la note de cette tâche"
                    : "Ajouter une note : contexte, sous-étapes, photo…"
                }
                className={cn(
                  "-my-0.5 shrink-0 rounded p-1 transition-colors",
                  rempli ? "text-accent-strong hover:bg-surface-2" : "text-subtle opacity-0 hover:bg-surface-2 hover:text-fg focus-visible:opacity-100 group-hover/ligne:opacity-100",
                  deplie && "bg-surface-2 text-fg opacity-100",
                )}
              >
                <NotebookPen className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
        </span>
      </td>

      {/* Le CLIENT a sa colonne. Il n'était plus qu'un suffixe gris derrière le
          nom d'affaire : illisible en balayant la liste, et impossible à
          retrouver quand la tâche est posée sur le client sans affaire. */}
      <td data-label="Client" className="cell-wrap">
        {t.clientId ? (
          <Link
            href={`/clients/${t.clientId}`}
            className="inline-flex items-center gap-1.5 transition-colors hover:text-brand"
          >
            <Building2 className="h-3.5 w-3.5 shrink-0 text-accent-strong" />
            <span className="min-w-0">{t.clientNom}</span>
          </Link>
        ) : (
          <span className="text-subtle">—</span>
        )}
      </td>

      <td data-label="Rattachée à" className="cell-wrap">
        {t.affaireId ? (
          <Link
            href={`/affaires/${t.affaireId}`}
            className="inline-flex items-baseline gap-1.5 transition-colors hover:text-brand"
            title={t.numeroWhy ?? undefined}
          >
            <Briefcase className="h-3.5 w-3.5 shrink-0 self-center text-accent-strong" />
            <span className="min-w-0">{t.affaireNom}</span>
          </Link>
        ) : t.clientDirect ? (
          /* Rattachée au client, pas à une affaire : on le DIT, sinon la case
             vide se lit comme un oubli au lieu d'une intention. */
          <span className="text-subtle">aucune affaire</span>
        ) : t.domaineNom ? (
          <span className="inline-flex items-center gap-1.5 text-muted">
            <Tag className="h-3.5 w-3.5 shrink-0" />
            {t.domaineNom}
          </span>
        ) : (
          <span className="text-subtle">— interne —</span>
        )}
      </td>

      <td data-label="Échéance">
        <CelluleEcheance
          jour={t.echeance}
          terminee={t.etat === "TERMINEE"}
          desactive={enAttente}
          onChange={onEcheance}
        />
      </td>

      <td data-label="Priorité">
        <span className="inline-flex items-center gap-1">
          <span className={cn("font-mono text-xs", prio.classe)} aria-hidden>
            {prio.glyphe}
          </span>
          <select
            value={t.priorite}
            onChange={(e) => onPriorite(e.target.value as PrioriteTache)}
            disabled={enAttente}
            aria-label="Priorité"
            className={cn(selectBadge, prio.classe)}
          >
            {PRIORITES.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </span>
      </td>

      <td data-label="Statut">
        {/* La pastille et le mot vivent ENSEMBLE : le rond se lit d'un balayage
            de colonne, le mot se lit de près, et l'un rattrape l'autre pour qui
            distingue mal les couleurs. Séparés aux deux bouts de la ligne, ils
            racontaient deux fois la même chose sans se répondre.
            Le rond avance d'une étape (le geste « je coche »), le menu pose
            l'état voulu directement. */}
        <span className="inline-flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onEtat(SUIVANT[t.etat])}
            disabled={enAttente}
            title={`${p.titre} — cliquer pour passer à l'étape suivante`}
            aria-label={`${p.titre} — étape suivante`}
            className={cn("shrink-0 rounded-full transition-colors", p.cls)}
          >
            <Pastille className="h-4 w-4" />
          </button>
          <select
            value={t.etat}
            onChange={(e) => onEtat(e.target.value as EtatTache)}
            disabled={enAttente}
            aria-label="Statut"
            className={cn(selectBadge, p.cls, "font-semibold")}
          >
            {ETATS_TACHE.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
        </span>
      </td>

      {montrerAssigne && (
        <td data-label="Assignée à">
          <select
            value={t.assigneId ?? ""}
            onChange={(e) =>
              onAssigne(utilisateurs.find((u) => u.id === e.target.value) ?? null)
            }
            disabled={enAttente}
            aria-label="Assignée à"
            className={cn(selectBadge, t.assigneId ? "text-fg" : "text-subtle")}
          >
            <option value="">Personne</option>
            {utilisateurs.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nom}
                {u.id === moiId ? " (moi)" : ""}
              </option>
            ))}
          </select>
        </td>
      )}

      <td className="text-right">
        <button
          type="button"
          onClick={onSupprimer}
          disabled={enAttente}
          title="Supprimer la tâche"
          className="rounded p-1 text-subtle transition-colors hover:bg-danger/10 hover:text-danger"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>

    {/* Le CORPS, sous sa tâche. Une rangée pleine largeur plutôt qu'un panneau
        latéral : la note appartient à la ligne qu'on lit, et l'éditeur a besoin
        de toute la largeur pour qu'une liste à cocher reste lisible. */}
    {deplie && !enAttente && (
      <tr>
        <td colSpan={nbColonnes} className="!py-0">
          <div className="border-l-2 border-l-accent bg-surface-2/50 px-4 py-3">
            <CorpsTache
              tacheId={t.id}
              contenu={t.contenu}
              version={t.version}
              majLe={t.modifieeLe}
            />
          </div>
        </td>
      </tr>
    )}
    </>
  );
}

/**
 * Une ligne DÉDUITE. Elle se distingue d'une tâche par trois choses, et les
 * trois disent la même : ce n'est pas vous qui l'avez écrite.
 *
 *   · pas de pastille à cocher — un rond pointillé, qu'on ne peut pas cliquer :
 *     une obligation ne se termine pas, elle s'éteint quand sa cause disparaît ;
 *   · pas d'échéance ni de priorité — les inventer ferait mentir la colonne ;
 *   · pas de corbeille — on ne supprime pas un constat, on le règle.
 *
 * Tout le reste (client, rattachement) est aligné sur la ligne de tâche : les
 * deux natures se lisent dans les mêmes colonnes, sinon l'œil ne balaie plus.
 */
function LigneObligation({
  obligation: o,
  montrerAssigne,
}: {
  obligation: Obligation;
  montrerAssigne: boolean;
}) {
  const alerte = o.gravite === "alerte";
  return (
    <tr className="bg-surface-2/40">
      <td className="cell-title cell-card-title cell-wrap">
        <span className="flex items-start gap-2">
          <CircleDashed
            className={cn("mt-0.5 h-4 w-4 shrink-0", alerte ? "text-danger" : "text-subtle")}
            aria-hidden
          />
          <Link
            href={o.href}
            className="group inline-flex min-w-0 flex-col gap-0.5 transition-colors hover:text-brand"
          >
            <span className={cn("break-words", alerte && "font-semibold text-danger")}>
              {o.titre}
            </span>
            {o.detail && <span className="text-xs font-normal text-subtle">{o.detail}</span>}
          </Link>
        </span>
      </td>

      <td data-label="Client" className="cell-wrap">
        {o.clientId ? (
          <Link
            href={`/clients/${o.clientId}`}
            className="inline-flex items-center gap-1.5 transition-colors hover:text-brand"
          >
            <Building2 className="h-3.5 w-3.5 shrink-0 text-accent-strong" />
            <span className="min-w-0">{o.clientNom}</span>
          </Link>
        ) : (
          <span className="text-subtle">—</span>
        )}
      </td>

      <td data-label="Rattachée à" className="cell-wrap">
        {o.affaireId ? (
          <Link
            href={`/affaires/${o.affaireId}`}
            className="inline-flex items-baseline gap-1.5 transition-colors hover:text-brand"
          >
            <Briefcase className="h-3.5 w-3.5 shrink-0 self-center text-accent-strong" />
            <span className="min-w-0">{o.affaireNom}</span>
          </Link>
        ) : (
          <span className="text-subtle">—</span>
        )}
      </td>

      <td data-label="Échéance">
        <span className="text-subtle">—</span>
      </td>
      <td data-label="Priorité">
        <span className="text-subtle">—</span>
      </td>

      <td data-label="Statut">
        <Link
          href={o.href}
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand transition-colors hover:text-brand-strong"
        >
          Régler
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </td>

      {montrerAssigne && (
        <td data-label="Assignée à">
          {o.pourTous ? (
            <span className="text-subtle">Tout le monde</span>
          ) : o.suiviParNom ? (
            <span className="text-muted">{o.suiviParNom}</span>
          ) : (
            <span className="text-subtle">Personne</span>
          )}
        </td>
      )}

      <td />
    </tr>
  );
}

/**
 * L'échéance : un LIBELLÉ, et l'éditeur seulement au clic.
 *
 * ⚠️ Un `<input type="date">` vide affiche « jj/mm/aaaa » — sur une liste où la
 * plupart des tâches n'ont pas de date, c'était dix fois le même faux texte, et
 * l'œil ne trouvait plus les vraies échéances. On montre donc ce qu'il y a à
 * lire (« en retard de 3 jours », « demain », une date, ou un tiret), et le
 * champ natif — sélecteur du système, clavier, effacement — n'apparaît que
 * quand on va s'en servir.
 */
function CelluleEcheance({
  jour,
  terminee,
  desactive,
  onChange,
}: {
  jour: string | null;
  terminee: boolean;
  desactive: boolean;
  onChange: (j: string | null) => void;
}) {
  const [edition, setEdition] = useState(false);

  if (edition)
    return (
      <input
        type="date"
        autoFocus
        defaultValue={jour ?? ""}
        onBlur={(e) => {
          setEdition(false);
          const v = e.target.value || null;
          if (v !== jour) onChange(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setEdition(false);
        }}
        aria-label="Échéance"
        className="rounded-md border border-brand bg-surface px-1.5 py-0.5 text-xs text-fg focus:outline-none"
      />
    );

  const ech = jour ? libelleEcheance(jour) : null;
  return (
    <button
      type="button"
      onClick={() => setEdition(true)}
      disabled={desactive}
      title={jour ? `Échéance du ${new Date(jour).toLocaleDateString("fr-FR")}` : "Poser une échéance"}
      className={cn(
        "rounded-md border border-transparent px-1.5 py-0.5 text-xs transition-colors",
        "hover:border-border hover:bg-surface-2",
        // Une échéance passée sur une tâche TERMINÉE n'est pas un retard : elle
        // a été faite. La peindre en rouge ferait paniquer pour rien.
        ech && !terminee ? ech.ton : "text-subtle",
      )}
    >
      {ech ? (terminee ? new Date(jour!).toLocaleDateString("fr-FR") : ech.texte) : "—"}
    </button>
  );
}

/* --- Le formulaire de création -------------------------------------------- *
 * Deux natures de rattachement, donc un interrupteur AVANT le champ : on choisit
 * « Affaire » ou « Interne », et le champ qui suit change. Un seul champ
 * « rattachement » mêlant les deux listes obligerait à lire vingt affaires pour
 * trouver « Atelier ». Le domaine se saisit LIBREMENT : taper un nom inconnu le
 * crée (patron de `resoudreClientId`), plutôt que d'envoyer gérer un
 * référentiel ailleurs. */
function FormulaireCreation({
  affaires,
  clientsRef,
  domaines,
  onCreer,
  onAnnuler,
}: {
  affaires: { id: string; nom: string; clientNom: string; numeroWhy: string | null }[];
  clientsRef: { id: string; nom: string }[];
  domaines: DomaineVue[];
  onCreer: (p: {
    titre: string;
    chantierId: string | null;
    clientId: string | null;
    domaine: string | null;
    priorite: PrioriteTache;
    echeance: string | null;
  }) => void;
  onAnnuler: () => void;
}) {
  const [titre, setTitre] = useState("");
  const [nature, setNature] = useState<"interne" | "client" | "affaire">("interne");
  const [chantierId, setChantierId] = useState("");
  const [clientId, setClientId] = useState("");
  const [domaine, setDomaine] = useState(domaines.find((d) => d.actif)?.nom ?? "Interne");
  const [priorite, setPriorite] = useState<PrioriteTache>("NORMALE");
  const [echeance, setEcheance] = useState("");

  function valider() {
    const t = titre.trim();
    if (!t) return;
    onCreer({
      titre: t,
      chantierId: nature === "affaire" ? chantierId || null : null,
      clientId: nature === "client" ? clientId || null : null,
      domaine: nature === "interne" ? domaine.trim() || null : null,
      priorite,
      echeance: echeance || null,
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-2 border-b border-hairline bg-surface-2/60 px-3 py-3">
      <label className="flex min-w-56 flex-1 flex-col gap-1">
        <span className="stamp">Tâche</span>
        <input
          autoFocus
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") valider();
            if (e.key === "Escape") onAnnuler();
          }}
          placeholder="Ce qu'il y a à faire…"
          className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg placeholder:text-subtle focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="stamp">Nature</span>
        <select
          value={nature}
          onChange={(e) => setNature(e.target.value as "interne" | "client" | "affaire")}
          className={cn(selectFiltre, "w-32")}
        >
          <option value="interne">Interne</option>
          <option value="client">Client</option>
          <option value="affaire">Affaire</option>
        </select>
      </label>

      {nature === "affaire" ? (
        <label className="flex flex-col gap-1">
          <span className="stamp">Affaire</span>
          <select
            value={chantierId}
            onChange={(e) => setChantierId(e.target.value)}
            className={cn(selectFiltre, "w-64")}
          >
            <option value="">— choisir —</option>
            {affaires.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nom} · {a.clientNom}
              </option>
            ))}
          </select>
        </label>
      ) : nature === "client" ? (
        /* Le travail commence souvent AVANT qu'un numéro Why existe : relancer,
           préparer une revue, faire chiffrer. Obliger à choisir une affaire
           faisait ranger ces tâches-là n'importe où — ou nulle part. */
        <label className="flex flex-col gap-1">
          <span className="stamp">Client</span>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className={cn(selectFiltre, "w-56")}
          >
            <option value="">— choisir —</option>
            {clientsRef.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="flex flex-col gap-1">
          <span className="stamp">Domaine</span>
          <input
            list="domaines-taches"
            value={domaine}
            onChange={(e) => setDomaine(e.target.value)}
            placeholder="Atelier, Administratif…"
            className="h-9 w-44 rounded-md border border-border bg-surface px-3 text-sm text-fg placeholder:text-subtle focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
          <datalist id="domaines-taches">
            {domaines.filter((d) => d.actif).map((d) => (
              <option key={d.id} value={d.nom} />
            ))}
          </datalist>
        </label>
      )}

      <label className="flex flex-col gap-1">
        <span className="stamp">Priorité</span>
        <select
          value={priorite}
          onChange={(e) => setPriorite(e.target.value as PrioriteTache)}
          className={cn(selectFiltre, "w-32")}
        >
          {PRIORITES.map((x) => (
            <option key={x.value} value={x.value}>
              {x.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="stamp">Échéance</span>
        {/* Pas de `min` : on note souvent une tâche APRÈS coup, et une échéance
            déjà dépassée est une information, pas une faute de saisie. */}
        <input
          type="date"
          value={echeance}
          onChange={(e) => setEcheance(e.target.value)}
          className={cn(selectFiltre, "w-40")}
        />
      </label>

      <div className="flex items-center gap-2 pb-0.5">
        <Button
          size="sm"
          onClick={valider}
          disabled={
            !titre.trim() ||
            (nature === "affaire" && !chantierId) ||
            (nature === "client" && !clientId)
          }
        >
          Créer
        </Button>
        <button
          type="button"
          onClick={onAnnuler}
          title="Annuler"
          className="rounded p-1.5 text-subtle transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
