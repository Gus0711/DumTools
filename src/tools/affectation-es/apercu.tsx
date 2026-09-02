"use client";

/* eslint-disable @next/next/no-img-element */
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/ui";
import { cn } from "@/lib/cn";
import "./apercu-print.css";
import { fnv1a } from "@/tools/liste-points/hash";
import { genererApercuPdf, type OrientationApercu } from "./apercu-pdf";
import { SelecteurOrientation } from "./selecteur-orientation";
import { BoutonSauvegardeKdrive } from "./sauvegarder-kdrive";
import { construireRecap, RecapPage } from "./recap-affectation";
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
  type KdriveMarker,
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
  channels,
  suite,
}: {
  project: Project;
  m: Module;
  direction: "input" | "output";
  caption: string;
  firstHead: string;
  /** Les canaux à imprimer ici. Absent = tous (page automate intégré). */
  channels?: number[];
  /** Reprise d'un tableau commencé à la page précédente. */
  suite?: boolean;
}) {
  const rows = channels ?? canaux(channelCount(direction, m));
  if (!rows.length) return null;
  return (
    <table className={`io-table ${direction === "input" ? "io-table-input" : "io-table-output"}`}>
      <caption>
        {caption}
        {suite && <span className="caption-suite"> (suite)</span>}
      </caption>
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
              <td className={p ? "" : "free-cell"}>
                {p ? (
                  <>
                    <span className="point-label">{pointLabel(p, !!project.include_references)}</span>
                    {/* Texte libre de la liste de points, en 2e ligne discrète. */}
                    {p.source && <span className="point-note">{p.source}</span>}
                  </>
                ) : (
                  "Libre"
                )}
              </td>
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

// --- Pagination d'une page module -------------------------------------------
//
// `.module-table-area` est une boîte à HAUTEUR FIXE en `overflow: hidden` : ce
// qui dépasse disparaît, sans un mot. Un module 8UI/6UO d'un projet importé du
// GFX y perdait ses deux dernières sorties et sa légende — 179 mm de tableaux
// dans 153 mm de boîte — et le PDF, capture du même DOM, sortait tronqué sur le
// chantier. Aucun test ne pouvait le voir : le document restait valide.
//
// On pagine donc ici, comme le récapitulatif (recap-affectation.tsx) : en pages
// de hauteur connue, plutôt qu'en s'en remettant à un flux CSS qui se fait
// rogner. Les pages de suite laissent tomber le schéma à bornes — il est déjà
// imprimé sur la première — et le tableau prend toute la largeur.

/** Gabarit de la zone des tableaux, en MILLIMÈTRES — toutes ces valeurs sont
 *  MESURÉES au navigateur sur le rendu réel (`scripts/apercu-gabarit.mts`),
 *  jamais estimées :
 *   - `zone` / `zoneSuite` : hauteur de `.module-table-area`, la page de suite
 *     récupérant la place du schéma (en portrait il est empilé au-dessus) ;
 *   - `ligne` : une ligne dont le point porte un TEXTE LIBRE — il se rend en 2ᵉ
 *     ligne sous la désignation, ce qui fait toute la différence : l'import GFX
 *     en pose un sur chaque point, et le tableau double de hauteur ;
 *   - `ligneSimple` : une ligne sans texte libre (ou une borne « Libre ») ;
 *   - `entete` : le cartouche + la ligne de titres d'un tableau ;
 *   - `legende` : le pavé de bas de zone, réservé sur CHAQUE page (on ne sait
 *     pas encore laquelle sera la dernière) ;
 *   - `gap` : l'écart flex entre deux blocs de la zone.
 *  `MARGE_MODULE` garde un fond de page libre : la zone reste en
 *  `overflow: hidden`, mieux vaut un blanc en bas qu'une ligne rognée. */
const GABARIT_MODULE: Record<
  OrientationApercu,
  { zone: number; zoneSuite: number; entete: number; ligne: number; ligneSimple: number; legende: number; gap: number }
> = {
  landscape: { zone: 152.9, zoneSuite: 152.9, entete: 15.4, ligne: 9.8, ligneSimple: 7.2, legende: 6.9, gap: 4 },
  portrait: { zone: 147.1, zoneSuite: 234.0, entete: 14.1, ligne: 8.5, ligneSimple: 5.9, legende: 3.5, gap: 4 },
};
const MARGE_MODULE = 3;

const canaux = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

interface BlocModule {
  direction: "input" | "output";
  caption: string;
  firstHead: string;
  /** Reprise d'un tableau commencé à la page précédente. */
  suite: boolean;
  channels: number[];
}

/**
 * Répartit les entrées puis les sorties d'un module en pages de hauteur connue.
 * Un tableau qui déborde continue en page suivante, son cartouche repris avec
 * « (suite) » ; si une section se termine en milieu de page, la suivante
 * enchaîne dessous — même densité que le récapitulatif.
 *
 * Renvoie toujours au moins une page, fût-elle vide : un module sans borne garde
 * sa page et son schéma.
 */
function paginerModule(project: Project, m: Module, orientation: OrientationApercu): BlocModule[][] {
  const g = GABARIT_MODULE[orientation];
  const points = project.points ?? [];
  const hauteur = (direction: "input" | "output", ch: number) =>
    getAssigned(points, direction, m.number, ch)?.source ? g.ligne : g.ligneSimple;

  const sections: { direction: "input" | "output"; caption: string; firstHead: string; channels: number[] }[] = [
    { direction: "input" as const, caption: `Entrées ${m.inputKind}`, firstHead: "N°", channels: canaux(channelCount("input", m)) },
    { direction: "output" as const, caption: `Sorties ${m.outputKind || "UO"}`, firstHead: "N°", channels: canaux(channelCount("output", m)) },
  ].filter((sec) => sec.channels.length > 0);

  const pages: BlocModule[][] = [];
  let courante: BlocModule[] = [];
  let occupe = 0;
  const capacite = () =>
    (pages.length === 0 ? g.zone : g.zoneSuite) - MARGE_MODULE - g.legende - g.gap;
  const fermer = () => {
    if (!courante.length) return;
    pages.push(courante);
    courante = [];
    occupe = 0;
  };

  for (const sec of sections) {
    let i = 0;
    while (i < sec.channels.length) {
      // Un 2e tableau sur la même page paie en plus l'écart flex.
      const surcout = g.entete + (courante.length > 0 ? g.gap : 0);
      let reste = capacite() - occupe - surcout;
      const prises: number[] = [];
      while (i + prises.length < sec.channels.length) {
        const h = hauteur(sec.direction, sec.channels[i + prises.length]);
        if (h > reste && (prises.length > 0 || courante.length > 0)) break;
        // Page vide et rien ne rentre : on prend quand même une ligne, sinon la
        // boucle ne progresse jamais.
        reste -= h;
        prises.push(sec.channels[i + prises.length]);
      }
      if (!prises.length) {
        fermer();
        continue;
      }
      courante.push({ ...sec, suite: i > 0, channels: prises });
      occupe += surcout + prises.reduce((t, ch) => t + hauteur(sec.direction, ch), 0);
      i += prises.length;
      if (i < sec.channels.length) fermer();
    }
  }
  fermer();
  return pages.length ? pages : [[]];
}

// --- Pages -----------------------------------------------------------------

/**
 * UNE page d'un module — la première porte le schéma à bornes, les suivantes
 * reprennent la suite des tableaux sur toute la largeur (voir `paginerModule`).
 * La légende ne s'imprime qu'en bas de la dernière.
 */
function ModulePage({
  project,
  modules,
  m,
  blocs,
  premiere,
  derniere,
  page,
  total,
  catalogue,
}: {
  project: Project;
  modules: Module[];
  m: Module;
  blocs: BlocModule[];
  premiere: boolean;
  derniere: boolean;
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
      <div className="module-title">
        {moduleDisplayTitle(m, modules)}
        {!premiere && <span className="titre-suite"> (suite)</span>}
      </div>
      <div className={`module-plan ${premiere ? "with-photo" : "sans-schema"}`}>
        {premiere && (
          <div className={figureClass}>
            {top ? <div className="module-zone top">{top}</div> : <div />}
            <div className="print-module-photo">
              <img src={moduleImage(catalogue, m)} alt={`Module ${m.type}`} />
            </div>
            {bottom ? <div className={`module-zone ${bottomClass}`}>{bottom}</div> : <div />}
          </div>
        )}
        <div className="module-table-area">
          {blocs.map((b, i) => (
            <IoTable
              key={`${b.direction}-${i}`}
              project={project}
              m={m}
              direction={b.direction}
              caption={b.caption}
              firstHead={b.firstHead}
              channels={b.channels}
              suite={b.suite}
            />
          ))}
          {derniere && <div className="legend">{LEGEND}</div>}
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

/** Empreinte du contenu du document d'affectation (hors marqueurs kDrive). */
function hashApercu(p: Project): string {
  const clone: Record<string, unknown> = { ...p };
  delete clone.kdrive;
  delete clone.kdriveApercu;
  return fnv1a(JSON.stringify(clone));
}

export function Apercu({
  project,
  modules,
  catalogue,
  chantierId,
  onKdriveSaved,
}: {
  project: Project;
  modules: Module[];
  catalogue: Catalogue;
  chantierId: string | null;
  onKdriveSaved: (m: KdriveMarker) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [orientation, setOrientation] = useState<OrientationApercu>("landscape");
  const [impression, setImpression] = useState(false);
  const [erreurImpr, setErreurImpr] = useState("");
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

  // Le tableau récapitulatif d'affectation est une SECTION de ce document (il
  // n'a plus d'écran ni d'impression à lui) : il s'intercale entre la page
  // automate et les schémas à bornes — l'inventaire d'abord, le câblage ensuite.
  const recap = useMemo(
    () => construireRecap(project, modules, orientation),
    [project, modules, orientation],
  );

  // Les tableaux d'un module ne tiennent pas toujours sur une page : on les
  // découpe AVANT de numéroter, sinon le « page n / N » du pied mentirait.
  const decoupes = useMemo(
    () => new Map(extensionModules.map((m) => [m.number, paginerModule(project, m, orientation)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project, modules, orientation],
  );

  const total =
    (showControllerPage ? 1 : 0) +
    recap.pages.length +
    integratedModules.length * 2 +
    extensionModules.reduce((n, m) => n + (decoupes.get(m.number)?.length ?? 1), 0) +
    commModules.length;

  const pages: ReactNode[] = [];
  let page = 1;
  if (showControllerPage) {
    pages.push(<ControllerPage key="ctrl" project={project} page={page} total={total} catalogue={catalogue} />);
    page += 1;
  }
  for (const [i, blocs] of recap.pages.entries()) {
    const numero = page;
    pages.push(
      <RecapPage
        key={`recap-${i}`}
        project={project}
        blocs={blocs}
        premiere={i === 0}
        page={numero}
        entete={<DocHeader project={project} />}
        pied={<DocFooter project={project} page={numero} total={total} />}
        recap={recap}
      />,
    );
    page += 1;
  }
  for (const m of ordered) {
    if (isIntegratedControllerType(m)) {
      pages.push(<IntegratedTablePage key={`it-${m.number}`} project={project} modules={modules} m={m} page={page} total={total} />);
      page += 1;
      pages.push(<IntegratedDiagramPage key={`id-${m.number}`} project={project} modules={modules} m={m} page={page} total={total} catalogue={catalogue} />);
      page += 1;
    } else {
      const decoupe = decoupes.get(m.number) ?? [[]];
      for (const [i, blocs] of decoupe.entries()) {
        pages.push(
          <ModulePage
            key={`m-${m.number}-${i}`}
            project={project}
            modules={modules}
            m={m}
            blocs={blocs}
            premiere={i === 0}
            derniere={i === decoupe.length - 1}
            page={page}
            total={total}
            catalogue={catalogue}
          />,
        );
        page += 1;
      }
    }
  }
  for (const m of commModules) {
    pages.push(<ModuleCommPage key={`comm-${m.number}`} project={project} modules={modules} m={m} page={page} total={total} catalogue={catalogue} />);
    page += 1;
  }

  const title = project.document_title;

  /**
   * Impression = génération du PDF (chemin FIABLE, WYSIWYG) puis ouverture dans un
   * nouvel onglet où l'utilisateur imprime/enregistre. On n'utilise PAS
   * window.print() : il est cassé sur ce document (voir apercu-pdf.ts).
   */
  async function imprimer() {
    if (!rootRef.current || impression) return;
    setImpression(true);
    setErreurImpr("");
    try {
      const blob = await genererApercuPdf(rootRef.current, orientation);
      const url = URL.createObjectURL(blob);
      const onglet = window.open(url, "_blank");
      if (!onglet) {
        // Popup bloquée → repli sur un téléchargement.
        const a = document.createElement("a");
        a.href = url;
        a.download = `Affectation E-S — ${project.name || "document"}.pdf`;
        a.click();
      }
      // Laisser le temps à l'onglet/à la visionneuse de charger le blob.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setErreurImpr(e instanceof Error ? e.message : "Génération du PDF impossible.");
    } finally {
      setImpression(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {commModules.length > 0 && (
          <div className="text-sm text-muted">
            Modules de communication : {commModules.map((m) => `ECY-${m.type}`).join(", ")}
          </div>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Choix d'orientation : agit sur l'aperçu écran ET le PDF (même DOM). */}
          <SelecteurOrientation orientation={orientation} onChange={setOrientation} />

          <BoutonSauvegardeKdrive
            chantierId={chantierId}
            nomFichier={`Affectation E-S — ${project.name || project.header || "projet"} — ${new Date().toISOString().slice(0, 10)}.pdf`}
            currentHash={hashApercu(project)}
            marker={project.kdriveApercu}
            genererPdf={() => genererApercuPdf(rootRef.current as HTMLElement, orientation)}
            onSaved={onKdriveSaved}
          />
          <Button size="sm" onClick={imprimer} disabled={impression}>
            {impression ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Printer className="h-4 w-4" />
            )}
            Imprimer le document
          </Button>
        </div>
      </div>
      {erreurImpr && <div className="mb-3 text-sm text-danger">{erreurImpr}</div>}

      <div
        ref={rootRef}
        className={cn("print-root affectation-doc", orientation === "portrait" && "portrait")}
      >
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
