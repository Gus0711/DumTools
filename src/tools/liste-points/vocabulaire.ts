// Le vocabulaire des points : ramener un libellé sur le générique du catalogue,
// et renvoyer au texte libre ce qui ne fait que le distinguer (local, zone,
// repère).
//
// Ce moteur a d'abord vécu dans `scripts/normaliser-points.mts`, qui a remis la
// base d'équerre en août 2026 (336 lignes de projets, catalogue 126 → 103) avec
// un CSV relu à la main. Il est ici pour être appelé DEUX fois :
//   - par le script, quand on nettoie l'existant ;
//   - par l'IMPORT GFX/PDF, pour que la pollution s'arrête à l'entrée — les
//     désignations viennent du programme du client (« ODM_Dalles_Secretariat »)
//     et, recopiées telles quelles, elles rendaient la BOM introuvable (elle
//     apparie sur le nom EXACT) et le catalogue enflait d'une entrée par local.
//
// Voir docs/ARCHITECTURE.md §5. Le détecteur `nomLocalise()` (model.ts) reste à
// part : AVERTIR et COUPER ne sont pas le même geste, et sa liste est
// volontairement plus étroite (elle ne doit pas crier sur « circulation » ou
// « technique », que la coupe, elle, sait traiter).
import { ES_TYPES, nomLocalise, type IoType } from "./model";

/** Sépare le complément ajouté d'un texte libre déjà présent (repère de câblage…). */
export const FUSION = " — ";

// --- Vocabulaire : synonymes à ramener sur un seul terme ---------------------
// Quatre façons de dire « sonde d'ambiance » et quatre de dire « sortie de
// commande » cohabitent dans la base. On propose la forme du catalogue seed ;
// dans le script, l'arbitrage final est dans le CSV.
const SYNONYMES: [RegExp, string][] = [
  [/^(sonde\s+temp\.?\s+ext[ée]rieure?|temp[ée]rature\s+ext[ée]rieure?)$/i, "Sonde extérieur"],
  [/^(sonde\s+temp\.?|temp[ée]rature|amb|ambiance|sonde\s+de\s+temp[ée]rature)$/i, "Sonde ambiance"],
  [/^(m\/a|ma|odm|omd|cde|commande|marche\/arr[êe]t)$/i, "Commande"],
  [/^(tp\s+depart|temp[ée]rature\s+d[ée]part|sonde\s+depart)$/i, "Sonde départ"],
  [/^(defaut|d[ée]faut)$/i, "Defaut"],
  [/^(compteur)$/i, "Compteur Modbus"],
];

/**
 * Têtes de libellé équivalentes, quand le générique porte un complément
 * d'équipement : « M/A Chauffage » et « ODM CHAUFFAGE » disent la même chose que
 * « Commande Chauffage ». Quatre façons de dire la sortie de commande et quatre
 * la sonde d'ambiance cohabitent dans la base — c'est le vrai dégât.
 */
// L'ordre compte : « Temperature depart » est une sonde de départ, pas une
// sonde d'ambiance. « Cde » EST réécrit en « Commande » — un seul mot dans tout
// le vocabulaire (arbitrage 2026-08-05).
const TETES: [RegExp, string][] = [
  [/^(sonde\s+temp\.?|temp[ée]rature|tp)\s+d[ée]part\b[\s.]*/i, "Sonde départ "],
  [/^(sonde\s+temp\.?|temp[ée]rature|tp)\s+retour\b[\s.]*/i, "Sonde retour "],
  [/^(m\/a|ma|odm|omd|cde)\b[\s.]*/i, "Commande "],
  [/^(sonde\s+temp\.?|amb|temp[ée]rature)\b[\s.]*/i, "Sonde ambiance "],
];

/** Derniers alignements, une fois la tête réécrite (arbitrages métier). */
const FINITIONS: [RegExp, string][] = [
  // « Chauffage laverie » et « M/A Chauffage Circulation » disent la même chose.
  [/^chauffage$/i, "Commande Chauffage"],
  // PLCH = plancher chauffant.
  [/^commande\s+plch$/i, "Commande Plancher Chauffant"],
];

/**
 * Génériques qui ABSORBENT leurs variantes : ce qui suit le préfixe repart au
 * texte libre. « Commande Plancher Chauffant CM1 » → nom « Commande Plancher
 * Chauffant », texte libre « CM1 … ». Sans ça le vocabulaire garde une entrée
 * par zone, ce qu'on cherche justement à supprimer.
 * ⚠️ « Sonde ambiance Ss Fil » est en tête pour être reconnu AVANT « Sonde
 * ambiance » : c'est un produit distinct (radio), il ne fusionne pas.
 */
export const REGROUPEMENTS = [
  "Sonde ambiance Ss Fil",
  "Commande Plancher Chauffant",
  "Commande Chauffage",
  "Sonde ambiance",
];

// Mots qui, dans un nom, annoncent le local — c'est là qu'on coupe. Certaines
// entrées font DEUX mots (« grande salle ») : la coupe teste donc la SUITE du
// libellé, pas un mot isolé — sinon « Grande » ne matcherait jamais et on
// couperait à « Salle », laissant un générique « … Grande ».
const LOCAUX =
  "salles?|bureaux?|cuisines?|sanitaires?|hall|vestiaires?|p[ée]risco(?:laire)?|[ée]tages?|dortoirs?|cantine|r[ée]fectoire|couloir|d[ée]gagements?|deg\\.|pr[ée]au|classes?|gar[çc]ons?|filles?|infirmerie|laverie|r[ée]serve|rangement|rgt\\.?|douche|logement|mairie|m[ée]diath[èe]que|conseil|secr[ée]tariat|direction|accueil|locaux?|zone|tribune|gymnase|profs?|professeurs?|repos|jeux|[ée]volution|stockage|d[ée]chets?|grande?\\s+salles?|petite?\\s+salles?|ancien(?:ne)?|nouvelle?|tour|bar|sas|siris|communale|village|atelier|magasin|admin(?:istration)?|technique|primaire|maternelle|periscolaire|tgbt|chaufferie|circulation|sous-sol|plafond|hameau|association\\d*|r[ée]union|travaux|peinture|tisan+erie|mat[ée]riel|office|mang|ce\\d|cm\\d";
// ⚠️ « extérieur » n'est PAS dans cette liste : il qualifie le point lui-même
// (une sonde extérieure est un TYPE de sonde), pas l'endroit où il se trouve.
const MOTS_DE_LOCAL = new RegExp(`\\b(${LOCAUX})\\b`, "i");
/** Même liste, ancrée : « la suite du libellé commence-t-elle par un local ? » */
const DEBUT_DE_LOCAL = new RegExp(`^(${LOCAUX})\\b`, "i");

/**
 * Repères de zone / de trame : « Z3 », « SM1 », « N°04 », « Trames 1-2-3-4 ».
 * Ils distinguent un point d'un autre exactement comme un local — donc ils vont
 * au texte libre, pas au vocabulaire.
 */
const REPERE_DE_ZONE = /^(z\d+|sm\d+|zn?\d+|n°\s*\d+|trames?|\(trames?)\b/i;

/**
 * Coupe un libellé en (générique, complément) au premier mot de local.
 * « Cde contacteur dalle chauffante Salle Communale 1 »
 *   → « Cde contacteur dalle chauffante » + « Salle Communale 1 »
 * Renvoie null si aucun local n'est repéré (le libellé est déjà générique, ou
 * bien il faudra trancher à la main).
 */
export function scinder(libelle: string): { nom: string; complement: string } | null {
  // Séparateur explicite d'abord : « Sonde ambiance Ss Fil — Bar ».
  const tiret = libelle.match(/^(.*?)\s+[—–]\s+(.+)$/);
  if (tiret) return { nom: tiret[1].trim(), complement: tiret[2].trim() };

  // Sinon : on coupe au premier mot de local, en gardant la ponctuation d'origine.
  const mots = libelle.split(/(\s+|_)/); // conserve les séparateurs
  for (let i = 0; i < mots.length; i++) {
    const mot = mots[i];
    if (!mot.trim() || mot === "_") continue;
    // La SUITE du libellé, soulignés normalisés, pour reconnaître « grande salle ».
    const suite = mots.slice(i).join("").replace(/_/g, " ").replace(/\s+/g, " ").trim();
    if (!DEBUT_DE_LOCAL.test(suite) && !REPERE_DE_ZONE.test(mot)) continue;
    if (i === 0) return null; // le local ouvre le libellé : rien de générique à garder
    // Ponctuation de liaison retirée : « Air Neuf : Grande Vitesse » ne doit pas
    // laisser un générique « Air Neuf : ».
    const nom = mots.slice(0, i).join("").replace(/[\s_:;,\-–—/]+$/, "").trim();
    const complement = mots.slice(i).join("").replace(/_/g, " ").replace(/\s+/g, " ").trim();
    if (!nom) return null;
    // Le « générique » obtenu n'est lui-même qu'un mot de local (« Local » dans
    // « Local_Dechet ») : la coupe n'a rien produit d'utile, on laisse l'humain.
    if (MOTS_DE_LOCAL.test(nom) && nom.split(/\s+/).length <= 1) return null;
    return { nom, complement };
  }
  return null;
}

/** Ramène un générique sur la forme canonique du catalogue, si on la connaît. */
export function canoniser(nom: string): string {
  const nettoye = nom.replace(/[_\s]+/g, " ").replace(/\s+$/, "").trim();
  const finir = (v: string) => {
    for (const [re, cible] of FINITIONS) if (re.test(v)) return cible;
    return v;
  };
  // Libellé entièrement synonyme (« M/A » seul → « Commande »).
  for (const [re, cible] of SYNONYMES) if (re.test(nettoye)) return finir(cible);
  // Sinon, tête synonyme + complément d'équipement (« M/A Chauffage » →
  // « Commande Chauffage »). La casse hurlante des imports GFX est ramenée à une
  // forme lisible : « ODM CHAUFFAGE » et « M/A Chauffage » doivent se rejoindre.
  for (const [re, cible] of TETES) {
    if (!re.test(nettoye)) continue;
    // « ambiante » après « Sonde temp. » ne dit rien de plus que la tête.
    const reste = nettoye.replace(re, "").replace(/^ambiante?s?\b\s*/i, "").trim();
    if (!reste) return finir(cible.trim());
    const lisible = reste === reste.toUpperCase() ? reste.charAt(0) + reste.slice(1).toLowerCase() : reste;
    return finir(`${cible}${lisible}`.replace(/\s+/g, " ").trim());
  }
  return finir(nettoye);
}

const motsDe = (s: string) => s.split(/\s+/).filter(Boolean);

/**
 * Rabat un générique sur le regroupement qui l'englobe, en renvoyant au texte
 * libre ce qui le distinguait (« Commande Plancher Chauffant CM1 » → « Commande
 * Plancher Chauffant » + « CM1 »).
 */
export function regrouper(nom: string, complement: string): { nom: string; complement: string } {
  for (const prefixe of [...REGROUPEMENTS].sort((a, b) => motsDe(b).length - motsDe(a).length)) {
    const mp = motsDe(prefixe);
    const mn = motsDe(nom);
    if (mn.length < mp.length) continue;
    if (!mp.every((m, i) => cle(m) === cle(mn[i]))) continue;
    const reste = mn.slice(mp.length).join(" ").replace(/^[:;,\-–—/]+\s*/, "").trim();
    if (!reste) return { nom: prefixe, complement };
    return { nom: prefixe, complement: complement ? `${reste}${FUSION}${complement}` : reste };
  }
  return { nom, complement };
}

/**
 * Rabat un nom sur le plus long préfixe de la liste qui l'ouvre, mot à mot.
 * `regrouper` fait la même chose avec les regroupements arbitrés ; ici la liste
 * est le CATALOGUE lui-même — « Commande contacteur dalle chauffante » retrouve
 * « Commande contacteur », et « dalle chauffante » rejoint le texte libre.
 */
export function rabattreSurPrefixe(
  nom: string,
  prefixes: string[],
): { nom: string; reste: string } | null {
  const mn = motsDe(nom);
  let meilleur: { nom: string; reste: string } | null = null;
  let longueur = 0;
  for (const prefixe of prefixes) {
    const mp = motsDe(prefixe);
    if (!mp.length || mp.length > mn.length || mp.length <= longueur) continue;
    if (!mp.every((m, i) => cle(m) === cle(mn[i]))) continue;
    longueur = mp.length;
    meilleur = { nom: prefixe, reste: mn.slice(mp.length).join(" ").replace(/^[:;,\-–—/]+\s*/, "").trim() };
  }
  return meilleur;
}

export const propre = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
/** Clé de comparaison : sans accent, sans casse, sans ponctuation. */
export const cle = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// --- Normalisation à l'IMPORT ------------------------------------------------

/**
 * Le générique qu'un type d'E/S suffit à nommer, quand le libellé du programme
 * client n'a rien donné d'exploitable.
 *
 * Une SORTIE est toujours un ordre : TOR c'est une commande, analogique c'est un
 * pilotage. Les ENTRÉES ne sont volontairement pas dans cette table — un défaut,
 * un retour de marche et un comptage sont trois DI différents, une sonde de
 * départ, de retour et d'ambiance trois AI différents, et le type ne les
 * départage pas. Deviner y perdrait la seule information que porte le libellé.
 */
export const GENERIQUE_PAR_TYPE: Partial<Record<IoType, string>> = {
  DO: "Commande",
  AO: "Pilotage",
};

export interface EntreeVocabulaire {
  nom: string;
  type?: string | null;
}

export interface LibelleNormalise {
  /** Le générique, ÉCRIT comme au catalogue — la BOM apparie sur le nom exact. */
  nom: string;
  /** Ce qui ne faisait que distinguer ce point : local, zone, repère. */
  complement: string;
  /** Comment on a conclu — pour le dire à l'écran, jamais pour décider. */
  par: "catalogue" | "coupe" | "type";
}

/**
 * Ramène une désignation d'automate sur le vocabulaire de l'entreprise, ou
 * renvoie null pour qu'on n'y touche pas.
 *
 * On ne conclut QUE si le générique obtenu existe déjà au catalogue : l'import
 * ne doit jamais inventer de vocabulaire que personne n'a arbitré. Quatre
 * voies, de la plus précise à la plus générale :
 *
 *   1. le libellé EST un point du catalogue à la variante d'écriture près
 *      (« SONDE_RETOUR » → « Sonde retour ») ;
 *   2. on coupe au local, et le générique restant est au catalogue
 *      (« Cde contacteur dalle chauffante Salle Communale 1 »
 *        → « Cde contacteur dalle chauffante » + « Salle Communale 1 ») ;
 *   3. le catalogue sert de PRÉFIXE : le plus long générique connu qui ouvre le
 *      libellé le nomme, le reste ne faisait que le préciser
 *      (« Defaut Bruleur CHD » → « Defaut » + « Bruleur CHD ») ;
 *   4. faute de mieux, le TYPE d'E/S nomme le point — une sortie est toujours
 *      un ordre — et le libellé d'origine part ENTIER au texte libre. Rien
 *      n'est perdu : le document l'imprime sous le libellé, et le générateur
 *      GFX recompose « nom + texte libre » pour départager les homonymes.
 *
 * Sur les 351 libellés de la base d'août 2026, 283 retombent sur le nom que la
 * relecture humaine avait choisi, 34 sur un générique plus court, 18 restent
 * bruts (voir scripts/normalisation-points-relecture1.csv).
 */
export function normaliserPourImport(
  libelle: string,
  type: IoType | null,
  catalogue: EntreeVocabulaire[],
): LibelleNormalise | null {
  const brut = propre(libelle);
  if (!brut) return null;
  // Le générique du type sert de repli — et de garde-fou : tant qu'il existe, on
  // peut se permettre d'ÉCARTER une cible dont le type contredit le point.
  const repli = type ? GENERIQUE_PAR_TYPE[type] : undefined;

  const vocabulaire = new Map<string, string>();
  for (const c of catalogue) {
    const nom = propre(c.nom);
    if (!nom) continue;
    // Une entrée de catalogue elle-même polluée (« Chauffage_Reserve ») ne peut
    // pas servir de cible : on ne remplace pas un local par un autre.
    if (nomLocalise(nom)) continue;
    // ⚠️ Un type qui CONTREDIT le point disqualifie la cible : « Commande » est
    // une sortie TOR, la coller sur une sortie analogique ferait entrer sa
    // nomenclature — un relais — dans la BOM de l'affaire. On ne s'autorise
    // cette exigence que si le type sait nommer le point tout seul, sinon on
    // perdrait un appariement correct pour rien.
    const t = propre(c.type).toUpperCase();
    if (repli && type && t && t !== type && ES_TYPES.includes(t as (typeof ES_TYPES)[number])) continue;
    vocabulaire.set(cle(nom), nom);
  }

  // 1. Variante d'écriture d'un point du catalogue.
  const direct = vocabulaire.get(cle(brut));
  if (direct) return { nom: direct, complement: "", par: "catalogue" };

  // 2. Coupe au local (ou simple synonymie), si le générique obtenu est connu.
  const coupe = scinder(brut) ?? { nom: brut, complement: "" };
  const rabat = regrouper(canoniser(coupe.nom), coupe.complement);
  const connu = vocabulaire.get(cle(rabat.nom));
  if (connu) return { nom: connu, complement: propre(rabat.complement), par: "coupe" };

  // 2 bis. Le catalogue sert de préfixe : le plus long générique CONNU qui ouvre
  // le libellé le nomme, ce qui suit ne faisait que le préciser.
  const prefixe = rabattreSurPrefixe(rabat.nom, [...vocabulaire.values()]);
  if (prefixe) {
    const complement = [prefixe.reste, rabat.complement].map(propre).filter(Boolean).join(FUSION);
    return { nom: prefixe.nom, complement, par: "coupe" };
  }

  // 4. Le type d'E/S nomme le point ; le libellé brut devient le distinctif.
  const cible = repli ? vocabulaire.get(cle(repli)) : undefined;
  if (cible) return { nom: cible, complement: propre(brut.replace(/_/g, " ")), par: "type" };

  return null;
}
