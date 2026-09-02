/* REGARDER l'écran « Besoin consolidé » — captures sur next dev (:3001).
 *   npx tsx scripts/besoins-regard.mts
 * Le rendu de dev est incomplet pour quelques classes de globals.css
 * (voir la note de projet) : on juge la MISE EN PAGE, pas les teintes. */
import { readFileSync } from "node:fs";
import { readdir, access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { encode } from "@auth/core/jwt";
import pg from "pg";

const BASE = process.env.BASE ?? "http://localhost:3001";
const SORTIE = process.env.SORTIE ?? "/tmp/besoins-regard";
for (const l of readFileSync(".env", "utf8").split("\n")) {
  const m = /^([A-Z_]+)=(.*)$/.exec(l.trim());
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const u = (await db.query(`SELECT id, role, email FROM "User" WHERE actif=true AND role='ADMIN' LIMIT 1`)).rows[0];
const useda = (await db.query(`SELECT id FROM "Client" WHERE nom='USEDA'`)).rows[0];
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
const ctx = await nav.newContext({ viewport: { width: 1600, height: 1200 } });
await ctx.addCookies([{ name: "authjs.session-token", value: jeton, domain: "localhost", path: "/", httpOnly: true }]);
const page = await ctx.newPage();
const soucis: string[] = [];
page.on("pageerror", (e) => soucis.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") soucis.push(`console: ${m.text()}`); });


/** La coquille défile en INTERNE : `fullPage` ne capturerait que le viewport.
 *  On repère le conteneur qui défile vraiment et on avance dedans. */
async function defiler(y: number) {
  await page.evaluate((cible) => {
    const tous = [document.scrollingElement, ...document.querySelectorAll("*")];
    let best: Element | null = null;
    let max = 0;
    for (const e of tous) {
      if (!e) continue;
      const d = e.scrollHeight - e.clientHeight;
      if (d > max) { max = d; best = e; }
    }
    (best ?? document.scrollingElement)!.scrollTop = cible;
  }, y);
  await page.waitForTimeout(350);
}

const url = `${BASE}/outils/magasin/besoins?client=${useda.id}&etats=COMMANDE`;
console.log(`→ ${url}`);
const t0 = Date.now();
await page.goto(url, { waitUntil: "networkidle", timeout: 180000 });
console.log(`chargé en ${Date.now() - t0} ms`);
await page.waitForSelector("table.data-table, .bloc", { timeout: 30000 });
await page.waitForTimeout(1200);

await page.screenshot({ path: `${SORTIE}/1-bureau.png`, fullPage: true });

// Le panneau des affaires déplié — c'est là qu'on décoche.
await page.getByRole("button", { name: /affaires? retenues?/ }).first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${SORTIE}/2-affaires.png`, fullPage: true });

// Le détail par affaire sur une ligne.
const detail = page.locator('button[aria-expanded]').filter({ hasText: /affaires?$/ });
if (await detail.count()) { await detail.first().click(); await page.waitForTimeout(400); }
await page.screenshot({ path: `${SORTIE}/3-detail.png`, fullPage: true });
for (const [i, y] of [800, 1600, 2400].entries()) {
  await defiler(y);
  await page.screenshot({ path: `${SORTIE}/3-bureau-bas-${i + 1}.png` });
}
await defiler(0);

// Téléphone — la table doit basculer en cartes (.table-cards) sous 640 px.
await page.setViewportSize({ width: 390, height: 900 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${SORTIE}/4-telephone.png`, fullPage: true });
for (const [i, y] of [900, 1800, 2700].entries()) {
  await defiler(y);
  await page.screenshot({ path: `${SORTIE}/5-telephone-${i + 1}.png` });
}

// Débordement horizontal : le corps de page ne doit JAMAIS défiler en largeur.
const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
console.log(deborde ? "  KO  la page déborde en largeur au téléphone" : "  ok  pas de débordement au téléphone");

// Les mots collés ne se voient qu'à l'œil : on relit le texte rendu.
await defiler(0);
const texte = await page.evaluate(() =>
  ([...document.querySelectorAll("main p, main h1, main li, main th, .chiffre")] as HTMLElement[])
    .map((e) => e.innerText.replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 2 && t.length < 400),
);
console.log("\n--- textes rendus ---");
for (const t of [...new Set(texte)]) console.log("  " + t);

console.log(soucis.length ? `\n⚠ ${soucis.length} souci(s) console :\n` + soucis.slice(0, 8).join("\n") : "\nAucune erreur console.");
console.log(`\nCaptures : ${SORTIE}`);
await nav.close();
