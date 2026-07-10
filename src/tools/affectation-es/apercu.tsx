"use client";

/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/ui";
import "./apercu-print.css";
import { powerSupplyInfo } from "./catalog";
import { MODULE_IMAGES } from "./images";
import { automateDef, moduleDef, type AutomateDef, type Catalogue } from "./catalogue";
import {
  channelCount,
  controllerInfo,
  getAssigned,
  isCommunicationType,
  isIntegratedControllerType,
  modulePointCode,
  moduleDisplayTitle,
  moduleSort,
  normalizeControllerReference,
  pointLabel,
  signalCompatibleBorne,
  type Module,
  type Project,
} from "./model";
import { signalLabel } from "@/tools/liste-points/model";

const DISTECH_LOGO = "/materiel/distech-logo.png";
const DUMORTIER_LOGO = "/logo-dumortier.png";

/** Infos automate depuis le catalogue, avec repli sur les constantes historiques. */
function infoAutomate(catalogue: Catalogue, reference: string): AutomateDef {
  const def = automateDef(catalogue, reference);
  if (def) return def.image ? def : { ...def, image: controllerInfo(reference).img };
  const fallback = controllerInfo(reference);
  return {
    reference: fallback.reference,
    image: fallback.img,
    alimIntegree: fallback.integratedPower,
    alimLabel: fallback.powerLabel,
    entreeKind: "UI",
    entreeCount: 0,
    sortieKind: "UO",
    sortieCount: 0,
    entreeCodes: [],
    sortieCodes: [],
    extensible: false,
    modulesCompat: [],
    maxModules: 0,
    maxPoints: 0,
    docUrl: "",
  };
}

function moduleImage(catalogue: Catalogue, m: Module): string {
  if (isIntegratedControllerType(m)) return infoAutomate(catalogue, m.type).image;
  const def = moduleDef(catalogue, m.type);
  if (def?.image) return def.image;
  const t = String(m.type || "").toUpperCase();
  if (t.includes("16DI")) return MODULE_IMAGES["16DI"];
  if (t.includes("8DOR")) return MODULE_IMAGES["8DOR"];
  if (t.includes("4UI4UO")) return MODULE_IMAGES["4UI4UO"];
  if (t.includes("8UI6UO")) return MODULE_IMAGES["8UI6UO"];
  if (t.includes("8UI")) return MODULE_IMAGES["8UI"];
  if (t.includes("MBUS")) return MODULE_IMAGES["MBUS"];
  if (t.includes("RS485")) return MODULE_IMAGES["RS485"];
  return MODULE_IMAGES["8UI6UO"];
}

// --- En-tête / pied / pastille (communs à toutes les pages) ---------------

function DocHeader({ project }: { project: Project }) {
  return (
    <div className="doc-header">
      <img className="header-distech-logo" src={DISTECH_LOGO} alt="Distech Controls" />
      <span className="header-title">{project.header || " "}</span>
    </div>
  );
}

function DocFooter({ project, page, total }: { project: Project; page: number; total: number }) {
  return (
    <>
      <div className="logo-dumortier">
        <img src={DUMORTIER_LOGO} alt="Dumortier Groupe Fareneït" />
      </div>
      <div className="doc-footer">
        <div>
          Version {project.version} - {project.date}
        </div>
        <div>www.dumortier02.fr</div>
        <div>
          Page {page} / {total}
        </div>
      </div>
    </>
  );
}

// --- Schéma à bornes -------------------------------------------------------

function TerminalBank({
  project,
  m,
  direction,
  channels,
}: {
  project: Project;
  m: Module;
  direction: "input" | "output";
  channels: number[];
}) {
  return (
    <div
      className={`module-info-bank ${direction}`}
      style={{ gridTemplateColumns: `repeat(${Math.max(1, channels.length)}, minmax(0, 1fr))` }}
    >
      {channels.map((ch) => {
        const p = getAssigned(project.points ?? [], direction, m.number, ch);
        return (
          <div className="terminal" key={ch}>
            <div className="wire-label">{p ? pointLabel(p, !!project.include_references) : ""}</div>
            <div className="terminal-pin">{modulePointCode(direction, m, ch)}</div>
          </div>
        );
      })}
    </div>
  );
}

/** Empile 4 bornes « arrière » (start+4..start+7) au-dessus des 4 « avant » (start..start+3). */
function DualStack({
  project,
  m,
  direction,
  start,
}: {
  project: Project;
  m: Module;
  direction: "input" | "output";
  start: number;
}) {
  const range = (from: number) => Array.from({ length: 4 }, (_, i) => from + i);
  return (
    <div className="dual-input-stack">
      <TerminalBank project={project} m={m} direction={direction} channels={range(start + 4)} />
      <TerminalBank project={project} m={m} direction={direction} channels={range(start)} />
    </div>
  );
}

/** Reproduit la disposition physique des bancs de bornes selon le type de module. */
function moduleBanks(project: Project, m: Module) {
  const type = String(m.type || "").toUpperCase();
  const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
  const isSplitUi = (m.type === "8UI6UO" || m.type === "8UI") && m.inputCount === 8;
  let top: ReactNode = null;
  let bottom: ReactNode = null;
  let bottomClass = "bottom";

  if (m.inputCount && m.outputCount) {
    top = <TerminalBank project={project} m={m} direction="output" channels={range(m.outputCount)} />;
    if (isSplitUi) {
      bottom = <DualStack project={project} m={m} direction="input" start={1} />;
      bottomClass = "bottom split-ui8";
    } else {
      bottom = <TerminalBank project={project} m={m} direction="input" channels={range(m.inputCount)} />;
    }
  } else if (m.inputCount && m.inputKind === "DI" && m.inputCount > 8) {
    top = <DualStack project={project} m={m} direction="input" start={9} />;
    bottom = <DualStack project={project} m={m} direction="input" start={1} />;
    bottomClass = "bottom split-ui8";
  } else if (m.outputCount && type.includes("8DOR") && m.outputCount > 4) {
    top = <TerminalBank project={project} m={m} direction="output" channels={[5, 6, 7, 8]} />;
    bottom = <TerminalBank project={project} m={m} direction="output" channels={[1, 2, 3, 4]} />;
  } else if (m.inputCount) {
    if (isSplitUi) {
      bottom = <DualStack project={project} m={m} direction="input" start={1} />;
      bottomClass = "bottom split-ui8";
    } else {
      bottom = <TerminalBank project={project} m={m} direction="input" channels={range(m.inputCount)} />;
    }
  } else if (m.outputCount) {
    top = <TerminalBank project={project} m={m} direction="output" channels={range(m.outputCount)} />;
  }

  return { top, bottom, bottomClass };
}

// --- Tableaux E/S ----------------------------------------------------------

function IoTable({
  project,
  m,
  direction,
  caption,
  firstHead,
}: {
  project: Project;
  m: Module;
  direction: "input" | "output";
  caption: string;
  firstHead: string;
}) {
  const count = channelCount(direction, m);
  if (!count) return null;
  const rows = Array.from({ length: count }, (_, i) => i + 1);
  return (
    <table className={`io-table ${direction === "input" ? "io-table-input" : "io-table-output"}`}>
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th>{firstHead}</th>
          <th>Désignation</th>
          <th className="old-wire-head">Ancien fil 1</th>
          <th className="old-wire-head">Ancien fil 2</th>
          <th>{direction === "input" ? "Type" : "Relais / type"}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((ch) => {
          const p = getAssigned(project.points ?? [], direction, m.number, ch);
          const third = direction === "input" ? (p ? signalLabel(p.signal) : "-") : p ? p.relay || signalLabel(p.signal) : "-";
          const incompatible = p ? !signalCompatibleBorne(p.signal, p.repere) : false;
          return (
            <tr key={ch} className={incompatible ? "io-row-incompatible" : undefined}>
              <td>{ch}</td>
              <td className={p ? "" : "free-cell"}>{p ? pointLabel(p, !!project.include_references) : "Libre"}</td>
              <td className="old-wire-cell"></td>
              <td className="old-wire-cell"></td>
              <td>
                {third || "-"}
                {incompatible && (
                  <span className="io-incompatible-flag" title="Signal incompatible avec cette borne (triac / analogique)">
                    {" "}⚠ incompatible
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const LEGEND =
  "Les colonnes « Ancien fil 1 » et « Ancien fil 2 » sont à renseigner sur site par le technicien. " +
  "Les bornes indiquées « Libre » restent disponibles pour une évolution future.";

// --- Pages -----------------------------------------------------------------

function ModulePage({
  project,
  modules,
  m,
  page,
  total,
  catalogue,
}: {
  project: Project;
  modules: Module[];
  m: Module;
  page: number;
  total: number;
  catalogue: Catalogue;
}) {
  const { top, bottom, bottomClass } = moduleBanks(project, m);
  const figureClass = String(m.type || "").toUpperCase().includes("16DI")
    ? "module-figure module-16di"
    : "module-figure";
  return (
    <section className="print-page">
      <DocHeader project={project} />
      <div className="module-title">{moduleDisplayTitle(m, modules)}</div>
      <div className="module-plan with-photo">
        <div className={figureClass}>
          {top ? <div className="module-zone top">{top}</div> : <div />}
          <div className="print-module-photo">
            <img src={moduleImage(catalogue, m)} alt={`Module ${m.type}`} />
          </div>
          {bottom ? <div className={`module-zone ${bottomClass}`}>{bottom}</div> : <div />}
        </div>
        <div className="module-table-area">
          <IoTable project={project} m={m} direction="input" caption={`Entrées ${m.inputKind}`} firstHead="N°" />
          <IoTable
            project={project}
            m={m}
            direction="output"
            caption={`Sorties ${m.outputKind || "UO"}`}
            firstHead="N°"
          />
          <div className="legend">{LEGEND}</div>
        </div>
      </div>
      <div className="side-page">{page}</div>
      <DocFooter project={project} page={page} total={total} />
    </section>
  );
}

function ModuleCommPage({
  project,
  modules,
  m,
  page,
  total,
  catalogue,
}: {
  project: Project;
  modules: Module[];
  m: Module;
  page: number;
  total: number;
  catalogue: Catalogue;
}) {
  return (
    <section className="print-page">
      <DocHeader project={project} />
      <div className="module-title">{moduleDisplayTitle(m, modules)}</div>
      <div className="comm-plan">
        <div className="comm-photo">
          <img src={moduleImage(catalogue, m)} alt={m.type} />
        </div>
        <div className="comm-note">
          Module de communication {m.type}. Il n&apos;occupe pas d&apos;entrée / sortie physique :
          il assure le raccordement du bus (Modbus RS-485, M-Bus…) aux équipements communicants.
        </div>
      </div>
      <div className="side-page">{page}</div>
      <DocFooter project={project} page={page} total={total} />
    </section>
  );
}

function ControllerPage({
  project,
  page,
  total,
  catalogue,
}: {
  project: Project;
  page: number;
  total: number;
  catalogue: Catalogue;
}) {
  const ctrl = infoAutomate(catalogue, project.controller);
  const supply = powerSupplyInfo(project.power_supply);
  const showSupply = !supply.integrated && !!supply.img;
  return (
    <section className="print-page">
      <DocHeader project={project} />
      <div className="module-title">Automate principal - {ctrl.reference}</div>
      <div className="controller-content with-photo">
        <div className="controller-box">
          <h2>{ctrl.reference}</h2>
          <div className="network-list">
            <NetworkItem label="Alimentation" value={`${supply.label}${showSupply ? ` — ${supply.title}` : ""}`} />
            <NetworkItem label="Réseau 1" value={project.network_1 || "RJ45 - BACnet/IP"} />
            <NetworkItem label="IP port 1" value={project.controller_ip} />
            <NetworkItem label="Réseau 2" value={project.network_2 || "RJ45 - supervision"} />
            <NetworkItem label="IP port 2" value={project.controller_ip_2 || "—"} />
            <NetworkItem label="Modbus" value="RS485 - RTU" />
            <NetworkItem label="SSID Wi-Fi" value={project.wifi_ssid} />
            <NetworkItem label="Mot de passe" value={project.wifi_password} />
          </div>
        </div>
        <div className="controller-photo">
          {showSupply && (
            <>
              <img className="power-main" src={supply.img} alt={supply.title} />
              <div className="hardware-caption">
                {supply.title} — {supply.label}
              </div>
            </>
          )}
          <img className="controller-main" src={ctrl.image} alt={`Automate principal ${ctrl.reference}`} />
          <div className="hardware-caption">
            {ctrl.reference}
            {ctrl.alimIntegree && ctrl.alimLabel ? ` — ${ctrl.alimLabel}` : ""}
          </div>
        </div>
      </div>
      <div className="side-page">{page}</div>
      <DocFooter project={project} page={page} total={total} />
    </section>
  );
}

function NetworkItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="network-item">
      <b>{label}</b>
      <span>{value}</span>
    </div>
  );
}

// --- Automate à E/S intégrées (2 pages : tableau + schéma) -----------------

function integratedTitle(m: Module, modules: Module[]): string {
  return moduleDisplayTitle(m, modules);
}

function IntegratedTablePage({
  project,
  modules,
  m,
  page,
  total,
}: {
  project: Project;
  modules: Module[];
  m: Module;
  page: number;
  total: number;
}) {
  const usedIn = Array.from({ length: m.inputCount }, (_, i) => getAssigned(project.points ?? [], "input", m.number, i + 1)).filter(Boolean).length;
  const usedOut = Array.from({ length: m.outputCount }, (_, i) => getAssigned(project.points ?? [], "output", m.number, i + 1)).filter(Boolean).length;
  return (
    <section className="print-page integrated-table-page">
      <DocHeader project={project} />
      <div className="module-title">{integratedTitle(m, modules)} — tableau des entrées et sorties</div>
      <div className="integrated-table-grid">
        <div className="integrated-table-column">
          <div className="integrated-summary">
            <b>
              {usedIn}/{m.inputCount}
            </b>{" "}
            entrée(s) intégrée(s) affectée(s)
          </div>
          <IoTable project={project} m={m} direction="input" caption="Entrées intégrées à l’automate" firstHead="Borne" />
        </div>
        <div className="integrated-table-column">
          <div className="integrated-summary">
            <b>
              {usedOut}/{m.outputCount}
            </b>{" "}
            sortie(s) intégrée(s) affectée(s)
          </div>
          <IoTable project={project} m={m} direction="output" caption="Sorties intégrées à l’automate" firstHead="Borne" />
        </div>
      </div>
      <div className="side-page">{page}</div>
      <DocFooter project={project} page={page} total={total} />
    </section>
  );
}

function IntegratedDiagramPage({
  project,
  modules,
  m,
  page,
  total,
  catalogue,
}: {
  project: Project;
  modules: Module[];
  m: Module;
  page: number;
  total: number;
  catalogue: Catalogue;
}) {
  const type = String(m.type || "").toUpperCase();
  const inputsTop = type === "ECY-PTU-207";
  const clamp = (order: number[], count: number) => order.filter((c) => c >= 1 && c <= count);
  const inputChannels = Array.from({ length: m.inputCount }, (_, i) => i + 1);
  // Ordre physique visible sur le dessin du PTU-207 : AO7 à AO10, puis DO5, DO6 et DO1 à DO4.
  const ptu207Output = clamp([7, 8, 9, 10, 5, 6, 1, 2, 3, 4], m.outputCount);
  const outputChannels = inputsTop && type === "ECY-PTU-207" ? ptu207Output : Array.from({ length: m.outputCount }, (_, i) => i + 1);
  const topChannels = inputsTop ? inputChannels : outputChannels;
  const bottomChannels = inputsTop ? outputChannels : inputChannels;
  const topDir: "input" | "output" = inputsTop ? "input" : "output";
  const bottomDir: "input" | "output" = inputsTop ? "output" : "input";
  const ctrl = infoAutomate(catalogue, m.type);
  return (
    <section className="print-page integrated-diagram-page">
      <DocHeader project={project} />
      <div className="module-title">{integratedTitle(m, modules)} — affectation directe des E/S</div>
      <div className="integrated-controller-plan">
        <div>
          <TerminalBank project={project} m={m} direction={topDir} channels={topChannels} />
        </div>
        <div className="integrated-controller-photo">
          <img src={ctrl.image || moduleImage(catalogue, m)} alt={m.type} />
        </div>
        <div>
          <TerminalBank project={project} m={m} direction={bottomDir} channels={bottomChannels} />
          <div className="integrated-controller-note">
            Les bornes affichées correspondent directement aux entrées et sorties physiques intégrées à l’automate.
            Aucun module d’extension n’est créé pour ces points.
          </div>
        </div>
      </div>
      <div className="side-page">{page}</div>
      <DocFooter project={project} page={page} total={total} />
    </section>
  );
}

// --- Document complet ------------------------------------------------------

export function Apercu({
  project,
  modules,
  catalogue,
}: {
  project: Project;
  modules: Module[];
  catalogue: Catalogue;
}) {
  const ordered = [...modules].filter((m) => !isCommunicationType(m)).sort(moduleSort);
  const integratedModules = ordered.filter(isIntegratedControllerType);
  const extensionModules = ordered.filter((m) => !isIntegratedControllerType(m));
  const commModules = modules
    .filter((m) => isCommunicationType(m))
    .sort((a, b) => Math.abs(Number(a.number) || 0) - Math.abs(Number(b.number) || 0));

  const hasController = !!normalizeControllerReference(project.controller);
  const mainIsIntegrated =
    hasController &&
    infoAutomate(catalogue, project.controller).alimIntegree &&
    integratedModules.some(
      (m) => normalizeControllerReference(m.type) === normalizeControllerReference(project.controller),
    );
  const showControllerPage = hasController && !mainIsIntegrated;
  const total =
    (showControllerPage ? 1 : 0) +
    integratedModules.length * 2 +
    extensionModules.length +
    commModules.length;

  const pages: ReactNode[] = [];
  let page = 1;
  if (showControllerPage) {
    pages.push(<ControllerPage key="ctrl" project={project} page={page} total={total} catalogue={catalogue} />);
    page += 1;
  }
  for (const m of ordered) {
    if (isIntegratedControllerType(m)) {
      pages.push(<IntegratedTablePage key={`it-${m.number}`} project={project} modules={modules} m={m} page={page} total={total} />);
      page += 1;
      pages.push(<IntegratedDiagramPage key={`id-${m.number}`} project={project} modules={modules} m={m} page={page} total={total} catalogue={catalogue} />);
      page += 1;
    } else {
      pages.push(<ModulePage key={`m-${m.number}`} project={project} modules={modules} m={m} page={page} total={total} catalogue={catalogue} />);
      page += 1;
    }
  }
  for (const m of commModules) {
    pages.push(<ModuleCommPage key={`comm-${m.number}`} project={project} modules={modules} m={m} page={page} total={total} catalogue={catalogue} />);
    page += 1;
  }

  const title = project.document_title;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        {commModules.length > 0 && (
          <div className="text-sm text-muted">
            Modules de communication : {commModules.map((m) => `ECY-${m.type}`).join(", ")}
          </div>
        )}
        <div className="ml-auto">
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Imprimer le document
          </Button>
        </div>
      </div>

      <div className="print-root affectation-doc">
        {/* Couverture */}
        <section className="print-page cover-page">
          <DocHeader project={project} />
          <img className="cover-logo" src={DUMORTIER_LOGO} alt="Logo Dumortier Groupe Fareneït" />
          <div className="cover-sub">AUTOMATISME · RÉGULATION · GTC</div>
          <div className="cover-title">{title}</div>
          <div className="cover-project">{project.name}</div>
          <div className="company-block">
            <div>
              <b>Dumortier</b>
              <br />
              ZAC Le Château
              <br />
              02800 CHARMES
              <br />
              Téléphone : 03.23.38.18.88
            </div>
            <div>
              <b>Document d&apos;affectation E/S</b>
              <br />
              Version {project.version}
              <br />
              {project.date}
              <br />
              www.dumortier02.fr
            </div>
          </div>
        </section>
        {pages}
      </div>
    </div>
  );
}
