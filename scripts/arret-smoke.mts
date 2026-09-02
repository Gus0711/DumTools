/* Vérif NAVIGATEUR du marqueur d'arrêt, sur la PROD (:3000), affaire jetable. */
import { readFileSync } from "node:fs";
import { readdir, access } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { encode } from "@auth/core/jwt";
import pg from "pg";
const BASE = "http://localhost:3000";
for (const l of readFileSync(".env","utf8").split("\n")) { const m=/^([A-Z_]+)=(.*)$/.exec(l.trim()); if(m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g,""); }
const db = new pg.Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
const u = (await db.query(`SELECT id, role, email FROM "User" WHERE actif=true LIMIT 1`)).rows[0];
await db.query(`INSERT INTO "Client" (id,nom,"createdAt","updatedAt") VALUES ('zz-cli-v','ZZ Vérif arrêt',now(),now()) ON CONFLICT (id) DO NOTHING`);
await db.query(`INSERT INTO "Chantier" (id,nom,"clientId",etat,"createdAt","updatedAt") VALUES ('zz-aff-v','ZZ Vérif affaire','zz-cli-v','EN_COURS',now(),now()) ON CONFLICT (id) DO UPDATE SET "bomArreteeLe"=NULL,"bomToucheeLe"=NULL`);
await db.query(`INSERT INTO "AffectationProjet" (id,nom,"clientNom","chantierId",data,"createdAt","updatedAt") VALUES ('zz-prj-v','ZZ Vérif automate','ZZ Vérif arrêt','zz-aff-v','{"controller":"ECY-300","rows":[],"points":[]}',now(),now()) ON CONFLICT (id) DO UPDATE SET "arreteLe"=NULL,"arreteParId"=NULL,"updatedAt"=now()`);
const jeton = await encode({ token:{sub:u.id,uid:u.id,role:u.role,email:u.email}, secret:process.env.AUTH_SECRET!, salt:"authjs.session-token", maxAge:3600 });
async function chrome(){ const r=join(process.env.HOME!,".cache","ms-playwright");
  for(const d of (await readdir(r)).filter(e=>e.startsWith("chromium"))) for(const s of await readdir(join(r,d)))
    for(const n of ["chrome-headless-shell","headless_shell","chrome"]){const p=join(r,d,s,n); try{await access(p); return p;}catch{}}
  throw new Error("pas de chromium"); }
let ko=0; const v=(n:string,ok:boolean,d="")=>{console.log(`${ok?"  ok  ":"  KO  "} ${n}${d?" — "+d:""}`); if(!ok)ko++;};
const nav = await chromium.launch({ executablePath: await chrome() });
try {
  const ctx = await nav.newContext();
  await ctx.addCookies([{name:"authjs.session-token",value:jeton,domain:"localhost",path:"/",httpOnly:true}]);
  const page = await ctx.newPage(); const soucis:string[]=[];
  page.on("pageerror", e=>soucis.push(e.message));
  const FICHE = `${BASE}/affaires/zz-aff-v`;
  const sel = 'td[data-label="Arrêt"] button';
  const lire = async () => (await page.locator(sel).first().textContent())?.trim() ?? "";
  const attendre = (txt:string) => page.waitForFunction(
    (a) => document.querySelector(a[0])?.textContent?.trim() === a[1],
    [sel, txt] as const, { timeout: 20000 });
  const etude = async () => (await page.locator('li.syn-etape',{hasText:"Étude"}).first().textContent())?.replace(/\s+/g," ").trim() ?? "";
  /** Relit vraiment le DOM toutes les 400 ms — le `refresh` met une seconde ou
   *  deux à atterrir, et la frise ne bouge qu'à ce moment-là. */
  const attendreFrise = async (bout: string, ms = 20000) => {
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
      if ((await etude()).includes(bout)) return true;
      await page.waitForTimeout(400);
    }
    return false;
  };

  await page.goto(FICHE, { waitUntil:"networkidle" });
  v("1. au départ : en cours", (await lire())==="En cours", await lire());

  await page.locator(sel).first().click();
  await attendre("Arrêté");
  v("2. un clic : l'ÉCRAN passe à « Arrêté »", true);
  // Le badge se peint sans attendre ; la frise, elle, attend le `router.refresh()`.
  // On lui laisse le temps d'atterrir — c'est ce délai-là qu'on vérifie.
  v("   la frise suit (jalon Étude)", await attendreFrise("1/1 arrêté"), await etude());
  const r1 = (await db.query(`SELECT "arreteLe","updatedAt","arreteParId" FROM "AffectationProjet" WHERE id='zz-prj-v'`)).rows[0];
  v("   la base aussi", r1.arreteLe !== null);
  v("   updatedAt non bousculé", new Date(r1.arreteLe) > new Date(r1.updatedAt));
  v("   l'auteur est enregistré", r1.arreteParId === u.id);

  await db.query(`UPDATE "AffectationProjet" SET "updatedAt"=now() WHERE id='zz-prj-v'`);
  await page.goto(FICHE, { waitUntil:"networkidle" });
  v("3. contenu modifié après : « Retouché »", (await lire())==="Retouché", await lire());
  v("   la frise le dit", (await etude()).includes("retouché"), await etude());

  await page.locator(sel).first().click();
  await attendre("Arrêté");
  v("4. depuis retouché, le clic RÉ-ARRÊTE", true);

  // On attend que le serveur ait repris la main (la frise le prouve) avant de
  // recliquer : sinon on teste la fenêtre de peinture, pas le cycle.
  await attendreFrise("1/1 arrêté");
  await page.locator(sel).first().click();
  await attendre("En cours");
  v("5. depuis arrêté, le clic rouvre", true);

  await page.locator(sel).first().click();
  await attendre("Arrêté");
  await page.waitForTimeout(1500);
  const mat = page.locator('section.signal-do button').first();
  v("6. le bloc Matériel porte sa bascule", (await mat.count())===1);
  await mat.click();
  await page.waitForFunction(() => document.querySelector('section.signal-do button')?.textContent?.trim()==="Arrêté", null, {timeout:20000});
  v("   le besoin s'arrête à l'écran", true);
  v("   et en base", (await db.query(`SELECT "bomArreteeLe" FROM "Chantier" WHERE id='zz-aff-v'`)).rows[0].bomArreteeLe !== null);
  await db.query(`UPDATE "Chantier" SET "bomToucheeLe"=now() WHERE id='zz-aff-v'`);
  await page.goto(FICHE, { waitUntil:"networkidle" });
  v("   toucher au besoin le périme", (await page.locator('section.signal-do button').first().textContent())?.trim()==="Retouché");

  await page.goto(`${BASE}/affaires?q=ZZ+V%C3%A9rif&etats=EN_COURS`, { waitUntil:"networkidle" });
  const cell = (await page.locator('td[data-label="Arrêt"]').first().textContent()) ?? "";
  v("7. tableau de bord : GTB 1/1 + Matériel", cell.includes("GTB 1/1") && cell.includes("Matériel"), cell.slice(0,60));
  v("8. aucune erreur de page", soucis.length===0, soucis.slice(0,2).join(" | "));
} finally {
  await nav.close();
  await db.query(`DELETE FROM "AffectationProjet" WHERE id='zz-prj-v'`);
  await db.query(`DELETE FROM "Chantier" WHERE id='zz-aff-v'`);
  await db.query(`DELETE FROM "Client" WHERE id='zz-cli-v'`);
  console.log("Nettoyage : données de test supprimées.");
  await db.end();
}
console.log(ko===0 ? "\n✔ prod conforme\n" : `\n✘ ${ko} en échec\n`);
process.exit(ko===0?0:1);
