/* L'outil « Maintenance » : le moteur de forfait, puis la vraie base.
 *
 *   npx tsx --conditions=react-server scripts/maintenance-smoke.mts
 *
 * La PREMIÈRE moitié ne touche à rien — c'est du calcul pur, et c'est là que
 * vivent les règles qui coûteraient cher si elles se trompaient (la date
 * anniversaire, le cumul du forfait, ce qui tombe hors période).
 *
 * NON DESTRUCTIF : tout vit sous des ids préfixés `zz-`, supprimés en fin
 * (bloc finally), y compris en cas d'échec.
 */
import "dotenv/config";
import { createRequire } from "node:module";

const requireCjs = createRequire(import.meta.url);
const cheminServerOnly = requireCjs.resolve("server-only");
requireCjs.cache[cheminServerOnly] = {
  id: cheminServerOnly,
  filename: cheminServerOnly,
  loaded: true,
  exports: {},
} as unknown as NodeJS.Module;

// Les TYPES en import statique (effacé à la compilation, donc il ne déclenche
// pas le chargement du module) ; les VALEURS en import dynamique, après la
// neutralisation de `server-only` ci-dessus.
import type { LignePourForfait, NatureIntervention } from "../src/tools/maintenance/model";

const M = await import("../src/tools/maintenance/model");

let ko = 0;
const v = (nom: string, ok: boolean, d = "") => {
  console.log(`${ok ? "  ok  " : "  KO  "} ${nom}${d ? " — " + d : ""}`);
  if (!ok) ko += 1;
};
const titre = (t: string) => console.log(`\n\x1b[1m${t}\x1b[0m`);

/* ======================================================= 1. les durées ==== */
titre("1. Les durées — minutes entières, jamais d'heures décimales");

const duree = (s: string) => M.parseDuree(s);
v("« 1h30 » = 90 min", duree("1h30") === 90);
v("« 1 h 30 » = 90 min", duree("1 h 30") === 90);
v("« 1:30 » = 90 min", duree("1:30") === 90);
v("« 2h » = 120 min", duree("2h") === 120);
v("« 0h20 » = 20 min", duree("0h20") === 20);
v("« 90 min » = 90 min", duree("90 min") === 90);
v("« 45mn » = 45 min", duree("45mn") === 45);
v("un ENTIER nu vaut des minutes : « 20 » = 20", duree("20") === 20);
v("un DÉCIMAL vaut des heures : « 1,5 » = 90", duree("1,5") === 90);
v("« 1.25 » = 75 min", duree("1.25") === 75);
v("« 1h75 » refusé (75 > 59)", duree("1h75") === null);
v("vide refusé", duree("") === null);
v("« zéro » refusé", duree("0") === null);
v("texte refusé", duree("bonjour") === null);

v("90 → « 1 h 30 »", M.formatDuree(90) === "1 h 30");
v("605 → « 10 h 05 » (minutes sur 2 chiffres)", M.formatDuree(605) === "10 h 05");
v("45 → « 45 min »", M.formatDuree(45) === "45 min");
v("120 → « 2 h » (pas « 2 h 00 »)", M.formatDuree(120) === "2 h");
v("solde négatif → « −2 h »", M.formatSolde(-120) === "−2 h");
v("export décimal : 90 min = 1.5 h", M.enHeuresDecimales(90) === 1.5);

/* ================================================== 2. la date anniversaire */
titre("2. La date anniversaire — le 29 février ne dérive pas");

const bissextile = M.jour("2024-02-29");
v(
  "29/02/2024 + 1 an = 28/02/2025 (et non le 1er mars)",
  M.isoJour(M.ajouterAnnees(bissextile, 1)) === "2025-02-28",
  M.isoJour(M.ajouterAnnees(bissextile, 1)),
);
v(
  "29/02/2024 + 4 ans = 29/02/2028 (on retrouve le vrai jour)",
  M.isoJour(M.ajouterAnnees(bissextile, 4)) === "2028-02-29",
);
v(
  "31/01 + 1 an = 31/01 (le serrage ne touche pas les mois pleins)",
  M.isoJour(M.ajouterAnnees(M.jour("2025-01-31"), 1)) === "2026-01-31",
);

/* ======================================================= 3. les périodes === */
titre("3. Les périodes — dérivées de la date d'effet, jamais stockées");

const debut = M.jour("2024-01-01");
const p3 = M.periodesContrat(debut, null, M.jour("2026-06-15"));
v("3 périodes couvertes au 15/06/2026", p3.length === 3, `${p3.length}`);
v("période 0 = 01/01/2024 → 31/12/2024", M.isoJour(p3[0].dernierJour) === "2024-12-31");
v("période 2 commence le 01/01/2026", M.isoJour(p3[2].debut) === "2026-01-01");
v("aucune n'est tronquée sans terme", p3.every((p) => !p.tronquee));

const pTronq = M.periodesContrat(debut, M.jour("2026-06-30"), M.jour("2026-06-15"));
const derniere = pTronq[pTronq.length - 1];
v("un terme en cours d'année écourte la dernière période", derniere.tronquee);
v("… qui s'arrête au dernier jour du contrat", M.isoJour(derniere.dernierJour) === "2026-06-30");

v(
  "une date avant l'effet n'appartient à aucune période",
  M.periodeContenant(debut, null, M.jour("2023-12-31")) === null,
);
v(
  "le dernier jour d'une période y est INCLUS",
  M.periodeContenant(debut, null, M.jour("2024-12-31"))?.index === 0,
);
v(
  "la date anniversaire ouvre la SUIVANTE",
  M.periodeContenant(debut, null, M.jour("2025-01-01"))?.index === 1,
);
v(
  "un contrat pas encore commencé montre quand même sa 1re période",
  M.periodeCourante(M.jour("2027-01-01"), null, M.jour("2026-01-01")).index === 0,
);

/* ================================================= 4. le cumul du forfait == */
titre("4. Le forfait — le dépassement est CONSTATÉ, pas saisi");

const l = (
  id: string,
  d: string,
  nature: NatureIntervention,
  dureeMin: number,
  horsForfait = false,
): LignePourForfait => ({
  id,
  date: M.jour(d),
  nature,
  dureeMin,
  horsForfait,
  createdAt: new Date(2026, 0, 1),
});

const quotas = { quotaTeleMin: 600, quotaPresentielMin: 0 };
const r = M.repartirForfait(
  [
    l("a", "2024-03-01", "TELEASSISTANCE", 300),
    l("b", "2024-04-01", "TELEASSISTANCE", 400),
    l("c", "2024-05-01", "PRESENTIEL", 240),
  ],
  quotas,
);
const par = (id: string) => r.lignes.find((x) => x.id === id)!;

v("la 1re tient dans le forfait", par("a").inclusMin === 300 && par("a").horsMin === 0);
v(
  "la 2e est À CHEVAL : 300 incluses, 100 en dépassement",
  par("b").inclusMin === 300 && par("b").horsMin === 100,
  `${par("b").inclusMin}/${par("b").horsMin}`,
);
v("… et sa cause est « dépassement »", par("b").cause === "depassement");
v("téléassistance : forfait épuisé", r.consommation.TELEASSISTANCE.restantMin === 0);
v("… 100 min de dépassement", r.consommation.TELEASSISTANCE.depassementMin === 100);

v(
  "LES DEUX FORFAITS NE SE COMPENSENT PAS : le présentiel sans quota est tout en dépassement",
  r.consommation.PRESENTIEL.depassementMin === 240 &&
    r.consommation.PRESENTIEL.consommeMin === 0,
);
v(
  "le temps total reste juste, quelle que soit l'imputation",
  r.consommation.TELEASSISTANCE.totalMin === 700 &&
    r.consommation.PRESENTIEL.totalMin === 240,
);

const rDecision = M.repartirForfait(
  [
    l("x", "2024-03-01", "TELEASSISTANCE", 120, true),
    l("y", "2024-03-02", "TELEASSISTANCE", 120),
  ],
  quotas,
);
v(
  "une DÉCISION « hors forfait » ne consomme aucun quota",
  rDecision.consommation.TELEASSISTANCE.consommeMin === 120,
  `consommé ${rDecision.consommation.TELEASSISTANCE.consommeMin}`,
);
v(
  "… et elle est comptée à part du dépassement",
  rDecision.consommation.TELEASSISTANCE.horsContratMin === 120 &&
    rDecision.consommation.TELEASSISTANCE.depassementMin === 0,
);

const rOrdre = M.repartirForfait(
  [l("tard", "2024-06-01", "TELEASSISTANCE", 400), l("tot", "2024-02-01", "TELEASSISTANCE", 400)],
  quotas,
);
v(
  "le cumul suit la DATE, pas l'ordre d'arrivée : c'est la plus tardive qui déborde",
  rOrdre.lignes.find((x) => x.id === "tot")!.horsMin === 0 &&
    rOrdre.lignes.find((x) => x.id === "tard")!.horsMin === 200,
);

/* ============================================ 5. ce qui tombe hors période = */
titre("5. Hors période — le temps saisi ne s'évapore jamais");

const calcul = M.calculerContrat(
  debut,
  M.jour("2025-12-31"),
  quotas,
  [
    l("dedans", "2024-05-01", "TELEASSISTANCE", 60),
    l("avant", "2023-11-01", "TELEASSISTANCE", 60),
    l("apres", "2026-03-01", "TELEASSISTANCE", 60),
  ],
  M.jour("2026-06-01"),
);
v("2 interventions signalées hors contrat", calcul.horsPeriode.length === 2);
v(
  "… elles gardent leurs minutes, en hors forfait",
  calcul.parLigne.get("avant")!.horsMin === 60 &&
    calcul.parLigne.get("apres")!.horsMin === 60,
);
v(
  "… avec la cause « hors-periode », pour qu'un écran puisse le dire",
  calcul.parLigne.get("avant")!.cause === "hors-periode",
);
v("celle de l'intérieur est bien imputée", calcul.parLigne.get("dedans")!.inclusMin === 60);
v(
  "AUCUNE minute n'est perdue : total réparti = total saisi",
  [...calcul.parLigne.values()].reduce((s, x) => s + x.inclusMin + x.horsMin, 0) === 180,
);

const enAvance = M.calculerContrat(
  debut,
  null,
  quotas,
  [l("futur", "2027-02-01", "PRESENTIEL", 60)],
  M.jour("2026-06-01"),
);
v(
  "une intervention notée EN AVANCE trouve quand même sa période",
  enAvance.horsPeriode.length === 0 && enAvance.parLigne.get("futur") != null,
);

/* ==================================================== 6. l'échéance ======== */
titre("6. L'échéance — le préavis est le moment où l'on décide");

const today = M.jour("2026-09-11");
v(
  "sans terme : rien à décider",
  M.echeanceContrat(null, 90, today).etat === "sans-terme",
);
v(
  "terme dans 200 jours, préavis 90 : loin",
  M.echeanceContrat(M.ajouterJours(today, 200), 90, today).etat === "loin",
);
v(
  "terme dans 60 jours, préavis 90 : on est DANS le préavis",
  M.echeanceContrat(M.ajouterJours(today, 60), 90, today).etat === "preavis",
);
v(
  "sans préavis déclaré, on prévient quand même à 90 jours",
  M.echeanceContrat(M.ajouterJours(today, 60), 0, today).etat === "proche",
);
v(
  "terme passé : échu",
  M.echeanceContrat(M.ajouterJours(today, -1), 90, today).etat === "echu",
);
v(
  "… avec le nombre de jours de retard",
  M.echeanceContrat(M.ajouterJours(today, -10), 90, today).joursRestants === -10,
);

/* ================================================= 7. ce qu'on ne sait pas = */
titre("7. Ce qu'on ne sait pas chiffrer est DIT");

v(
  "sans tarif horaire, le hors forfait n'a pas de montant (et non « 0 € »)",
  M.montantHorsForfaitCents(120, 0) === null,
);
v(
  "avec un tarif, 1 h 30 à 75 €/h = 112,50 €",
  M.montantHorsForfaitCents(90, 7500) === 11250,
);
v("un forfait à 0 ne rend pas 100 % consommé", M.pourcentConsomme(r.consommation.PRESENTIEL) === 0);
v("600/600 = 100 %", M.pourcentConsomme(r.consommation.TELEASSISTANCE) === 100);

/* ================================================= 8. la vraie base ======== */
titre("8. La chaîne complète — vraie base");

const { prisma } = await import("../src/lib/db");
const Q = await import("../src/tools/maintenance/queries");

const moi = await prisma.user.findFirst({ where: { actif: true }, select: { id: true } });
if (!moi) throw new Error("aucun utilisateur actif");

// Le contrat commence il y a EXACTEMENT deux ans : aujourd'hui est donc le
// premier jour de la période 2, quel que soit le jour où l'on joue ce script.
const AUJ = M.aujourdhui();
const DEBUT = M.ajouterAnnees(AUJ, -2);

try {
  await prisma.client.upsert({
    where: { id: "zz-cli-mt" },
    create: { id: "zz-cli-mt", nom: "ZZ Vérif maintenance" },
    update: {},
  });
  await prisma.siteClient.upsert({
    where: { id: "zz-site-mt" },
    create: { id: "zz-site-mt", clientId: "zz-cli-mt", nom: "ZZ Salle 1" },
    update: { actif: true },
  });
  await prisma.siteClient.upsert({
    where: { id: "zz-site-mt2" },
    create: { id: "zz-site-mt2", clientId: "zz-cli-mt", nom: "ZZ Salle 2", actif: false },
    update: { actif: false },
  });
  await prisma.contratMaintenance.upsert({
    where: { id: "zz-ctr-mt" },
    create: {
      id: "zz-ctr-mt",
      intitule: "ZZ Contrat de vérification",
      clientId: "zz-cli-mt",
      etat: "ACTIF",
      debut: DEBUT,
      quotaTeleMin: 600,
      quotaPresentielMin: 0,
      tarifHoraireCents: 7500,
      preavisJours: 90,
    },
    update: { debut: DEBUT, quotaTeleMin: 600, quotaPresentielMin: 0 },
  });
  await prisma.contratSite.upsert({
    where: { contratId_siteId: { contratId: "zz-ctr-mt", siteId: "zz-site-mt" } },
    create: { contratId: "zz-ctr-mt", siteId: "zz-site-mt" },
    update: {},
  });

  const pose = (id: string, date: Date, dureeMin: number, opts: Record<string, unknown> = {}) =>
    prisma.intervention.upsert({
      where: { id },
      create: {
        id,
        contratId: "zz-ctr-mt",
        date,
        nature: "TELEASSISTANCE",
        dureeMin,
        motif: `ZZ ${id}`,
        intervenantId: moi.id,
        ...opts,
      },
      update: { date, dureeMin, factureeLe: null, ...opts },
    });

  // Période 2 (en cours) : 300 puis 400 → 600 au forfait, 100 en dépassement.
  await pose("zz-i1", M.ajouterJours(AUJ, 1), 300);
  await pose("zz-i2", M.ajouterJours(AUJ, 2), 400);
  // Période 1 : 200 min, largement dans le forfait de SA période.
  await pose("zz-i3", M.ajouterJours(AUJ, -180), 200);
  // Hors contrat : 10 jours avant la date d'effet.
  await pose("zz-i4", M.ajouterJours(DEBUT, -10), 60);

  const liste = await Q.listerContrats();
  const c = liste.find((x) => x.id === "zz-ctr-mt");
  v("le contrat remonte dans la liste", c != null);

  v(
    "la période en cours est bien la 3e (index 2)",
    c!.periode.index === 2,
    `index ${c!.periode.index}`,
  );
  v(
    "elle s'ouvre le jour anniversaire",
    c!.periode.debut === M.isoJour(AUJ),
    c!.periode.debut,
  );
  v(
    "600 min consommées sur la période en cours",
    c!.consommation.TELEASSISTANCE.consommeMin === 600,
    `${c!.consommation.TELEASSISTANCE.consommeMin}`,
  );
  v(
    "100 min de dépassement (et pas les 200 de l'an dernier)",
    c!.consommation.TELEASSISTANCE.depassementMin === 100,
    `${c!.consommation.TELEASSISTANCE.depassementMin}`,
  );
  v(
    "à refacturer = 100 (dépassement) + 60 (hors contrat), TOUTES périodes",
    c!.aFacturerMin === 160,
    `${c!.aFacturerMin}`,
  );
  v("l'échéance d'un contrat sans terme ne réclame rien", c!.echeance.etat === "sans-terme");

  const stats = M.statsContrats(liste.filter((x) => x.id === "zz-ctr-mt"));
  v("le cadran compte un forfait dépassé", stats.nbDepasses === 1);
  v(
    "… et le chiffre : 160 min à 75 €/h = 200 €",
    stats.aFacturerCents === 20000,
    `${stats.aFacturerCents}`,
  );

  const d = await Q.getContratDetail("zz-ctr-mt");
  v("la fiche s'ouvre sur la période en cours", d!.periodeIndex === 2);
  v("… et ne montre que SES interventions", d!.interventions.length === 2, `${d!.interventions.length}`);
  v(
    "l'intervention à cheval est imputée aux deux : 300 au forfait, 100 au-delà",
    d!.interventions.find((i) => i.id === "zz-i2")?.inclusMin === 300 &&
      d!.interventions.find((i) => i.id === "zz-i2")?.horsMin === 100,
  );
  v(
    "CE QUI EST HORS CONTRAT EST DIT, pas avalé",
    d!.horsPeriode.length === 1 && d!.horsPeriode[0].id === "zz-i4",
  );
  v("3 périodes proposées, la plus récente en tête", d!.periodes.length === 3 && d!.periodes[0].index === 2);
  v("la période en cours est repérée comme telle", d!.periodes[0].courante === true);

  const passe = await Q.getContratDetail("zz-ctr-mt", 1);
  v("on peut remonter à la période précédente", passe!.periodeIndex === 1);
  v("… qui montre ses 200 min, toutes au forfait", passe!.consommation.TELEASSISTANCE.consommeMin === 200);
  v("… et son forfait repart à zéro : rien en dépassement", passe!.consommation.TELEASSISTANCE.depassementMin === 0);

  // Facturer le dépassement : seul le hors forfait NON facturé doit rester.
  await prisma.intervention.update({
    where: { id: "zz-i2" },
    data: { factureeLe: new Date() },
  });
  const apres = await Q.getContratDetail("zz-ctr-mt");
  v(
    "une fois facturée, elle sort du reste à facturer (160 → 60)",
    apres!.aFacturerMin === 60,
    `${apres!.aFacturerMin}`,
  );
  v(
    "… mais elle consomme TOUJOURS le forfait : facturer ne rend pas des heures",
    apres!.consommation.TELEASSISTANCE.consommeMin === 600,
  );

  const sitesActifs = await Q.sitesDuClient("zz-cli-mt");
  v("un site sorti du parc n'est plus proposé", sitesActifs.length === 1, `${sitesActifs.length}`);
  v("… mais il reste au référentiel", (await Q.sitesDuClient("zz-cli-mt", true)).length === 2);

  const artefacts = await Q.listerPourClient("zz-cli-mt");
  v("la fiche client saurait l'afficher", artefacts.length === 1);
  v(
    "… avec un résumé qui dit l'essentiel",
    artefacts[0].resume.includes("1 site") && artefacts[0].resume.includes("10 h/an"),
    artefacts[0].resume,
  );
} finally {
  await prisma.intervention.deleteMany({ where: { contratId: "zz-ctr-mt" } });
  await prisma.contratSite.deleteMany({ where: { contratId: "zz-ctr-mt" } });
  await prisma.contratMaintenance.deleteMany({ where: { id: "zz-ctr-mt" } });
  await prisma.siteClient.deleteMany({ where: { clientId: "zz-cli-mt" } });
  await prisma.client.deleteMany({ where: { id: "zz-cli-mt" } });
  await prisma.$disconnect();
}

console.log(
  ko === 0
    ? `\n\x1b[32mTout est vert.\x1b[0m`
    : `\n\x1b[31m${ko} contrôle(s) en échec.\x1b[0m`,
);
process.exit(ko === 0 ? 0 : 1);
