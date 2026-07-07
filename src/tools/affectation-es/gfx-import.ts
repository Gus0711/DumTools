/* Import d'un fichier Distech .gfx (ZIP de XML).
 * Portage quasi verbatim de l'ancien outil (heuristiques fragiles conservées).
 * Typage interne volontairement souple ; interface publique typée. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import JSZip from "jszip";
import { CONTROLLER_CATALOG } from "./catalog";
import {
  controllerHasIntegratedIo,
  controllerHasIntegratedPower,
  detectModuleDefinition,
  isCommunicationType,
  isIntegratedControllerType,
  isScreenType,
  modulePointCode,
  normalizeCommunicationModuleNumbers,
  normalizeControllerReference,
  normalizePdfText,
  type Module,
  type Point,
} from "./model";

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, "")
    : Date.now().toString(36) + Math.random().toString(36).slice(2);

// --- Helpers XML (portés) ---------------------------------------------------

function normalizedLocalName(node: any): string {
  if (!node) return "";
  const raw = String(node.localName || node.nodeName || node.tagName || "");
  return raw.includes(":") ? raw.split(":").pop()!.toLowerCase() : raw.toLowerCase();
}
function directChildByName(parent: any, tagName: string): any {
  if (!parent) return null;
  const wanted = String(tagName || "").toLowerCase();
  const children = parent.children
    ? Array.from(parent.children)
    : Array.from(parent.childNodes || []).filter((n: any) => n.nodeType === 1);
  return (children as any[]).find((el) => normalizedLocalName(el) === wanted) || null;
}
function directText(parent: any, tagName: string): string {
  const child = directChildByName(parent, tagName);
  return child ? String(child.textContent || "").trim() : "";
}
function elementsByLocalNames(root: any, names: string | string[]): any[] {
  if (!root) return [];
  const wanted = new Set((Array.isArray(names) ? names : [names]).map((n) => String(n).toLowerCase()));
  return Array.from(root.getElementsByTagName("*")).filter((el: any) => wanted.has(normalizedLocalName(el)));
}
function elementsByLocalNamePattern(root: any, pattern: (name: string, el?: any) => boolean): any[] {
  if (!root) return [];
  return Array.from(root.getElementsByTagName("*")).filter((el: any) => pattern(normalizedLocalName(el), el));
}
function firstByLocalName(root: any, name: string): any {
  return elementsByLocalNames(root, name)[0] || null;
}
function finiteNumber(value: any): number | null {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) ? n : null;
}
function normalizeZipPath(value: string): string {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
}
function decodeUtf16Be(bytes: Uint8Array): string {
  const swapped = new Uint8Array(bytes.length - (bytes.length % 2));
  for (let i = 0; i < swapped.length; i += 2) {
    swapped[i] = bytes[i + 1];
    swapped[i + 1] = bytes[i];
  }
  return new TextDecoder("utf-16le").decode(swapped);
}
function decodeXmlBytes(bytes: Uint8Array): string {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    if (data.length >= 2 && data[0] === 0xff && data[1] === 0xfe) return new TextDecoder("utf-16le").decode(data.subarray(2));
    if (data.length >= 2 && data[0] === 0xfe && data[1] === 0xff) return decodeUtf16Be(data.subarray(2));
    if (data.length >= 3 && data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) return new TextDecoder("utf-8").decode(data.subarray(3));
    let evenZero = 0, oddZero = 0;
    const sample = Math.min(data.length, 400);
    for (let i = 0; i < sample; i++) if (data[i] === 0) { if (i % 2) oddZero++; else evenZero++; }
    if (oddZero > sample / 8 && oddZero > evenZero * 2) return new TextDecoder("utf-16le").decode(data);
    if (evenZero > sample / 8 && evenZero > oddZero * 2) return decodeUtf16Be(data);
    return new TextDecoder("utf-8").decode(data);
  } catch {
    let binary = "";
    for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i]);
    try { return decodeURIComponent(escape(binary)); } catch { return binary; }
  }
}
function parseXmlPortable(xmlText: string): Document {
  const parser = new DOMParser();
  let xml = parser.parseFromString(xmlText, "application/xml");
  if (elementsByLocalNames(xml, "parsererror").length) {
    xml = parser.parseFromString(xmlText, "text/xml");
    if (elementsByLocalNames(xml, "parsererror").length) throw new Error("Le contenu XML du GFX est illisible.");
  }
  return xml;
}
function inputSignalFromGfx(el: any): string {
  const interpretation = directText(el, "SignalInterpretation");
  const signalType = directText(el, "SignalType");
  if (interpretation === "3") return "D";
  if (interpretation === "5") return "T";
  if (signalType === "2") return "4-20mA";
  return "0-10V";
}
function outputSignalFromGfx(el: any): string {
  const signalType = directText(el, "SignalType");
  if (signalType === "1") return "D";
  if (signalType === "2") return "4-20mA";
  return "0-10V";
}
function formatGfxDate(value: any): string {
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw new Error();
    return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  } catch {
    return new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  }
}
function resourceIndex(el: any): number | null {
  return finiteNumber(directText(el, "IDX") || directText(el, "Index") || directText(el, "ResourceIndex"));
}

// --- Détection / inférence (portées) ---------------------------------------

function moduleNumberFromPointIndex(idx: number, moduleMap: Map<number, Module>): number {
  const raw = Math.floor(idx / 100);
  if (moduleMap.has(raw)) return raw;
  if (moduleMap.has(raw + 1)) return raw + 1;
  if (moduleMap.has(raw - 1)) return raw - 1;
  return raw;
}

function detectControllerFromGfxXml(xml: any, gfxName = ""): string {
  const candidates: string[] = [];
  elementsByLocalNames(xml, "CustomPropertyInfo").forEach((node) => {
    const propName = directText(node, "Name").toLowerCase();
    const value = directText(node, "Value");
    if (value && /(?:devicemodel|controller|model)/i.test(propName)) candidates.push(value);
  });
  ["DeviceModelName", "ControllerType", "ControllerModel", "ModelName", "DeviceType"].forEach((tag) => {
    elementsByLocalNames(xml, tag).forEach((node) => {
      const value = normalizePdfText(node.textContent || "");
      if (value) candidates.push(value);
    });
  });
  const scanText = normalizePdfText(`${gfxName} ${xml?.documentElement?.textContent || ""}`).toUpperCase().replace(/[‐‑–—_]/g, "-");
  const compact = scanText.replace(/\s+/g, "");
  const known: [string, string[]][] = [
    ["ECY-PTU-207", ["ECY-PTU-207", "ECYPTU207", "PTU207", "ECY-PTU-270", "ECYPTU270", "PTU270"]],
    ["ECY-303", ["ECY-303", "ECY303"]],
    ["ECY-300", ["ECY-300", "ECY300"]],
    ["ECY-450", ["ECY-450", "ECY450"]],
    ["ECY-400", ["ECY-400", "ECY400"]],
    ["ECY-650", ["ECY-650", "ECY650"]],
    ["ECY-600", ["ECY-600", "ECY600"]],
    ["ECY-S1000E-320", ["ECY-S1000E-320", "ECYS1000E320", "S1000E320"]],
    ["ECY-S1000E-48", ["ECY-S1000E-48", "ECYS1000E48", "S1000E48"]],
    ["ECY-S1000E-28", ["ECY-S1000E-28", "ECYS1000E28", "S1000E28"]],
  ];
  for (const value of candidates) {
    const normalized = normalizeControllerReference(value);
    if (CONTROLLER_CATALOG[normalized]) return normalized;
  }
  for (const [reference, aliases] of known) {
    if (aliases.some((alias) => compact.includes(alias.replace(/\s+/g, "").toUpperCase()))) return reference;
  }
  return "ECY-S1000E-48";
}

function directIntegratedChannelCandidate(el: any, direction: string, max: number): number | null {
  const codeTags = direction === "input"
    ? ["InputNumber", "InputIndex", "ChannelNumber", "Channel"]
    : ["OutputNumber", "OutputIndex", "ChannelNumber", "Channel"];
  for (const tag of codeTags) {
    const direct = finiteNumber(directText(el, tag));
    if (direct === null) continue;
    if (direct >= 1 && direct <= max) return direct;
    if (direct >= 0 && direct < max) return direct + 1;
  }
  return null;
}
function gfxResourceRawModule(el: any): number | null {
  const idx = resourceIndex(el);
  return idx === null ? null : Math.floor(idx / 100);
}
function gfxResourceIsExtension(el: any, extensionMap: Map<number, any>): boolean {
  const raw = gfxResourceRawModule(el);
  if (raw === null || raw === 0 || raw === 1) return false;
  if (raw === 50) return true;
  return !!(extensionMap && (extensionMap.has(raw) || extensionMap.has(raw + 1) || extensionMap.has(raw - 1)));
}
function indexedIntegratedChannelCandidate(el: any, max: number, extensionMap: Map<number, any>, controller = ""): number | null {
  const idx = resourceIndex(el);
  if (idx === null) return null;
  if (idx >= 0 && idx < max) return idx + 1;
  const rawModule = Math.floor(idx / 100);
  const modulo = (idx % 100) + 1;
  if (rawModule === 50) return null;
  if (controllerHasIntegratedIo(controller) && (rawModule === 0 || rawModule === 1)) {
    return modulo >= 1 && modulo <= max ? modulo : null;
  }
  if (gfxResourceIsExtension(el, extensionMap)) return null;
  return modulo >= 1 && modulo <= max ? modulo : null;
}
function buildIntegratedChannelAssignments(nodes: any[], direction: string, module: any, extensionMap: Map<number, any>, controller = ""): Map<any, number> {
  const max = direction === "input" ? Number(module?.inputCount || 0) : Number(module?.outputCount || 0);
  const result = new Map<any, number>();
  if (max < 1) return result;
  const records = (nodes || []).map((el, position) => ({
    el,
    position,
    name: directText(el, "NAME") || directText(el, "Name"),
    extension: gfxResourceIsExtension(el, extensionMap),
    indexed: indexedIntegratedChannelCandidate(el, max, extensionMap, controller),
    direct: directIntegratedChannelCandidate(el, direction, max),
  })).filter((record) => record.name && !record.extension);
  const distinct = (key: "indexed" | "direct") =>
    new Set(records.map((r) => r[key]).filter((c) => Number.isInteger(c) && (c as number) >= 1 && (c as number) <= max)).size;
  const indexedDistinct = distinct("indexed");
  const directDistinct = distinct("direct");
  const preferred =
    indexedDistinct >= 2 ? "indexed"
    : directDistinct >= 2 ? "direct"
    : indexedDistinct === 1 && records.length === 1 ? "indexed"
    : directDistinct === 1 && records.length === 1 ? "direct"
    : "sequential";
  const used = new Set<number>();
  let nextFree = 1;
  const takeNextFree = () => {
    while (nextFree <= max && used.has(nextFree)) nextFree++;
    return nextFree <= max ? nextFree : null;
  };
  records.forEach((record) => {
    let channel: number | null = preferred === "sequential" ? null : (record as any)[preferred];
    if (!Number.isInteger(channel) || channel! < 1 || channel! > max || used.has(channel!)) {
      const alternate = preferred === "indexed" ? record.direct : record.indexed;
      channel = Number.isInteger(alternate) && alternate! >= 1 && alternate! <= max && !used.has(alternate!) ? alternate! : null;
    }
    if (channel === null) channel = takeNextFree();
    if (channel === null) return;
    used.add(channel);
    result.set(record.el, channel);
  });
  return result;
}

function normalizeGfxIntegratedArchitecture(controller: string, modules: Module[]): Module[] {
  const ref = normalizeControllerReference(controller);
  const list = (modules || [])
    .filter((module) => !isScreenType(module))
    .map((module) => ({ ...module, gfxNumber: Number(module.gfxNumber ?? module.number) }));
  if (!controllerHasIntegratedIo(ref)) return list;
  const builtIn = list.find(
    (module) => !isCommunicationType(module) && !isIntegratedControllerType(module) && Number(module.gfxNumber) === 1,
  );
  const remaining = list.filter((module) => module !== builtIn);
  if (ref === "ECY-600" || ref === "ECY-650") {
    return remaining.map((module) => {
      if (isCommunicationType(module) || isIntegratedControllerType(module)) return module;
      const gfxNumber = Number(module.gfxNumber);
      return { ...module, number: gfxNumber > 1 ? gfxNumber - 1 : gfxNumber };
    });
  }
  return remaining.filter((module) => isCommunicationType(module) || isIntegratedControllerType(module));
}

function inferModulesFromPointResources(inputNodes: any[], outputNodes: any[]): Module[] {
  const info = new Map<number, any>();
  const add = (el: any, direction: string) => {
    const idx = resourceIndex(el);
    if (idx === null) return;
    const number = Math.floor(idx / 100);
    if (number < 1) return;
    const channel = (idx % 100) + 1;
    if (!info.has(number)) info.set(number, { number, inputMax: 0, outputMax: 0, outputDigital: true });
    const item = info.get(number);
    if (direction === "input") item.inputMax = Math.max(item.inputMax, channel);
    else {
      item.outputMax = Math.max(item.outputMax, channel);
      if (outputSignalFromGfx(el) !== "D") item.outputDigital = false;
    }
  };
  inputNodes.forEach((el) => add(el, "input"));
  outputNodes.forEach((el) => add(el, "output"));
  return [...info.values()].map((item) => {
    let type = "8UI6UO";
    if (item.inputMax > 8) type = "16DI";
    else if (item.inputMax === 0 && item.outputMax > 0 && (item.outputMax > 6 || item.outputDigital)) type = "8DOR";
    else if (item.inputMax > 0 && item.outputMax === 0) type = "8UI";
    else if (item.inputMax <= 4 && item.outputMax <= 4 && item.inputMax > 0 && item.outputMax > 0) type = "4UI4UO";
    return detectModuleDefinition(item.number, type, "");
  }).sort((a, b) => a.number - b.number);
}

// --- Interface publique -----------------------------------------------------

export interface GfxImportResult {
  controller: string;
  modules: Module[];
  points: Point[];
  projectFields: {
    name: string;
    header: string;
    document_title: string;
    date: string;
    power_supply: string;
    gfx_header_3: string;
  };
  meta: {
    file: string;
    controller: string;
    inputs: number;
    outputs: number;
    extensions: number;
    architecture: string;
    equipment: string;
  };
}

export async function importGfx(file: File): Promise<GfxImportResult> {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((e: any) => !e.dir);
  const mainCandidates = entries
    .filter((e: any) => normalizeZipPath(e.name).split("/").pop() === "main.xml")
    .sort((a: any, b: any) => a.name.length - b.name.length);
  const mainEntry = mainCandidates[0];
  if (!mainEntry) throw new Error("Le fichier Main.xml est absent du projet GFX.");
  const xmlBytes = await (mainEntry as any).async("uint8array");
  const xml = parseXmlPortable(decodeXmlBytes(xmlBytes));

  const projectNode = firstByLocalName(xml, "Project");
  const props = directChildByName(projectNode, "Props") || firstByLocalName(projectNode, "Props");
  const gfxName = directText(props, "Name") || file.name.replace(/\.gfx$/i, "");
  const lastDate = directText(props, "LastModifDate");
  let controller = detectControllerFromGfxXml(xml, gfxName);

  let moduleNodes = elementsByLocalNames(xml, ["BacnetIPIOModuleResource", "BacnetIOModuleResource", "IOModuleResource"]);
  if (!moduleNodes.length) moduleNodes = elementsByLocalNamePattern(xml, (name) => name.includes("iomoduleresource"));
  let inputNodes = elementsByLocalNames(xml, ["BacnetIPHardwareInputResource", "BacnetHardwareInputResource", "HardwareInputResource"]);
  if (!inputNodes.length) inputNodes = elementsByLocalNamePattern(xml, (name) => name.includes("hardwareinputresource"));
  let outputNodes = elementsByLocalNames(xml, ["BacnetIPHardwareOutputResource", "BacnetHardwareOutputResource", "HardwareOutputResource"]);
  if (!outputNodes.length) outputNodes = elementsByLocalNamePattern(xml, (name) => name.includes("hardwareoutputresource"));

  const uniqueModules = new Map<number, Module>();
  moduleNodes.forEach((el, position) => {
    const idx = resourceIndex(el);
    const number = idx === null ? position + 1 : idx + 1;
    if (number < 1) return;
    const mod = detectModuleDefinition(
      number,
      directText(el, "NAME") || directText(el, "Name") || el.getAttribute?.("name") || "",
      directText(el, "ModuleId") || directText(el, "ModuleID"),
    );
    mod.gfxNumber = mod.number;
    uniqueModules.set(mod.number, mod);
  });
  let modules = normalizeCommunicationModuleNumbers([...uniqueModules.values()].sort((a, b) => a.number - b.number));
  controller = normalizeControllerReference(controller) || controller;
  modules = normalizeGfxIntegratedArchitecture(controller, modules);
  const integratedController = controllerHasIntegratedIo(controller);
  let integratedModule: Module | null = null;
  if (integratedController) {
    integratedModule = detectModuleDefinition(-100, controller, "");
    modules = [integratedModule, ...modules.filter((module) => !isIntegratedControllerType(module))];
  }

  let inferredArchitecture = false;
  if (!integratedController && !modules.length && (inputNodes.length || outputNodes.length)) {
    modules = inferModulesFromPointResources(inputNodes, outputNodes);
    inferredArchitecture = modules.length > 0;
  }
  if (!modules.length) throw new Error("Aucun automate ou module E/S Distech n’a été détecté.");

  const moduleMap = new Map<number, Module>(
    modules.filter((module) => Number(module.number) > 0).map((m) => [Number(m.gfxNumber ?? m.number), m]),
  );
  const integratedInputChannels = integratedModule ? buildIntegratedChannelAssignments(inputNodes, "input", integratedModule, moduleMap, controller) : new Map();
  const integratedOutputChannels = integratedModule ? buildIntegratedChannelAssignments(outputNodes, "output", integratedModule, moduleMap, controller) : new Map();
  const points: Point[] = [];

  inputNodes.forEach((el) => {
    const name = directText(el, "NAME") || directText(el, "Name");
    if (!name) return;
    const idx = resourceIndex(el);
    if (integratedModule) {
      const channel = integratedInputChannels.get(el) || null;
      if (channel) {
        const code = modulePointCode("input", integratedModule, channel);
        points.push({ direction: "input", designation: name, repere: code, signal: inputSignalFromGfx(el), source: `Import GFX - Automate ${controller} / ${code}`, relay: "", active: true, module: integratedModule.number, channel, uid: uid() });
        return;
      }
    }
    if (idx === null) return;
    const gfxModule = moduleNumberFromPointIndex(idx, moduleMap);
    const channel = (idx % 100) + 1;
    const m = moduleMap.get(gfxModule);
    if (!m) return;
    if (!inferredArchitecture && channel > m.inputCount) return;
    const code = `${m.inputKind || "UI"}${channel}`;
    points.push({ direction: "input", designation: name, repere: code, signal: inputSignalFromGfx(el), source: `Import GFX - Module ${m.number} / ${code}`, relay: "", active: true, module: Number(m.number), channel, uid: uid() });
  });

  outputNodes.forEach((el) => {
    const name = directText(el, "NAME") || directText(el, "Name");
    if (!name) return;
    const idx = resourceIndex(el);
    if (integratedModule) {
      const channel = integratedOutputChannels.get(el) || null;
      if (channel) {
        const code = modulePointCode("output", integratedModule, channel);
        const signal = outputSignalFromGfx(el);
        points.push({ direction: "output", designation: name, repere: code, signal, source: `Import GFX - Automate ${controller} / ${code}`, relay: signal === "D" ? "Relais intégré" : "", active: true, module: integratedModule.number, channel, uid: uid() });
        return;
      }
    }
    if (idx === null) return;
    const gfxModule = moduleNumberFromPointIndex(idx, moduleMap);
    const channel = (idx % 100) + 1;
    const m = moduleMap.get(gfxModule);
    if (!m) return;
    if (!inferredArchitecture && channel > m.outputCount) return;
    const code = `${m.outputKind || "UO"}${channel}`;
    const signal = outputSignalFromGfx(el);
    points.push({ direction: "output", designation: name, repere: code, signal, source: `Import GFX - Module ${m.number} / ${code}`, relay: signal === "D" ? (m.type.includes("DOR") ? "Relais intégré" : "RE-12DC") : "", active: true, module: Number(m.number), channel, uid: uid() });
  });

  if (!points.length)
    throw new Error(`Aucune entrée ou sortie physique nommée n’a été trouvée. Ressources lues : ${inputNodes.length} entrée(s), ${outputNodes.length} sortie(s).`);

  const cleanName = gfxName.replace(/_/g, " ");
  const inputs = points.filter((p) => p.direction === "input").length;
  const outputs = points.length - inputs;
  const extensionCount = modules.filter((module) => !isIntegratedControllerType(module) && !isCommunicationType(module)).length;

  return {
    controller,
    modules,
    points,
    projectFields: {
      name: gfxName,
      header: cleanName,
      document_title: `Affectation entrées sorties automate Distech Controls\n« ${cleanName} »`,
      date: lastDate ? formatGfxDate(lastDate) : new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
      power_supply: controllerHasIntegratedPower(controller) ? "integrated" : "none",
      gfx_header_3: `${controller} - Affectation des entrées / sorties`,
    },
    meta: {
      file: file.name,
      controller: controller || "Modèle non détecté",
      inputs,
      outputs,
      extensions: extensionCount,
      architecture: inferredArchitecture ? "Architecture reconstituée à partir des ressources E/S" : "Architecture déclarée dans le fichier GFX",
      equipment: integratedController
        ? `Automate ${controller} avec E/S intégrées. ${extensionCount ? `${extensionCount} extension(s) réelle(s) détectée(s).` : "Aucune extension E/S supplémentaire détectée."}`
        : `${extensionCount} module(s) E/S détecté(s).`,
    },
  };
}
