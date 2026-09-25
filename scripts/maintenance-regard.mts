/* REGARDER l'outil « Maintenance » — les contrôles ne voient pas une mise en page.
 *   BASE=http://127.0.0.1:3011 npx tsx scripts/maintenance-regard.mts
 *
 * Il POSE un contrat de démonstration (ids `zz-`), capture les écrans dans les
 * deux largeurs, puis EFFACE tout. Rien de ce qu'il crée ne survit.
 */
import { readFileSync } from "node:fs";
import { readdir, access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { encode } from "@auth/core/jwt";
import pg from "pg";

const BASE = process.env.BASE ?? "http://127.0.0.1:3011";
const SORTIE = process.env.SORTIE ?? "/tmp/maintenance-regard";
for (const l of readFileSync(".env", "utf8").split("\n")) {
  const m = /^([A-Z_]+)=(.*)$/.exec(l.trim());
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const u = (
  await db.query(
    `SELECT id, nom, role, email FROM "User" WHERE actif = true ORDER BY "createdAt" LIMIT 1`,
  )
).rows[0];
console.log(`session : ${u.nom}`);

/* ------------------------------------------------- un contrat à regarder -- */
const J = 86_400_000;
const midi = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12));
const AUJ = midi(new Date());
const ilYA = (n: number) => new Date(AUJ.getTime() - n * J);
const dans = (n: number) => new Date(AUJ.getTime() + n * J);
/** Deux ans et quatre mois : aujourd'hui tombe au MILIEU de la 3e période —
 *  sinon le forfait de la période en cours s'affiche vide, et on ne regarde
 *  rien du tout. */
const DEBUT = midi(
  new Date(
    Date.UTC(AUJ.getUTCFullYear() - 2, AUJ.getUTCMonth() - 4, AUJ.getUTCDate(), 12),
  ),
);

await db.query(
  `INSERT INTO "Client" (id, nom, "updatedAt") VALUES ('zz-cli-rg', 'ZZ Commune de Brancourt', now())
   ON CONFLICT (id) DO NOTHING`,
);
const sites = [
  ["zz-s1", "Salle communale", "12 rue de l'Église", "02110", "Brancourt", "VPN Teltonika RUT241", "Clé à la mairie, local GTB au sous-sol"],
  ["zz-s2", "Groupe scolaire Jean Macé", "3 allée des Tilleuls", "02110", "Brancourt", "TeamViewer poste chaufferie", "Code portail 1974A"],
  ["zz-s3", "Complexe sportif", "Route de Fresnoy", "02110", "Brancourt", "", ""],
];
for (const [id, nom, adr, cp, ville, distant, acces] of sites) {
  await db.query(
    `INSERT INTO "SiteClient" (id, "clientId", nom, adresse, "codePostal", ville, "accesDistant", acces, "updatedAt")
     VALUES ($1,'zz-cli-rg',$2,$3,$4,$5,$6,$7, now()) ON CONFLICT (id) DO NOTHING`,
    [id, nom, adr, cp, ville, distant, acces],
  );
}
await db.query(
  `INSERT INTO "ContratMaintenance"
     (id, intitule, "clientId", reference, "numeroWhy", etat, debut, fin, tacite,
      "preavisJours", "quotaTeleMin", "quotaPresentielMin", "tarifHoraireCents", notes, "updatedAt")
   VALUES ('zz-ctr-rg', 'Maintenance GTB — bâtiments communaux', 'zz-cli-rg', 'CM-2024-017',
           'W24-0312', 'ACTIF', $1, $2, true, 90, 600, 480, 7500,
           'Astreinte hors heures ouvrées non incluse. Le remplacement de matériel est refacturé au prix du jour.', now())
   ON CONFLICT (id) DO NOTHING`,
  [DEBUT, dans(52)],
);
for (const s of ["zz-s1", "zz-s2", "zz-s3"]) {
  await db.query(
    `INSERT INTO "ContratSite" ("contratId","siteId") VALUES ('zz-ctr-rg',$1) ON CONFLICT DO NOTHING`,
    [s],
  );
}

const interventions: [string, Date, string, number, string, string | null, boolean, string][] = [
  ["zz-r1", ilYA(2), "TELEASSISTANCE", 25, "Redémarrage de l'automate après coupure secteur", "zz-s1", false, ""],
  ["zz-r2", ilYA(5), "PRESENTIEL", 210, "Remplacement sonde de gaine défaillante", "zz-s2", false, "Sonde CTN remplacée, courbe de chauffe recalée. Reste à vérifier le débit au prochain passage."],
  ["zz-r3", ilYA(9), "TELEASSISTANCE", 45, "Modification du planning d'occupation", "zz-s2", false, ""],
  ["zz-r4", ilYA(14), "TELEASSISTANCE", 90, "Défaut de communication Modbus sur la centrale", "zz-s3", false, ""],
  ["zz-r5", ilYA(21), "TELEASSISTANCE", 400, "Reprise complète de la régulation après intervention d'un tiers", "zz-s1", true, "Hors contrat : dérèglement causé par le prestataire plomberie."],
  ["zz-r6", ilYA(28), "PRESENTIEL", 330, "Visite de maintenance préventive annuelle", null, false, ""],
  ["zz-r7", ilYA(35), "TELEASSISTANCE", 120, "Analyse d'une surconsommation signalée par la mairie", "zz-s2", false, ""],
];
for (const [id, date, nature, duree, motif, site, hors, cr] of interventions) {
  await db.query(
    `INSERT INTO "Intervention"
       (id, "contratId", date, nature, "dureeMin", motif, "compteRendu", demandeur,
        "siteId", "intervenantId", "horsForfait", "updatedAt")
     VALUES ($1,'zz-ctr-rg',$2,$3::"NatureIntervention",$4,$5,$6,'Mme Legrand (mairie)',$7,$8,$9, now())
     ON CONFLICT (id) DO NOTHING`,
    [id, date, nature, duree, motif, cr, site, u.id, hors],
  );
}
// La date fautive : elle doit être DITE, pas avalée.
await db.query(
  `INSERT INTO "Intervention"
     (id, "contratId", date, nature, "dureeMin", motif, "compteRendu", demandeur, "intervenantId", "updatedAt")
   VALUES ('zz-r8', 'zz-ctr-rg', $1, 'TELEASSISTANCE', 60, 'Assistance mise en service (date à corriger)', '', '', $2, now())
   ON CONFLICT (id) DO NOTHING`,
  [new Date(DEBUT.getTime() - 20 * J), u.id],
);

const jeton = await encode({
  token: { sub: u.id, uid: u.id, role: u.role, email: u.email },
  secret: process.env.AUTH_SECRET!,
  salt: "authjs.session-token",
  maxAge: 3600,
});

async function chrome() {
  const r = join(process.env.HOME!, ".cache", "ms-playwright");
  for (const d of (await readdir(r)).filter((e) => e.startsWith("chromium")))
    for (const s of await readdir(join(r, d)))
      for (const n of ["chrome-headless-shell", "headless_shell", "chrome"]) {
        const p = join(r, d, s, n);
        try {
          await access(p);
          return p;
        } catch {}
      }
  throw new Error("pas de chromium");
}

await mkdir(SORTIE, { recursive: true });
const nav = await chromium.launch({ executablePath: await chrome() });
const ctx = await nav.newContext({ viewport: { width: 1600, height: 1100 } });
await ctx.addCookies([
  { name: "authjs.session-token", value: jeton, domain: "127.0.0.1", path: "/", httpOnly: true },
]);
const page = await ctx.newPage();
const soucis: string[] = [];
page.on("pageerror", (e) => soucis.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") soucis.push(`console: ${m.text()}`);
});

/** La coquille défile EN INTERNE : `fullPage` ne capturerait que le viewport. */
async function defiler(y: number) {
  await page.evaluate((cible) => {
    let best: Element | null = null;
    let max = 0;
    for (const e of [document.scrollingElement, ...document.querySelectorAll("*")]) {
      if (!e) continue;
      const d = e.scrollHeight - e.clientHeight;
      if (d > max) {
        max = d;
        best = e;
      }
    }
    (best ?? document.scrollingElement)!.scrollTop = cible;
  }, y);
  await page.waitForTimeout(350);
}

async function vue(chemin: string, fichier: string, y = 0) {
  await page.goto(`${BASE}${chemin}`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(900);
  if (y) await defiler(y);
  await page.screenshot({ path: `${SORTIE}/${fichier}.png` });
  const deborde = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  console.log(
    `${deborde ? "  KO  " : "  ok  "} ${fichier}${deborde ? " — DÉBORDE en largeur" : ""}`,
  );
}

try {
  await vue("/perso/gus", "0-espace");
  await vue("/perso/gus/maintenance", "1-index");
  await vue("/perso/gus/maintenance/zz-ctr-rg", "2-fiche");
  await vue("/perso/gus/maintenance/zz-ctr-rg", "3-fiche-bas", 900);
  await vue("/perso/gus/maintenance/zz-ctr-rg", "4-fiche-fin", 2100);
  await vue("/perso/gus/maintenance/zz-ctr-rg/modifier", "5-editeur");
  await vue("/perso/gus/maintenance/zz-ctr-rg/modifier", "6-editeur-bas", 900);
  await vue("/perso/gus/maintenance/sites", "7-sites");
  await vue("/perso/gus/maintenance/nouveau", "8-nouveau");

  // La période précédente : le forfait doit y repartir à zéro.
  await vue("/perso/gus/maintenance/zz-ctr-rg?p=1", "9-periode-passee");

  // Au téléphone : les tables doivent se replier en cartes.
  await page.setViewportSize({ width: 390, height: 880 });
  await vue("/perso/gus/maintenance", "10-tel-index");
  await vue("/perso/gus/maintenance/zz-ctr-rg", "11-tel-fiche", 700);
  await vue("/perso/gus/maintenance/zz-ctr-rg", "12-tel-interventions", 1700);
} finally {
  await nav.close();
  await db.query(`DELETE FROM "Intervention" WHERE "contratId" = 'zz-ctr-rg'`);
  await db.query(`DELETE FROM "ContratSite" WHERE "contratId" = 'zz-ctr-rg'`);
  await db.query(`DELETE FROM "ContratMaintenance" WHERE id = 'zz-ctr-rg'`);
  await db.query(`DELETE FROM "SiteClient" WHERE "clientId" = 'zz-cli-rg'`);
  await db.query(`DELETE FROM "Client" WHERE id = 'zz-cli-rg'`);
  await db.end();
}

console.log(
  soucis.length === 0
    ? "\n  ok  aucune erreur navigateur"
    : `\n  KO  ${soucis.length} erreur(s) :\n   - ${[...new Set(soucis)].join("\n   - ")}`,
);
console.log(`\nCaptures : ${SORTIE}`);
