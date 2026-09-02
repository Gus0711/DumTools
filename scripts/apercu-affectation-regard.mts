/**
 * REGARDER le document « Aperçu » d'un projet GTB — page par page, en vrai.
 *
 *   scripts/serve-prod.sh --build          # ou le service dumtools
 *   npx tsx scripts/apercu-affectation-regard.mts [motif du nom de projet]
 *   # → /tmp/apercu-gtb/page-NN.png  + le débordement de chaque page module
 *
 * POURQUOI ce script en plus des tests : parce que le défaut qui a motivé sa
 * naissance était INVISIBLE autrement. `.module-table-area` est une boîte à
 * hauteur fixe en `overflow: hidden` ; un module 8UI/6UO issu d'un import GFX y
 * demandait 179 mm pour 153 mm disponibles, et perdait SANS UN MOT ses deux
 * dernières sorties et sa légende. Le document restait un PDF valide, avec le
 * bon nombre de pages — tous les contrôles automatiques passaient, et le
 * tableau tronqué partait sur le chantier.
 *
 * Il sert aussi de mètre : c'est lui qui a donné les valeurs de `GABARIT_MODULE`
 * (apercu.tsx), mesurées sur le rendu réel et non estimées.
 *
 * ⚠️ Deux pièges de mesure, tous deux vérifiés ici :
 *   - l'aperçu écran applique `zoom: 0.62` → `getBoundingClientRect()` rend des
 *     millimètres faux ; on lit `offsetHeight`, insensible au zoom ;
 *   - le corps passé à `page.evaluate` l'est en CHAÎNE : esbuild injecte un
 *     helper `__name` dans les fonctions nommées, absent de la page.
 *
 * La session est forgée localement (JWT Auth.js signé avec AUTH_SECRET) : le
 * document vit derrière le proxy d'authentification, et on veut le VRAI rendu de
 * l'application, pas une réplique qui divergera.
 */
import "dotenv/config";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { PrismaPg } from "@prisma/adapter-pg";
import { chromium } from "playwright-core";
import { encode } from "@auth/core/jwt";
import { PrismaClient } from "../src/generated/prisma/client";

const requireCjs = createRequire(import.meta.url);
const c = requireCjs.resolve("server-only");
requireCjs.cache[c] = { id: c, filename: c, loaded: true, exports: {} } as unknown as NodeJS.Module;
const { trouverChromium } = await import("../src/lib/pdf-navigateur");
const exe = process.env.CHROMIUM_PATH || (await trouverChromium());

const BASE = `http://127.0.0.1:${process.env.PORT || 3000}`;
const SORTIE = "/tmp/apercu-gtb";
await mkdir(SORTIE, { recursive: true });

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const user = await prisma.user.findFirst({ where: { actif: true, role: "ADMIN" } });
const motif = process.argv[2] ?? "";
const projet = await prisma.affectationProjet.findFirst({
  where: motif ? { nom: { contains: motif, mode: "insensitive" } } : {},
  select: { id: true, nom: true },
  orderBy: { updatedAt: "desc" },
});
await prisma.$disconnect();
if (!user || !projet) throw new Error("utilisateur ou projet introuvable");
console.log(`Projet : ${projet.nom}\n`);

const COOKIE = "authjs.session-token";
const jeton = await encode({
  token: { sub: user.id, uid: user.id, role: user.role, email: user.email, name: user.nom },
  secret: process.env.AUTH_SECRET!,
  salt: COOKIE,
  maxAge: 60 * 30,
});

const nav = await chromium.launch({ executablePath: exe! });
const ctx = await nav.newContext({ viewport: { width: 1600, height: 1100 } });
await ctx.addCookies([{ name: COOKIE, value: jeton, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
const page = await ctx.newPage();

await page.goto(`${BASE}/outils/affectation-es/${projet.id}`, { waitUntil: "networkidle" });
console.log("URL après navigation :", page.url());
if (page.url().includes("/login")) throw new Error("session refusée");

await page.getByRole("button", { name: "Aperçu" }).click();
await page.waitForSelector(".affectation-doc .print-page", { timeout: 15000 });
await page.waitForTimeout(1500);

for (const orientation of (process.env.ORIENTATION ? [process.env.ORIENTATION] : ["Paysage", "Portrait"]) as string[]) {
await page.getByRole("button", { name: orientation }).click();
await page.waitForTimeout(1000);
console.log(`\n═══ ${orientation} ═══`);
const suffixe = orientation === "Portrait" ? "-portrait" : "";
const pages = await page.locator(".affectation-doc .print-page").all();
console.log(`${pages.length} page(s) dans le document`);
for (let i = 0; i < pages.length; i++) {
  const titre = (await pages[i].locator(".module-title").first().textContent().catch(() => null)) ?? "";
  const classe = await pages[i].getAttribute("class");
  console.log(`  page ${i + 1} : ${classe}  ${titre.trim().slice(0, 60)}`);
  await pages[i].screenshot({ path: `${SORTIE}/page-${String(i + 1).padStart(2, "0")}${suffixe}.png` });
  const m = await pages[i].evaluate((el) => {
    const z = el.querySelector(".module-table-area") as HTMLElement | null;
    if (!z) return null;
    const bas = z.getBoundingClientRect().bottom;
    const px = 96 / 25.4;
    const coupees = Array.from(z.querySelectorAll("tbody tr")).filter((tr) => tr.getBoundingClientRect().bottom > bas + 1)
      .map((tr) => (tr.textContent || "").replace(/\s+/g, " ").trim().slice(0, 44));
    const legende = z.querySelector(".legend") as HTMLElement | null;
    return {
      dispo: z.clientHeight / px, requis: z.scrollHeight / px,
      coupees,
      legendeDehors: legende ? legende.getBoundingClientRect().top > bas : false,
      chevauche: (() => {
        const logo = el.querySelector(".logo-dumortier");
        if (!legende || !logo) return false;
        const a = legende.getBoundingClientRect(), b = logo.getBoundingClientRect();
        return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      })(),
    };
  });
  if (m) {
    console.log(`      zone ${m.dispo.toFixed(1)} mm · contenu ${m.requis.toFixed(1)} mm · débordement ${(m.requis - m.dispo).toFixed(1)} mm`);
    for (const l of m.coupees) console.log(`      ✂ ${l}`);
    if (m.legendeDehors) console.log(`      ✂ légende entièrement hors cadre`);
    if (m.chevauche) console.log(`      ⚠ la légende chevauche le logo du pied de page`);
  }
}
}
console.log(`\n→ ${SORTIE}/`);
await nav.close();
