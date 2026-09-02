import "server-only";
import { prisma } from "@/lib/db";
import { bomAffaire } from "@/tools/magasin/bom";
import { DOSSIER_SCHEMA_ARMOIRE } from "./armoire";
import { etatArret, plusRecente } from "./arret";

/* =============================================================================
 * LES OBLIGATIONS DÉDUITES — CE QUI RÉCLAME SANS QUE PERSONNE NE L'AIT ÉCRIT
 *
 * « Ce qu'il ne faut pas oublier » existe sous DEUX natures, et une seule avait
 * un domicile :
 *   · ce qu'on ÉCRIT — les tâches. Elles ont leur écran, leur priorité, leur
 *     échéance ;
 *   · ce que le système DÉDUIT — un besoin en matériel jamais arrêté, un devis
 *     dont la validité est passée, des points non reliés à un produit. Chacune
 *     de ces obligations vivait dans son écran à elle, et il fallait faire le
 *     tour de l'appli pour les trouver.
 *
 * TROIS RÈGLES, et elles décident de tout :
 *
 * 1. ON NE STOCKE RIEN. Une obligation se calcule, et elle S'ÉTEINT quand sa
 *    cause disparaît — on ne la coche pas. C'est déjà la règle de la frise des
 *    jalons et de l'arrêt (arret.ts) : ce qui se déduit ne se saisit jamais,
 *    sinon les deux finissent par se contredire et c'est la saisie qui ment.
 *
 * 2. ELLE DOIT ÊTRE EXCEPTIONNELLE. Un état « pas encore fait » n'est pas une
 *    obligation : c'est le point de départ de toute affaire. Les afficher tous
 *    noierait la liste — 21 affaires engagées n'ont jamais eu leur besoin
 *    matériel arrêté, et les jeter en vrac ne dirait rien. D'où un DÉCLENCHEUR
 *    par genre : les travaux ont commencé, la validité est passée, quelque
 *    chose a bougé APRÈS qu'on ait dit « c'est bon ». Le reste se tait.
 *
 * 3. ELLE INCOMBE À QUELQU'UN. Une obligation sans destinataire est un vœu :
 *    on la rattache à qui SUIT l'affaire (`Chantier.suiviParId`). Sans suiveur,
 *    elle tombe sur « personne » — visible dans ce filtre-là, exactement comme
 *    une tâche que personne n'a prise.
 * ========================================================================== */

export type GenreObligation =
  | "bom-retouchee"
  | "bom-ouverte"
  | "automate-retouche"
  | "automate-ouvert"
  | "bom-trou"
  | "devis-echu"
  | "armoire-sans-schema"
  | "projet-orphelin";

export interface Obligation {
  /** Clé synthétique `genre:cible` — stable d'un calcul à l'autre, jamais
   *  stockée. Sert de clé de rendu, et de repère si l'on veut un jour se
   *  souvenir qu'une obligation a été écartée. */
  id: string;
  genre: GenreObligation;
  titre: string;
  /** La précision qui permet de décider sans ouvrir : « 3 points », « 6 jours ». */
  detail: string | null;
  /** Où l'on va pour la RÉGLER — jamais une page d'information. */
  href: string;
  affaireId: string | null;
  affaireNom: string | null;
  clientId: string | null;
  clientNom: string | null;
  /** À qui elle incombe : celui qui suit l'affaire. Null = personne. */
  suiviParId: string | null;
  suiviParNom: string | null;
  /**
   * Vrai quand l'obligation n'appartient à PERSONNE EN PARTICULIER parce
   * qu'elle appartient à tout le monde : un manque de référentiel, un automate
   * rattaché à aucune affaire. Le filtre « qui » ne la masque jamais — sans
   * quoi une chose que personne ne suit ne serait vue par personne, ce qui est
   * exactement la définition de ce qu'on perd.
   */
  pourTous: boolean;
  /** `alerte` = quelque chose est faux ou périmé ; `rappel` = quelque chose
   *  attend. Deux tons, pas cinq : au-delà on ne les distingue plus. */
  gravite: "alerte" | "rappel";
}

/** Les affaires où le travail est ENGAGÉ — le seul périmètre où « pas encore
 *  fait » commence à vouloir dire quelque chose. */
const ETATS_ENGAGES = ["COMMANDE", "EN_COURS"] as const;

export async function obligations(): Promise<Obligation[]> {
  const [affaires, devis, orphelins] = await Promise.all([
    prisma.chantier.findMany({
      where: { etat: { in: [...ETATS_ENGAGES] } },
      select: {
        id: true,
        nom: true,
        etat: true,
        besoinArmoire: true,
        bomArreteeLe: true,
        bomToucheeLe: true,
        client: { select: { id: true, nom: true } },
        suiviPar: { select: { id: true, nom: true } },
        affectations: { select: { id: true, nom: true, arreteLe: true, updatedAt: true } },
        documents: { select: { categorie: true } },
      },
    }),
    prisma.devis.findMany({
      where: { etat: "EMIS", emisLe: { not: null }, validiteJours: { gt: 0 } },
      select: {
        id: true,
        numero: true,
        emisLe: true,
        validiteJours: true,
        clientNom: true,
        client: { select: { id: true, nom: true } },
        chantier: { select: { id: true, nom: true, suiviPar: { select: { id: true, nom: true } } } },
      },
    }),
    prisma.affectationProjet.findMany({
      where: { chantierId: null },
      select: { id: true, nom: true },
    }),
  ]);

  const liste: Obligation[] = [];
  const pousser = (o: Obligation) => liste.push(o);

  /* --- Ce qui a bougé APRÈS qu'on ait dit « c'est bon » ------------------- *
   * Le cas le plus précieux, et le seul que rien d'autre ne signale : l'arrêt
   * est daté, donc « retouché » est CONSTATÉ, jamais choisi (arret.ts). */

  for (const a of affaires) {
    const cible = {
      affaireId: a.id,
      affaireNom: a.nom,
      clientId: a.client.id,
      clientNom: a.client.nom,
      suiviParId: a.suiviPar?.id ?? null,
      suiviParNom: a.suiviPar?.nom ?? null,
    };

    const referenceBom = plusRecente(
      a.bomToucheeLe,
      ...a.affectations.map((p) => p.updatedAt),
    );
    const etatBom = etatArret(a.bomArreteeLe, referenceBom);

    if (etatBom === "retouche") {
      pousser({
        ...cible,
        id: `bom-retouchee:${a.id}`,
        genre: "bom-retouchee",
        titre: "Le besoin en matériel a bougé depuis son arrêt",
        detail: "à revalider avant de commander",
        href: `/outils/magasin/affaires/${a.id}`,
        pourTous: false,
        gravite: "alerte",
      });
    } else if (etatBom === "ouvert" && a.etat === "EN_COURS") {
      // ⚠️ Uniquement EN COURS : sur une affaire simplement commandée, « pas
      // encore arrêté » est l'état normal du premier jour.
      pousser({
        ...cible,
        id: `bom-ouverte:${a.id}`,
        genre: "bom-ouverte",
        titre: "Besoin en matériel jamais arrêté",
        detail: "les travaux ont commencé",
        href: `/outils/magasin/affaires/${a.id}`,
        pourTous: false,
        gravite: "rappel",
      });
    }

    for (const p of a.affectations) {
      const etat = etatArret(p.arreteLe, p.updatedAt);
      if (etat === "retouche") {
        pousser({
          ...cible,
          id: `automate-retouche:${p.id}`,
          genre: "automate-retouche",
          titre: `L'automate « ${p.nom} » a bougé depuis son arrêt`,
          detail: "à revoir",
          href: `/outils/affectation-es/${p.id}`,
          pourTous: false,
          gravite: "alerte",
        });
      } else if (etat === "ouvert" && a.etat === "EN_COURS") {
        pousser({
          ...cible,
          id: `automate-ouvert:${p.id}`,
          genre: "automate-ouvert",
          titre: `L'automate « ${p.nom} » n'a jamais été arrêté`,
          detail: "les travaux ont commencé",
          href: `/outils/affectation-es/${p.id}`,
          pourTous: false,
          gravite: "rappel",
        });
      }
    }

    // ⚠️ EN COURS seulement, comme le besoin matériel : sur onze salles
    // fraîchement commandées, « schéma pas encore fait » est l'état normal du
    // premier jour, et onze lignes identiques enterraient tout le reste de la
    // liste. La fiche de l'affaire porte déjà son bandeau rouge en propre.
    if (
      a.etat === "EN_COURS" &&
      a.besoinArmoire === "NOUVELLE" &&
      !a.documents.some((d) => d.categorie === DOSSIER_SCHEMA_ARMOIRE)
    ) {
      pousser({
        ...cible,
        id: `armoire-sans-schema:${a.id}`,
        genre: "armoire-sans-schema",
        titre: "Nouvelle armoire à fabriquer, schéma manquant",
        detail: `à déposer dans le dossier « ${DOSSIER_SCHEMA_ARMOIRE} »`,
        href: `/affaires/${a.id}`,
        pourTous: false,
        gravite: "alerte",
      });
    }
  }

  /* --- Ce que la BOM ne sait pas chiffrer -------------------------------- *
   *
   * UNE SEULE LIGNE, et il a fallu deux essais pour en arriver là :
   *   · une ligne par AFFAIRE (12) mentait — le catalogue de points et sa
   *     nomenclature sont GLOBAUX, relier « Pilotage » une fois répare toutes
   *     les affaires d'un coup ;
   *   · une ligne par ÉLÉMENT manquant (35) disait vrai mais enterrait le reste
   *     de la liste, alors que ce n'est pas trente-cinq travaux : c'est UN
   *     chantier, « compléter le catalogue ».
   * On annonce donc l'ampleur en une phrase et on ouvre la porte du seul écran
   * qui montre le tableau complet — le besoin consolidé.
   *
   * Elle n'est à personne (`pourTous`) : un référentiel incomplet gêne toutes
   * les affaires, y compris celles qu'on ne suit pas. */

  const boms = await Promise.all(affaires.map((a) => bomAffaire(a.id)));
  const trousDistincts = new Set<string>();
  let affairesTouchees = 0;
  boms.forEach((bom) => {
    if (bom.trous.length === 0) return;
    affairesTouchees += 1;
    for (const t of bom.trous) trousDistincts.add(`${t.genre}:${t.cle}`);
  });

  if (trousDistincts.size > 0) {
    const n = trousDistincts.size;
    pousser({
      id: "bom-trou:global",
      genre: "bom-trou",
      titre: `${n} élément${n > 1 ? "s" : ""} du catalogue ne ${n > 1 ? "sont" : "est"} relié${n > 1 ? "s" : ""} à aucun produit`,
      detail: `${affairesTouchees} affaire${affairesTouchees > 1 ? "s" : ""} engagée${affairesTouchees > 1 ? "s" : ""} mal chiffrée${affairesTouchees > 1 ? "s" : ""} — à relier une fois pour toutes`,
      href: "/outils/magasin/besoins",
      affaireId: null,
      affaireNom: null,
      clientId: null,
      clientNom: null,
      suiviParId: null,
      suiviParNom: null,
      pourTous: true,
      gravite: "rappel",
    });
  }

  /* --- Un devis dont la validité est passée n'est plus une offre ---------- */

  const maintenant = Date.now();
  for (const d of devis) {
    const finLe = d.emisLe!.getTime() + d.validiteJours * 86_400_000;
    if (finLe >= maintenant) continue;
    const jours = Math.floor((maintenant - finLe) / 86_400_000);
    pousser({
      id: `devis-echu:${d.id}`,
      genre: "devis-echu",
      titre: `Devis ${d.numero} échu`,
      detail: jours === 0 ? "depuis aujourd'hui" : `depuis ${jours} jour${jours > 1 ? "s" : ""}`,
      href: `/outils/devis/${d.id}`,
      affaireId: d.chantier?.id ?? null,
      affaireNom: d.chantier?.nom ?? null,
      clientId: d.client?.id ?? null,
      clientNom: d.client?.nom ?? d.clientNom ?? null,
      suiviParId: d.chantier?.suiviPar?.id ?? null,
      suiviParNom: d.chantier?.suiviPar?.nom ?? null,
      pourTous: false,
      gravite: "alerte",
    });
  }

  /* --- Le filet : un projet GTB rattaché à aucune affaire ----------------- *
   * Il n'apparaît sur AUCUNE fiche — c'est le seul endroit qui le dit, avec
   * l'index des projets. */

  for (const p of orphelins) {
    pousser({
      id: `projet-orphelin:${p.id}`,
      genre: "projet-orphelin",
      titre: `L'automate « ${p.nom} » n'est rattaché à aucune affaire`,
      detail: "il n'apparaît sur aucune fiche",
      href: `/outils/affectation-es/${p.id}`,
      affaireId: null,
      affaireNom: null,
      clientId: null,
      clientNom: null,
      suiviParId: null,
      suiviParNom: null,
      pourTous: true,
      gravite: "rappel",
    });
  }

  // Les alertes d'abord (quelque chose est faux ou périmé), les rappels ensuite.
  return liste.sort(
    (a, b) =>
      Number(a.gravite === "rappel") - Number(b.gravite === "rappel") ||
      (a.clientNom ?? "").localeCompare(b.clientNom ?? "") ||
      a.titre.localeCompare(b.titre),
  );
}
