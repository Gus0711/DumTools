// Écrit un squelette GFX à partir d'un plan d'affectation.
//
// Le .gfx est un ZIP de XML. Main.xml est un graphe d'objets .NET « à plat » :
// chaque ressource / forme est un enfant direct de <Root>, déclarée dans les
// <Items> d'une collection (UsedResources pour les ressources, Shps d'un
// document pour les formes) et rattachée par des entrées REL du ResourceManager.
// On part d'un gabarit vide (public/gfx-templates/<ref>.gfx) et on AJOUTE, sans
// jamais supprimer :
//   - une ressource E/S par point (entrée RTD/TOR, sortie analogique/TOR)
//   - un historique (TrendLog) par point : analogique = Polled/20000, TOR = COV/1000
//   - une forme posée sur une page « Input » / « Output » pour la visualisation
// Les prototypes (prototypes.generated.ts) sont déjà remappés sur la table
// d'espaces de noms de chaque modèle.

import JSZip from "jszip";
import { PROTOS, SKELETON_META, type ModelProtos, type Proto } from "./prototypes.generated";
import type { AssignmentPlan, AssignedPoint } from "./assign";

// Types d'objet BACnet.
const OBJ_TYPE = { AI: 0, AO: 1, DI: 3, DO: 4 } as const;

// Disposition des formes sur la page (px). Colonnes de 14 lignes.
const ROWS_PER_COL = 14;
const ROW_H = 72;
const SHAPE_W = 144;
const SHAPE_H = 48;
const COL_W = 240;

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

class IdPool {
  private next: number;
  constructor(start: number) {
    this.next = start + 1;
  }
  take(): number {
    return this.next++;
  }
}

/** Clone un prototype : alloue idCount ids frais, substitue les tokens.
 *  Retourne l'id primaire (__ID0__) et le XML. */
function clone(proto: Proto, pool: IdPool, subs: Record<string, string>): { id: number; xml: string } {
  let xml = proto.xml;
  const ids: number[] = [];
  for (let i = 0; i < proto.idCount; i++) ids.push(pool.take());
  for (let i = 0; i < proto.idCount; i++) xml = xml.replace(new RegExp(`__ID${i}__`, "g"), String(ids[i]));
  for (const [tok, val] of Object.entries(subs)) xml = xml.replace(new RegExp(tok, "g"), val);
  return { id: ids[0], xml };
}

/** Rend chaque nom unique (BACnet impose l'unicité) : suffixe « (2) », « (3) »… */
function dedupeNames(points: AssignedPoint[]): void {
  const seen = new Map<string, number>();
  for (const p of points) {
    const base = p.name;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    if (n > 0) p.name = `${base} (${n + 1})`;
  }
}

/** Entrée REL « appartenance » : {ownerType}:{ownerIdx}/{childType}:{childIdx}/1 */
function rel(p: ModelProtos, ownerTag: string, ownerIdx: number, childTag: string, childIdx: number): string {
  return `${p.nsmod}.${ownerTag}, ${p.asm}:${ownerIdx}/${p.nsmod}.${childTag}, ${p.asm}:${childIdx}/1`;
}

function internalPoint(a: AssignedPoint): string {
  const inp = a.direction === "input";
  const typeId = inp ? (a.analog ? "100" : "103") : a.analog ? "101" : "104";
  const type = inp ? "HardwareInput" : "HardwareOutput";
  const acc = inp ? `<BacProp cmd="f" />` : `<BacProp cmd="t" /><WriteAccess ovr="t" />`;
  const fmt = inp && a.analog ? `\n      <Format typeId="6" type="Numeric"><Value unit="62" /></Format>` : "";
  return (
    `    <Point typeId="${typeId}" type="${type}">\n` +
    `      <Name>${xmlEscape(a.name)}</Name>\n` +
    `      <Index>${a.idx + 1}</Index>\n` +
    `      ${acc}${fmt}\n` +
    `    </Point>`
  );
}

export interface TransformResult {
  main: string;
  internalPoints: string;
}

/** Infos de pré-remplissage de la page d'accueil (cartouche). */
export interface HomeInfo {
  /** Date (ISO YYYY-MM-DD) de mise en service. */
  date?: string;
  chantier?: string;
  client?: string;
}

function frDate(iso?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return m ? `${m[3]} / ${m[2]} / ${m[1]}` : "XX / XX / XXXX";
}

export function transformMain(
  mainXml: string,
  plan: AssignmentPlan,
  projectName: string,
  home: HomeInfo = {},
): TransformResult {
  const ref = plan.controller.ref;
  const meta = SKELETON_META[ref];
  const p = PROTOS[ref];
  if (!meta || !p) throw new Error(`Gabarit GFX introuvable pour ${ref}.`);

  const inTag = `${p.prefix}HardwareInputResource`;
  const outTag = `${p.prefix}HardwareOutputResource`;
  const moduleTag = `${p.prefix}IOModuleResource`;
  const trendTag = `${p.prefix}TrendLogResource`;

  // Noms uniques sur l'ensemble des E/S.
  dedupeNames([...plan.inputs, ...plan.outputs]);

  let main = mainXml;
  let maxId = meta.maxId;
  for (const m of main.matchAll(/\bid="(\d+)"/g)) maxId = Math.max(maxId, Number(m[1]));
  const pool = new IdPool(maxId);

  const rootBlocks: string[] = []; // nouveaux enfants de <Root>
  const usedIds: number[] = []; // ids à déclarer dans UsedResources
  const relLines: string[] = [];

  // 1. Modules d'extension (S1000E) : cloner le module existant du gabarit.
  if (plan.modules > 1) {
    const modMatch = main.match(new RegExp(`<${moduleTag}\\b[\\s\\S]*?</${moduleTag}>`));
    if (modMatch) {
      for (let m = 1; m < plan.modules; m++) {
        const id = pool.take();
        let xml = modMatch[0]
          .replace(/\bid="\d+"/, `id="${id}"`)
          .replace(/<IDX>\d+<\/IDX>/, `<IDX>${m}</IDX>`)
          .replace(/<ModuleId>\d+<\/ModuleId>/, `<ModuleId>${meta.moduleId}</ModuleId>`);
        xml = /<NAME>[\s\S]*?<\/NAME>/.test(xml)
          ? xml.replace(/<NAME>[\s\S]*?<\/NAME>/, `<NAME>IO Module${m + 1}</NAME>`)
          : xml.replace(/(<AC>[^<]*<\/AC>)/, `$1<NAME>IO Module${m + 1}</NAME>`);
        rootBlocks.push(xml);
        usedIds.push(id);
      }
    }
  }

  // 2. Formes : deux pages « Input » et « Output » (documents de dessin clonés).
  const inputDoc = clone(p.docTemplate, pool, { __NAME__: "Input" });
  const outputDoc = clone(p.docTemplate, pool, { __NAME__: "Output" });
  const inShapeIds: number[] = [];
  const outShapeIds: number[] = [];

  // Ressource + historique + forme, pour chaque point.
  const emit = (
    a: AssignedPoint,
    resProto: Proto,
    resTag: string,
    shapeProto: Proto,
    docId: number,
    shapeIds: number[],
    objType: number,
  ) => {
    // Ressource E/S
    const res = clone(resProto, pool, { __IDX__: String(a.idx), __NAME__: xmlEscape(a.name) });
    rootBlocks.push(res.xml);
    usedIds.push(res.id);
    relLines.push(rel(p, moduleTag, a.module, resTag, a.idx));

    // Historique
    const trendIdx = (a.direction === "input" ? 100000 : 200000) + a.idx;
    const trend = clone(p.trend, pool, {
      __TLIDX__: String(trendIdx),
      __NAME__: xmlEscape(a.name),
      __OBJTYPE__: String(objType),
      __OBJINST__: String(a.idx + 1),
      __LOGTYPE__: a.analog ? "0" : "1", // 0 = Polled, 1 = COV
      __BUFSIZE__: a.analog ? "20000" : "1000",
    });
    rootBlocks.push(trend.xml);
    usedIds.push(trend.id);
    relLines.push(rel(p, resTag, a.idx, trendTag, trendIdx));

    // Forme posée sur la page (empilement vertical, colonnes de 14).
    const seq = shapeIds.length;
    const col = Math.floor(seq / ROWS_PER_COL);
    const r = seq % ROWS_PER_COL;
    const x = 50 + col * COL_W;
    const y = 84 + r * ROW_H;
    const shape = clone(shapeProto, pool, {
      __NAME__: xmlEscape(a.name),
      __DOC__: String(docId),
      __BDS__: `${x},${y},${x + SHAPE_W},${y + SHAPE_H}`,
      __PIDX__: `${a.idx}|${a.module + 1}|${a.idx}`,
    });
    rootBlocks.push(shape.xml);
    shapeIds.push(shape.id);
  };

  for (const a of plan.inputs) {
    emit(a, a.analog ? p.inputAnalog : p.inputDigital, inTag, p.inputShape, inputDoc.id, inShapeIds,
      a.analog ? OBJ_TYPE.AI : OBJ_TYPE.DI);
  }
  for (const a of plan.outputs) {
    emit(a, a.analog ? p.outputAnalog : p.outputDigital, outTag, p.outputShape, outputDoc.id, outShapeIds,
      a.analog ? OBJ_TYPE.AO : OBJ_TYPE.DO);
  }

  // Renseigner les Shps des deux documents, puis les insérer.
  const fillShps = (docXml: string, ids: number[]): string =>
    docXml.replace(/(<Shps\b[^>]*>)([\s\S]*?)(<AN>)/, (_m, open, _body, an) => {
      const ns = (open.match(/\bns="(\d+)"/) || [])[1] ?? "12";
      const items = `\n      <Items t="Array" ns="${ns}" et="Shape" dim="${ids.length}">${ids.join(",")}</Items>\n      `;
      return `${open}\n      <Cnt>${ids.length}</Cnt>${ids.length ? items : "\n      "}${an}`;
    });
  rootBlocks.push(fillShps(inputDoc.xml, inShapeIds));
  rootBlocks.push(fillShps(outputDoc.xml, outShapeIds));

  // 3. Insérer les nouveaux enfants avant </Root>.
  main = main.replace(/<\/Root>\s*$/, `${rootBlocks.join("\n")}\n</Root>`);

  // 4. Déclarer les documents dans Project/Docs (mêmes règles que UsedResources).
  const newDocIds = [inputDoc.id, outputDoc.id];
  main = main.replace(/<Docs\b[\s\S]*?<\/Docs>/, (block) => {
    const withItems = block.replace(/(<Items\b[^>]*?)(\sdim=")(\d+)(")([^>]*>)([^<]*)(<\/Items>)/,
      (_m, preA, dpre, _dim, dpost, postA, cur, close) => {
        const merged = (cur ? cur.split(",").filter(Boolean) : []).concat(newDocIds.map(String));
        return `${preA}${dpre}${merged.length}${dpost}${postA}${merged.join(",")}${close}`;
      });
    return withItems.replace(/<Cnt>\d+<\/Cnt>/, (m) => `<Cnt>${Number(m.match(/\d+/)![0]) + newDocIds.length}</Cnt>`);
  });

  // 5. Déclarer les ressources/historiques dans UsedResources.
  main = main.replace(/<UsedResources\b[\s\S]*?<\/UsedResources>/, (block) => {
    const withItems = block.replace(/(<Items\b[^>]*?)(\sdim=")(\d+)(")([^>]*>)([^<]*)(<\/Items>)/,
      (_m, preA, dpre, _dim, dpost, postA, cur, close) => {
        const merged = (cur ? cur.split(",").filter(Boolean) : []).concat(usedIds.map(String));
        return `${preA}${dpre}${merged.length}${dpost}${postA}${merged.join(",")}${close}`;
      });
    return withItems.replace(/<Cnt>\d+<\/Cnt>/, (m) => `<Cnt>${Number(m.match(/\d+/)![0]) + usedIds.length}</Cnt>`);
  });

  // 6. Entrées REL + REL_COUNT.
  const relBlock = relLines.map((l, i) => `    <REL${i}>${l}</REL${i}>`).join("\n");
  main = main.replace(/<REL_COUNT>\d+<\/REL_COUNT>/,
    `<REL_COUNT>${relLines.length}</REL_COUNT>${relLines.length ? "\n" + relBlock : ""}`);

  // 7. Nom du projet + pré-remplissage de la cartouche (page d'accueil).
  main = main.replace(/(<Props\b[\s\S]*?<Name>)[\s\S]*?(<\/Name>)/, `$1${xmlEscape(projectName)}$2`);
  const chantierLine = [home.chantier, home.client].filter(Boolean).join(" — ");
  main = main.replace(/__MES_DATE__/g, xmlEscape(frDate(home.date)));
  main = main.replace(/__CHANTIER__/g, xmlEscape(chantierLine));

  // 8. Manifest InternalPoints.xml.
  const pts = [...plan.inputs, ...plan.outputs].map(internalPoint).join("\n");
  const internalPoints =
    `<?xml version="1.0" encoding="UTF-8"?>\n<Configuration version="3.0">\n` +
    `  <Points measurement="SI">\n${pts}\n  </Points>\n  <Enumerations />\n</Configuration>`;

  return { main, internalPoints };
}

export interface GfxResult {
  blob: Blob;
  filename: string;
}

export async function buildGfx(plan: AssignmentPlan, projectName: string, home: HomeInfo = {}): Promise<GfxResult> {
  const ref = plan.controller.ref;
  const res = await fetch(`/gfx-templates/${ref}.gfx`);
  if (!res.ok) throw new Error(`Impossible de charger le gabarit ${ref}.gfx (${res.status}).`);
  const zip = await JSZip.loadAsync(await res.arrayBuffer());

  const entryFor = (base: string) =>
    Object.keys(zip.files).find((n) => n.replace(/\\/g, "/").split("/").pop()?.toLowerCase() === base);
  const mainEntry = entryFor("main.xml");
  if (!mainEntry) throw new Error("Main.xml absent du gabarit.");

  const mainXml = await zip.files[mainEntry].async("string");
  const { main, internalPoints } = transformMain(mainXml, plan, projectName, home);

  zip.file(mainEntry, main);
  const ipEntry = entryFor("internalpoints.xml");
  if (ipEntry) zip.file(ipEntry, internalPoints);

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const filename = `${projectName.replace(/[^\w\-]+/g, "_").replace(/^_+|_+$/g, "") || ref}.gfx`;
  return { blob, filename };
}
