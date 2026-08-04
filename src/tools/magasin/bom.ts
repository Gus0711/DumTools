import "server-only";
import { prisma } from "@/lib/db";
import { normalizeControllerReference, type Project } from "@/tools/affectation-es/model";
import type { PointRow } from "@/tools/liste-points/model";
import type { CategorieProduit, LigneBom, OrigineBom, TrouBom } from "./model";

/* =============================================================================
 * LA BOM D'UNE AFFAIRE — DÉRIVÉE, PAS SAISIE
 *
 * Trois sources, dans cet ordre de fiabilité :
 *   1. les PROJETS GTB de l'affaire  → automate + modules (via le produitId
 *      posé sur la base matériel) — on sait déjà tout, rien à ressaisir ;
 *   2. les LISTES DE POINTS de ces projets → produits appelés par chaque point
 *      via sa nomenclature (« sonde de gaine » = sonde + doigt de gant + …) ;
 *   3. les LIGNES MANUELLES de l'affaire → ce que la dérivation ne devine pas.
 *
 * Ce que la dérivation ne sait pas chiffrer est dit à voix haute (TrouBom) :
 * un total faussement complet serait pire que pas de total du tout.
 * ========================================================================== */

export interface BomAffaire {
  lignes: LigneBom[];
  trous: TrouBom[];
  /** Projets GTB pris en compte. */
  projets: { id: string; nom: string }[];
  /** Coût prévisionnel (centimes) : prix payé si connu, tarif fournisseur sinon. */
  coutPrevuCents: number;
  /** Nombre de lignes dont on ne connaît pas le prix. */
  nbSansPrix: number;
  /** Nombre de lignes cochées « hors de notre fourniture » : elles restent
   *  visibles (sinon on ne pourrait pas décocher) mais sortent du besoin, du
   *  manquant et du coût. Compté pour être DIT, jamais pour être chiffré. */
  nbHorsFourniture: number;
}

interface Accumulateur {
  produitId: string;
  besoin: number;
  origines: OrigineBom[];
}

function ajouter(
  acc: Map<string, Accumulateur>,
  produitId: string,
  quantite: number,
  origine: OrigineBom,
) {
  const courant = acc.get(produitId) ?? { produitId, besoin: 0, origines: [] };
  courant.besoin += quantite;
  // Les origines de même libellé se cumulent : « 12 × Sonde T° gaine » plutôt
  // que douze lignes identiques.
  const memeOrigine = courant.origines.find(
    (o) => o.libelle === origine.libelle && o.source === origine.source,
  );
  if (memeOrigine) memeOrigine.quantite += origine.quantite;
  else courant.origines.push({ ...origine });
  acc.set(produitId, courant);
}

export async function bomAffaire(chantierId: string): Promise<BomAffaire> {
  const [projets, lignesManuelles] = await Promise.all([
    prisma.affectationProjet.findMany({
      where: { chantierId },
      select: { id: true, nom: true, data: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.ligneMaterielAffaire.findMany({
      where: { chantierId },
      include: { produit: { select: { id: true, refInterne: true } } },
    }),
  ]);

  // Les articles que le chantier appelle mais qu'on ne fournit pas : déjà en
  // place, ou du lot d'un autre. La présence de la ligne EST la décision.
  const horsFourniture = new Set(
    (
      await prisma.materielHorsFourniture.findMany({
        where: { chantierId },
        select: { produitId: true },
      })
    ).map((h) => h.produitId),
  );

  const acc = new Map<string, Accumulateur>();
  // Clé = `${genre}:${cle}` : deux points homonymes de genres différents ne se
  // confondent pas, et la clé technique suffit à réparer le trou.
  const trous = new Map<string, TrouBom>();
  const noterTrou = (
    genre: TrouBom["genre"],
    cle: string,
    nom: string,
    occurrences: number,
    typeIo?: string | null,
  ) => {
    const k = `${genre}:${cle}`;
    const existant = trous.get(k);
    if (existant) existant.occurrences += occurrences;
    else trous.set(k, { nom, occurrences, genre, cle, typeIo: typeIo ?? null });
  };

  /* --- 1 & 2. Ce que disent les projets GTB ------------------------------- */

  // Les références d'automates et les types de modules réellement employés, pour
  // ne charger de la base matériel que ce qui sert.
  const referencesAutomates = new Set<string>();
  const typesModules = new Set<string>();
  /** nom du point → nombre d'occurrences + type d'E/S relevé (pour pouvoir
   *  créer l'entrée de catalogue si elle manque). */
  const nomsPoints = new Map<string, { occurrences: number; typeIo: string | null }>();

  for (const p of projets) {
    const projet = (p.data ?? {}) as Partial<Project>;
    const controleur = normalizeControllerReference(String(projet.controller ?? ""));
    if (controleur) referencesAutomates.add(controleur);
    for (const m of projet.modules ?? []) {
      // Les E/S intégrées à l'automate ne sont pas un module à acheter.
      if (m.integratedController) continue;
      if (m.type) typesModules.add(m.type);
    }
    for (const row of (projet.rows ?? []) as PointRow[]) {
      if (row.kind !== "point") continue;
      const nom = (row.nom ?? "").trim();
      if (!nom) continue;
      // Une ligne porte un seul type d'E/S actif (règle de la liste de points).
      const typeIo = Object.entries(row.io ?? {}).find(([, v]) => v > 0)?.[0] ?? null;
      const courant = nomsPoints.get(nom);
      if (courant) courant.occurrences += 1;
      else nomsPoints.set(nom, { occurrences: 1, typeIo });
    }
  }

  const [automates, modules, pointsCatalogue] = await Promise.all([
    referencesAutomates.size
      ? prisma.automateModele.findMany({
          where: { reference: { in: [...referencesAutomates] } },
          select: { reference: true, produitId: true },
        })
      : Promise.resolve([]),
    typesModules.size
      ? prisma.moduleModele.findMany({
          where: { type: { in: [...typesModules] } },
          select: { type: true, produitId: true },
        })
      : Promise.resolve([]),
    nomsPoints.size
      ? prisma.pointCatalog.findMany({
          where: { nom: { in: [...nomsPoints.keys()] } },
          select: {
            nom: true,
            sansMateriel: true,
            nomenclature: {
              select: { produitId: true, quantite: true, optionnel: true },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const produitAutomate = new Map(automates.map((a) => [a.reference, a.produitId]));
  const produitModule = new Map(modules.map((m) => [m.type, m.produitId]));
  const nomenclatureParPoint = new Map(pointsCatalogue.map((p) => [p.nom, p.nomenclature]));
  // Points explicitement marqués « aucun matériel » : ils sont RÉGLÉS, pas
  // oubliés — ni ligne de BOM, ni trou signalé.
  const sansMateriel = new Set(pointsCatalogue.filter((p) => p.sansMateriel).map((p) => p.nom));

  for (const p of projets) {
    const projet = (p.data ?? {}) as Partial<Project>;
    const controleur = normalizeControllerReference(String(projet.controller ?? ""));
    if (controleur) {
      const produitId = produitAutomate.get(controleur);
      if (produitId) {
        ajouter(acc, produitId, 1, {
          libelle: `Automate ${controleur} — ${p.nom}`,
          quantite: 1,
          source: "projet",
        });
      } else {
        noterTrou("automate", controleur, `Automate ${controleur}`, 1);
      }
    }
    for (const m of projet.modules ?? []) {
      if (m.integratedController || !m.type) continue;
      const produitId = produitModule.get(m.type);
      if (produitId) {
        ajouter(acc, produitId, 1, {
          libelle: `Module ${m.type} — ${p.nom}`,
          quantite: 1,
          source: "projet",
        });
      } else {
        noterTrou("module", m.type, `Module ${m.type}`, 1);
      }
    }
  }

  for (const [nom, { occurrences, typeIo }] of nomsPoints) {
    if (sansMateriel.has(nom)) continue;
    const nomenclature = nomenclatureParPoint.get(nom);
    if (!nomenclature || nomenclature.length === 0) {
      noterTrou("point", nom, nom, occurrences, typeIo);
      continue;
    }
    for (const n of nomenclature) {
      if (n.optionnel) continue;
      ajouter(acc, n.produitId, n.quantite * occurrences, {
        libelle: `${occurrences} × ${nom}`,
        quantite: n.quantite * occurrences,
        source: "points",
      });
    }
  }

  /* --- 3. Le complément saisi à la main ----------------------------------- */

  for (const l of lignesManuelles) {
    ajouter(acc, l.produitId, l.quantite, {
      libelle: l.note.trim() || "Ajout manuel",
      quantite: l.quantite,
      source: "manuel",
    });
  }

  /* --- Confrontation au stock -------------------------------------------- */

  const produitIds = [...acc.keys()];
  if (produitIds.length === 0) {
    return {
      lignes: [],
      trous: [...trous.values()],
      projets: projets.map((p) => ({ id: p.id, nom: p.nom })),
      coutPrevuCents: 0,
      nbSansPrix: 0,
      nbHorsFourniture: 0,
    };
  }

  const [produits, tenus, reservations, sorties, retours, pmpLignes] = await Promise.all([
    prisma.produit.findMany({
      where: { id: { in: produitIds } },
      select: {
        id: true,
        refInterne: true,
        designation: true,
        unite: true,
        categorie: true,
      },
    }),
    prisma.depot.findMany({ where: { dortoir: false, actif: true }, select: { id: true } }),
    prisma.reservationStock.groupBy({
      by: ["produitId"],
      where: { chantierId, etat: "RESERVEE", produitId: { in: produitIds } },
      _sum: { quantite: true },
    }),
    prisma.mouvementStock.groupBy({
      by: ["produitId"],
      where: { chantierId, type: "SORTIE", produitId: { in: produitIds } },
      _sum: { quantite: true },
    }),
    prisma.mouvementStock.groupBy({
      by: ["produitId"],
      where: { chantierId, type: "RETOUR", produitId: { in: produitIds } },
      _sum: { quantite: true },
    }),
    prisma.$queryRaw<{ produitId: string; total: number; qte: number }[]>`
      SELECT "produitId",
             SUM("quantite" * "prixUnitaireCents")::double precision AS total,
             SUM("quantite")::double precision AS qte
        FROM "MouvementStock"
       WHERE "type" = 'RECEPTION' AND "prixUnitaireCents" IS NOT NULL
       GROUP BY "produitId"`,
  ]);

  // Même ordre de repli que le rayon : ce qu'on a payé, sinon le prix d'achat
  // annoncé sur la fiche. Sans ça, une affaire chiffrée avant tout achat
  // afficherait un coût prévu de zéro — pire qu'un chiffre absent.
  const prixAnnonces = await prisma.produit.findMany({
    where: { id: { in: produitIds }, prixAchatCents: { not: null } },
    select: { id: true, prixAchatCents: true },
  });

  const idsTenus = tenus.map((d) => d.id);
  const [entrees, sortiesStock] = await Promise.all([
    idsTenus.length
      ? prisma.mouvementStock.groupBy({
          by: ["produitId"],
          where: { depotDestId: { in: idsTenus }, produitId: { in: produitIds } },
          _sum: { quantite: true },
        })
      : Promise.resolve([]),
    idsTenus.length
      ? prisma.mouvementStock.groupBy({
          by: ["produitId"],
          where: { depotSourceId: { in: idsTenus }, produitId: { in: produitIds } },
          _sum: { quantite: true },
        })
      : Promise.resolve([]),
  ]);

  const stock = new Map<string, number>();
  for (const e of entrees) stock.set(e.produitId, e._sum.quantite ?? 0);
  for (const s of sortiesStock) {
    stock.set(s.produitId, (stock.get(s.produitId) ?? 0) - (s._sum.quantite ?? 0));
  }

  const reserve = new Map(reservations.map((r) => [r.produitId, r._sum.quantite ?? 0]));
  const sorti = new Map(sorties.map((s) => [s.produitId, s._sum.quantite ?? 0]));
  for (const r of retours) {
    sorti.set(r.produitId, (sorti.get(r.produitId) ?? 0) - (r._sum.quantite ?? 0));
  }
  const prixRef = new Map<string, number>();
  for (const p of prixAnnonces) {
    if (p.prixAchatCents !== null) prixRef.set(p.id, p.prixAchatCents);
  }
  // Le prix réellement payé prime sur le prix annoncé.
  for (const l of pmpLignes) {
    if (l.qte > 0) prixRef.set(l.produitId, Math.round(l.total / l.qte));
  }

  const parId = new Map(produits.map((p) => [p.id, p]));
  const lignes: LigneBom[] = [];
  let coutPrevuCents = 0;
  let nbSansPrix = 0;

  let nbHorsFourniture = 0;

  for (const a of acc.values()) {
    const p = parId.get(a.produitId);
    if (!p) continue;
    const dejaCouvert = (reserve.get(a.produitId) ?? 0) + Math.max(0, sorti.get(a.produitId) ?? 0);
    const prix = prixRef.get(a.produitId) ?? null;
    // Hors fourniture : la ligne reste AFFICHÉE (on doit pouvoir décocher, et
    // savoir ce qu'on a raccordé sans le vendre) mais elle ne pèse ni sur le
    // besoin, ni sur le manquant, ni sur le coût — et son prix inconnu n'a plus
    // à être signalé, puisqu'on ne l'achète pas.
    const exclue = horsFourniture.has(a.produitId);
    if (exclue) nbHorsFourniture += 1;
    else if (prix === null) nbSansPrix += 1;
    else coutPrevuCents += prix * a.besoin;

    lignes.push({
      produitId: a.produitId,
      refInterne: p.refInterne,
      designation: p.designation,
      unite: p.unite,
      categorie: p.categorie as CategorieProduit,
      besoin: a.besoin,
      origines: a.origines,
      stock: stock.get(a.produitId) ?? 0,
      reserve: reserve.get(a.produitId) ?? 0,
      sorti: Math.max(0, sorti.get(a.produitId) ?? 0),
      manquant: exclue ? 0 : Math.max(0, a.besoin - dejaCouvert),
      pmpCents: prix,
      horsFourniture: exclue,
    });
  }

  lignes.sort(
    (a, b) => a.categorie.localeCompare(b.categorie) || a.refInterne.localeCompare(b.refInterne),
  );

  return {
    lignes,
    trous: [...trous.values()].sort((a, b) => b.occurrences - a.occurrences),
    projets: projets.map((p) => ({ id: p.id, nom: p.nom })),
    coutPrevuCents,
    nbSansPrix,
    nbHorsFourniture,
  };
}
