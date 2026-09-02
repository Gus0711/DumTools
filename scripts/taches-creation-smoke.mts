/* Une tâche créée s'assigne à son AUTEUR — vérif NAVIGATEUR, affaire jetable.
 *
 *   BASE=http://localhost:3001 npx tsx scripts/taches-creation-smoke.mts
 *
 * Ce qu'on protège : « Mes tâches » (tableau de bord) et la pastille du rail ne
 * lisent que `assigneId`. Une tâche créée sans assigné n'existe que sur le
 * kanban de son affaire — donc perdue pour celui qui l'a écrite.
 *
 * NON DESTRUCTIF : tout vit sous des ids préfixés, supprimés en fin (finally).
 */
import { readFileSync } from "node:fs";
import { readdir, access } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { encode } from "@auth/core/jwt";
import pg from "pg";

const BASE = process.env.BASE ?? "http://localhost:3001";
for (const l of readFileSync(".env", "utf8").split("\n")) {
  const m = /^([A-Z_]+)=(.*)$/.exec(l.trim());
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const u = (await db.query(`SELECT id, nom, role, email FROM "User" WHERE actif=true LIMIT 1`)).rows[0];

let ko = 0;
const v = (nom: string, ok: boolean, d = "") => {
  console.log(`${ok ? "  ok  " : "  KO  "} ${nom}${d ? " — " + d : ""}`);
  if (!ok) ko += 1;
};
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

const TITRE = `ZZ tâche ${Date.now()}`;
try {
  await db.query(`INSERT INTO "Client" (id,nom,"createdAt","updatedAt") VALUES ('zz-cli-t','ZZ Vérif tâches',now(),now()) ON CONFLICT (id) DO NOTHING`);
  await db.query(`INSERT INTO "Chantier" (id,nom,"clientId",etat,"createdAt","updatedAt") VALUES ('zz-aff-t','ZZ Vérif tâches','zz-cli-t','EN_COURS',now(),now()) ON CONFLICT (id) DO NOTHING`);

  const jeton = await encode({
    token: { sub: u.id, uid: u.id, role: u.role, email: u.email },
    secret: process.env.AUTH_SECRET!, salt: "authjs.session-token", maxAge: 3600,
  });
  const nav = await chromium.launch({ executablePath: await chrome() });
  const ctx = await nav.newContext({ viewport: { width: 1500, height: 1000 } });
  await ctx.addCookies([{ name: "authjs.session-token", value: jeton, domain: "localhost", path: "/", httpOnly: true }]);
  const page = await ctx.newPage();
  const soucis: string[] = [];
  page.on("pageerror", (e) => soucis.push(e.message));

  const avant = Number((await db.query(
    `SELECT count(*) FROM "TacheAffaire" t JOIN "Chantier" c ON c.id=t."chantierId"
      WHERE t."assigneId"=$1 AND t.etat <> 'TERMINEE' AND c.etat <> 'CORBEILLE'`, [u.id])).rows[0].count);

  // Retarde la seule écriture qui nous intéresse (l'action est un POST sur la
  // page elle-même) : le temps de vérifier ce que l'écran peint tout seul.
  await page.route(`**/affaires/zz-aff-t`, async (route) => {
    if (route.request().method() === "POST") await new Promise((r) => setTimeout(r, 3000));
    await route.continue();
  });
  await page.goto(`${BASE}/affaires/zz-aff-t`, { waitUntil: "networkidle", timeout: 180000 });
  // Le bloc Tâches est REPLIÉ par défaut sur la fiche affaire (<details>) : son
  // contenu est bien dans le DOM mais masqué, donc non cliquable. Le pli
  // s'ouvre par le <summary>, qui n'est ni un bouton ni un rôle interrogeable.
  await page.locator("details summary").filter({ hasText: "Tâches" }).first().click();
  await page.getByRole("button", { name: /Ajouter une tâche/ }).first().click();
  const champ = page.getByPlaceholder("Titre, puis Entrée…").first();
  await champ.fill(TITRE);
  await champ.press("Enter");

  // 1. L'assignation doit se PEINDRE sans attendre le serveur.
  //    On RETARDE la réponse de l'action pour que le contrôle prouve ce qu'il
  //    annonce : sans ça, un serveur rapide répondrait avant qu'on regarde et
  //    le test passerait même sans peinture optimiste.
  //    La carte garde un id « tmp-… » tant que la réponse n'est pas arrivée :
  //    c'est le repère qui distingue les deux moments, sans ambiguïté.
  const carteTemp = page.locator('[data-tache^="tmp-"]');
  const vuTout_de_suite = await carteTemp
    .getByText(u.nom, { exact: false })
    .first()
    .isVisible({ timeout: 2000 })
    .catch(() => false);
  v("l'auteur s'affiche AVANT la réponse du serveur", vuTout_de_suite, u.nom);

  // 2. La base porte bien l'assignation.
  let ligne: { assigneId: string | null } | undefined;
  for (let i = 0; i < 30 && !ligne; i++) {
    ligne = (await db.query(`SELECT "assigneId" FROM "TacheAffaire" WHERE titre=$1`, [TITRE])).rows[0];
    if (!ligne) await new Promise((r) => setTimeout(r, 400));
  }
  v("la tâche est enregistrée", !!ligne);
  v("elle est assignée à son auteur", ligne?.assigneId === u.id, `${ligne?.assigneId} vs ${u.id}`);

  // 3. Elle remonte là où on va voir ce qu'on a à faire.
  const apres = Number((await db.query(
    `SELECT count(*) FROM "TacheAffaire" t JOIN "Chantier" c ON c.id=t."chantierId"
      WHERE t."assigneId"=$1 AND t.etat <> 'TERMINEE' AND c.etat <> 'CORBEILLE'`, [u.id])).rows[0].count);
  v("elle compte dans « Mes tâches » / la pastille du rail", apres === avant + 1, `${avant} → ${apres}`);

  await page.goto(`${BASE}/affaires`, { waitUntil: "networkidle", timeout: 120000 });
  const dansLeTableauDeBord = await page.getByText(TITRE, { exact: false }).first()
    .isVisible({ timeout: 8000 }).catch(() => false);
  v("elle est listée sur /affaires", dansLeTableauDeBord);

  v("aucune erreur de page", soucis.length === 0, soucis.slice(0, 2).join(" · "));
  await nav.close();
} finally {
  await db.query(`DELETE FROM "TacheAffaire" WHERE titre=$1`, [TITRE]);
  await db.query(`DELETE FROM "Chantier" WHERE id='zz-aff-t'`);
  await db.query(`DELETE FROM "Client" WHERE id='zz-cli-t'`);
  await db.end();
}
console.log(ko === 0 ? "\n✔ tout est vert" : `\n✘ ${ko} contrôle(s) en échec`);
process.exit(ko === 0 ? 0 : 1);
