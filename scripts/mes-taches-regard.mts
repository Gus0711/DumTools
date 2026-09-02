/* REGARDER l'écran « Mes tâches ».
 *   BASE=http://localhost:3001 npx tsx scripts/mes-taches-regard.mts
 * ⚠️ La coquille défile EN INTERNE : `fullPage` ne capture que le viewport. */
import { readFileSync } from "node:fs";
import { readdir, access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { encode } from "@auth/core/jwt";
import pg from "pg";

const BASE = process.env.BASE ?? "http://localhost:3001";
const SORTIE = process.env.SORTIE ?? "/tmp/mes-taches-regard";
for (const l of readFileSync(".env", "utf8").split("\n")) {
  const m = /^([A-Z_]+)=(.*)$/.exec(l.trim());
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const u = (await db.query(
  `SELECT u.id, u.nom, u.role, u.email, count(t.id) AS n
     FROM "User" u LEFT JOIN "TacheAffaire" t ON t."assigneId"=u.id
    WHERE u.actif=true GROUP BY u.id ORDER BY n DESC LIMIT 1`)).rows[0];
console.log(`session : ${u.nom} (${u.n} tâches)`);
await db.end();

const jeton = await encode({
  token: { sub: u.id, uid: u.id, role: u.role, email: u.email },
  secret: process.env.AUTH_SECRET!, salt: "authjs.session-token", maxAge: 3600,
});
async function chrome() {
  const r = join(process.env.HOME!, ".cache", "ms-playwright");
  for (const d of (await readdir(r)).filter((e) => e.startsWith("chromium")))
    for (const s of await readdir(join(r, d)))
      for (const n of ["chrome-headless-shell", "headless_shell", "chrome"]) {
        const p = join(r, d, s, n);
        try { await access(p); return p; } catch {}
      }
  throw new Error("pas de chromium");
}
await mkdir(SORTIE, { recursive: true });
const nav = await chromium.launch({ executablePath: await chrome() });
const ctx = await nav.newContext({ viewport: { width: 1600, height: 1100 } });
await ctx.addCookies([{ name: "authjs.session-token", value: jeton, domain: "localhost", path: "/", httpOnly: true }]);
const page = await ctx.newPage();
const soucis: string[] = [];
page.on("pageerror", (e) => soucis.push(e.message));
page.on("console", (m) => { if (m.type() === "error") soucis.push(m.text()); });

async function defiler(y: number) {
  await page.evaluate((cible) => {
    let best: Element | null = null; let max = 0;
    for (const e of [document.scrollingElement, ...document.querySelectorAll("*")]) {
      if (!e) continue;
      const d = e.scrollHeight - e.clientHeight;
      if (d > max) { max = d; best = e; }
    }
    (best ?? document.scrollingElement)!.scrollTop = cible;
  }, y);
  await page.waitForTimeout(350);
}

await page.goto(`${BASE}/mes-taches`, { waitUntil: "networkidle", timeout: 180000 });
await page.waitForTimeout(1000);
await page.screenshot({ path: `${SORTIE}/1-defaut.png` });

// Le CORPS d'une tâche. Le repère est masqué tant qu'aucune note n'existe et
// qu'on ne survole pas la ligne : on le vise par son intitulé, pas par sa
// position, et on force sa visibilité comme le ferait un survol.
const repere = page.getByTitle(/Ajouter une note|Voir la note/).first();
if (await repere.count()) {
  await repere.click({ force: true });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SORTIE}/0-corps.png` });

  // ⚠️ Cliquer DANS le corps avant d'écrire : il s'ouvre en LECTURE, l'éditeur
  // ne se monte qu'au clic. Sans ça la frappe part sur le bouton encore
  // focalisé — et « Entrée » le RECLIQUE, donc replie tout.
  // Le libellé dépend de l'état : « Rien de noté » si vide, le texte sinon.
  const zone = page.locator('[role="button"][title*="Cliquer pour écrire"]').first();
  await zone.click();
  await page.waitForTimeout(3000);
  // ⚠️ PAS de « / » dans le texte de test : hors saisie, l'appli s'en sert pour
  // ouvrir la palette de recherche.
  await page.keyboard.type("Devis recu le 28 aout, valable 30 jours.");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Confirmer la reference aupres du fournisseur.");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SORTIE}/0b-corps-ecrit.png` });
}

// Le bas de liste : c'est là que vivent les lignes DÉDUITES.
await defiler(1400);
await page.screenshot({ path: `${SORTIE}/1b-deduites.png` });
await defiler(0);

// Le formulaire de création — avec ou sans affaire.
await page.getByRole("button", { name: /Nouvelle t\u00e2che/ }).first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${SORTIE}/2-creation.png` });
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// Tout le monde : la colonne « Assignée à » doit apparaître.
await page.getByLabel("Filtrer par personne").selectOption("tous");
await page.waitForTimeout(500);
await page.screenshot({ path: `${SORTIE}/2b-tous.png` });
await page.getByLabel("Filtrer par personne").selectOption("moi");
await page.waitForTimeout(400);

// Les terminées : le clic qui répond à « qu'ai-je fait ».
await page.getByRole("button", { name: /Termin\u00e9e/ }).first().click();
await page.waitForTimeout(500);
await page.getByLabel("Trier").selectOption("recente");
await page.waitForTimeout(400);
await page.screenshot({ path: `${SORTIE}/3-terminees.png` });

// Le lien depuis le bloc du tableau de bord.
await page.goto(`${BASE}/affaires`, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${SORTIE}/3-bloc-affaires.png` });

await page.setViewportSize({ width: 390, height: 900 });
await page.goto(`${BASE}/mes-taches`, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(900);
await page.screenshot({ path: `${SORTIE}/4-telephone.png` });
// La table doit basculer en cartes sous 640 px.
await page.evaluate(() => {
  let best: Element | null = null; let max = 0;
  for (const e of [document.scrollingElement, ...document.querySelectorAll("*")]) {
    if (!e) continue;
    const d = e.scrollHeight - e.clientHeight;
    if (d > max) { max = d; best = e; }
  }
  (best ?? document.scrollingElement)!.scrollTop = 1000;
});
await page.waitForTimeout(400);
await page.screenshot({ path: `${SORTIE}/5-telephone-cartes.png` });
const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
console.log(deborde ? "  KO  débordement en largeur au téléphone" : "  ok  pas de débordement");

const textes = await page.evaluate(() =>
  ([...document.querySelectorAll("main p, main h1, main th, .chiffre, .stamp")] as HTMLElement[])
    .map((e) => e.innerText.replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 1 && t.length < 300));
console.log("\n--- textes rendus ---");
for (const t of [...new Set(textes)]) console.log("  " + t);
console.log(soucis.length ? `\n⚠ ${soucis.slice(0, 4).join(" · ")}` : "\nAucune erreur console.");
console.log(`Captures : ${SORTIE}`);
await nav.close();
