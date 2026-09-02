/* Contrôles du BESOIN CONSOLIDÉ, contre la VRAIE base — lecture seule.
 *
 *   npx tsx --conditions=react-server scripts/besoin-consolide-smoke.mts
 *
 * Ce qu'on vérifie tient en une phrase : le besoin s'additionne, le STOCK NON.
 * C'est le seul endroit où l'erreur ne se verrait pas — une commande courte
 * part sans que rien ne l'annonce, et on s'en aperçoit sur le chantier.
 */
import "dotenv/config";
import { createRequire } from "node:module";

const requireCjs = createRequire(import.meta.url);
const cheminServerOnly = requireCjs.resolve("server-only");
requireCjs.cache[cheminServerOnly] = {
  id: cheminServerOnly, filename: cheminServerOnly, loaded: true, exports: {},
} as unknown as NodeJS.Module;

const { prisma } = await import("../src/lib/db");
const { besoinConsolide } = await import("../src/tools/magasin/besoin-consolide");
const { bomAffaire } = await import("../src/tools/magasin/bom");
const { totaliser } = await import("../src/tools/magasin/model");

let ko = 0;
const v = (nom: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "  ok  " : "  KO  "} ${nom}${detail ? " — " + detail : ""}`);
  if (!ok) ko += 1;
};

const t0 = Date.now();
const b = await besoinConsolide();
console.log(
  `besoinConsolide() : ${Date.now() - t0} ms · ${b.affaires.length} affaires · ${b.lignes.length} produits · ${b.trous.length} trous\n`,
);

/* --- 1. Les affaires candidates ----------------------------------------- */

const etats = new Set(b.affaires.map((a) => a.etat));
v("aucune affaire clôturée ni en corbeille", !etats.has("CLOTURE") && !etats.has("CORBEILLE"),
  [...etats].join(", "));
const enBase = await prisma.chantier.count({ where: { etat: { notIn: ["CLOTURE", "CORBEILLE"] } } });
v("toutes les affaires vivantes sont candidates", b.affaires.length === enBase,
  `${b.affaires.length} / ${enBase}`);

/* --- 2. On RÉUTILISE la BOM, on ne la recalcule pas ---------------------- *
 * Le contrôle qui porte tout le reste : sur UNE affaire, le consolidé doit
 * rendre exactement ce qu'affiche sa fiche matériel. Si les deux divergent un
 * jour, c'est ici qu'on l'apprend — pas devant le fournisseur. */

const cible = b.affaires.find((a) => b.lignes.some((l) => l.contribs.some((c) => c.chantierId === a.id)));
if (!cible) {
  v("une affaire porte du matériel", false, "aucune affaire avec BOM : le reste est intestable");
} else {
  const bom = await bomAffaire(cible.id);
  const seule = new Set([cible.id]);
  const attendu = new Map(bom.lignes.map((l) => [l.produitId, l]));
  const obtenu = b.lignes
    .map((l) => ({ l, t: totaliser(l, seule) }))
    .filter((x) => x.t.nbAffaires > 0);

  v("mêmes produits que la BOM de l'affaire", obtenu.length === bom.lignes.length,
    `${obtenu.length} vs ${bom.lignes.length} (${cible.nom})`);
  v(
    "mêmes besoins, produit par produit",
    obtenu.every((x) => {
      const a = attendu.get(x.l.produitId);
      if (!a) return false;
      return a.horsFourniture ? x.t.besoin === 0 : x.t.besoin === a.besoin;
    }),
  );
  v(
    "mêmes manquants, produit par produit",
    obtenu.every((x) => x.t.manquant === (attendu.get(x.l.produitId)?.manquant ?? -1)),
  );
}

/* --- 3. Ce qui se somme ------------------------------------------------- */

const toutes = new Set(b.affaires.map((a) => a.id));
const sommeContribs = b.lignes.reduce(
  (s, l) => s + l.contribs.filter((c) => !c.horsFourniture).reduce((x, c) => x + c.besoin, 0),
  0,
);
const sommeTotalisee = b.lignes.reduce((s, l) => s + totaliser(l, toutes).besoin, 0);
v("le besoin de toutes les affaires = la somme des contributions",
  sommeContribs === sommeTotalisee, `${sommeTotalisee}`);

const vide = new Set<string>();
v("aucune affaire retenue ⇒ aucun besoin",
  b.lignes.every((l) => totaliser(l, vide).besoin === 0 && totaliser(l, vide).aCommander === 0));

/* --- 4. ⚠️ Ce qui NE se somme PAS : le stock ----------------------------- */

const partage = b.lignes.filter((l) => l.contribs.length > 1);
v("des produits sont appelés par plusieurs affaires", partage.length > 0,
  `${partage.length} produit(s) — sans quoi le contrôle suivant ne prouve rien`);

for (const l of partage.slice(0, 3)) {
  const bomUne = await bomAffaire(l.contribs[0]!.chantierId);
  const stockUne = bomUne.lignes.find((x) => x.produitId === l.produitId)?.stock;
  v(
    `stock non multiplié — ${l.refInterne} (${l.contribs.length} affaires)`,
    l.stock === stockUne,
    `consolidé ${l.stock}, une seule affaire ${stockUne}`,
  );
}

/* --- 5. Le disponible et ce qu'il reste à acheter ------------------------ */

v("le disponible n'est jamais négatif",
  b.lignes.every((l) => totaliser(l, toutes).dispo >= 0),
  `dont ${b.lignes.filter((l) => l.stock < 0).length} produit(s) à stock négatif en base`);
v("le disponible retire les réservations, y compris hors sélection",
  b.lignes.every((l) => totaliser(l, toutes).dispo === Math.max(0, l.stock - l.reserveTotale)));
v("à commander = ce que le disponible ne couvre pas",
  b.lignes.every((l) => {
    const t = totaliser(l, toutes);
    return t.aCommander === Math.max(0, t.manquant - t.dispo);
  }));
v("à commander ≤ manquant ≤ besoin",
  b.lignes.every((l) => {
    const t = totaliser(l, toutes);
    return t.aCommander <= t.manquant && t.manquant <= t.besoin;
  }));

/* --- 6. Hors fourniture : écarté, mais DIT ------------------------------- */

const horsFourniture = b.lignes.filter((l) => l.contribs.some((c) => c.horsFourniture));
v("les lignes hors fourniture ne pèsent pas sur le besoin",
  horsFourniture.every((l) => {
    const t = totaliser(l, toutes);
    const brut = l.contribs.reduce((s, c) => s + c.besoin, 0);
    return t.besoin < brut && t.nbHorsFourniture > 0;
  }),
  `${horsFourniture.length} produit(s) concerné(s)`);

/* --- 7. Le fournisseur, celui du bon de commande ------------------------- */

const avecFournisseur = b.lignes.filter((l) => l.fournisseurId !== null);
const attendus = await prisma.produit.findMany({
  where: { id: { in: avecFournisseur.map((l) => l.produitId) } },
  select: { id: true, fournisseur: { select: { nom: true } } },
});
const parId = new Map(attendus.map((p) => [p.id, p.fournisseur?.nom ?? null]));
v("le fournisseur affiché est celui du produit",
  avecFournisseur.every((l) => l.fournisseurNom === parId.get(l.produitId)),
  `${avecFournisseur.length} / ${b.lignes.length} produits ont un fournisseur`);

/* --- 8. Les trous : ce qui manquerait à la commande ---------------------- */

v("chaque trou nomme au moins une affaire",
  b.trous.every((t) => t.parAffaire.length > 0 && t.parAffaire.every((p) => toutes.has(p.chantierId))));

console.log(ko === 0 ? "\n✔ tout est vert" : `\n✘ ${ko} contrôle(s) en échec`);
await prisma.$disconnect();
process.exit(ko === 0 ? 0 : 1);
