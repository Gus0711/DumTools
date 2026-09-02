/* REGARDER la fiche Affaire — capture bureau + téléphone.
 *   AFFAIRE=<id> BASE=http://localhost:3000 npx tsx scripts/affaire-regard.mts
 * ⚠️ La coquille défile EN INTERNE (h-screen overflow-hidden) : `fullPage` ne
 * capture que le viewport, il faut faire défiler le bon conteneur. */
import { readFileSync } from "node:fs";
import { readdir, access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { encode } from "@auth/core/jwt";
import pg from "pg";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SORTIE = process.env.SORTIE ?? "/tmp/affaire-regard";
for (const l of readFileSync(".env", "utf8").split("\n")) {
  const m = /^([A-Z_]+)=(.*)$/.exec(l.trim());
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const u = (await db.query(`SELECT id, role, email FROM "User" WHERE actif=true AND role='ADMIN' LIMIT 1`)).rows[0];
const affaire = process.env.AFFAIRE
  ?? (await db.query(`SELECT id FROM "Chantier" WHERE "numeroWhy"='26DM0372/T'`)).rows[0]?.id;
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

console.log(`→ ${BASE}/affaires/${affaire}`);
await page.goto(`${BASE}/affaires/${affaire}`, { waitUntil: "networkidle", timeout: 180000 });
await page.waitForTimeout(1200);
// Le bloc Tâches est un <details> replié : sans ce clic le kanban n'est pas monté.
const pli = page.locator("details summary").filter({ hasText: "Tâches" }).first();
if (await pli.count()) { await pli.click(); await page.waitForTimeout(500); }
for (const [i, y] of [0, 700, 1400, 2100].entries()) {
  await defiler(y);
  await page.screenshot({ path: `${SORTIE}/bureau-${i + 1}.png` });
}
await page.setViewportSize({ width: 390, height: 900 });
await page.waitForTimeout(600);
for (const [i, y] of [700, 1400, 2100].entries()) {
  await defiler(y);
  await page.screenshot({ path: `${SORTIE}/tel-${i + 1}.png` });
}
const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
console.log(deborde ? "  KO  débordement en largeur au téléphone" : "  ok  pas de débordement");
console.log(soucis.length ? `⚠ ${soucis.slice(0, 3).join(" · ")}` : "Aucune erreur console.");
console.log(`Captures : ${SORTIE}`);
await nav.close();
