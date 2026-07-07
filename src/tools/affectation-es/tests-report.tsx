"use client";

/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";
import "./tests-print.css";
import { moduleDisplayTitle, type Module, type Point, type Project } from "./model";

const DISTECH_LOGO = "/materiel/distech-logo.png";
const DUMORTIER_LOGO = "/logo-dumortier.png";
const ROWS_PAR_PAGE = 12;

const STATUT = {
  ok: { label: "OK", cls: "st-ok" },
  defaut: { label: "Défaut", cls: "st-defaut" },
  "non-teste": { label: "À tester", cls: "st-todo" },
} as const;

function statutInfo(s: string | undefined) {
  return STATUT[(s as keyof typeof STATUT) in STATUT ? (s as keyof typeof STATUT) : "non-teste"];
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function DocHeader({ project }: { project: Project }) {
  return (
    <div className="doc-header">
      <img className="header-distech-logo" src={DISTECH_LOGO} alt="Distech Controls" />
      <span>{project.header || " "}</span>
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

export function RapportTests({
  project,
  modules,
}: {
  project: Project;
  modules: Module[];
}) {
  const points = (project.points ?? [])
    .filter((p) => p.active && p.module != null && p.channel != null)
    .sort((a, b) => {
      const am = Number(a.module) - Number(b.module);
      if (am !== 0) return am;
      if (a.direction !== b.direction) return a.direction === "input" ? -1 : 1;
      return Number(a.channel) - Number(b.channel);
    });

  const stats = points.reduce(
    (acc, p) => {
      if (p.testStatus === "ok") acc.ok += 1;
      else if (p.testStatus === "defaut") acc.defaut += 1;
      else acc.todo += 1;
      return acc;
    },
    { ok: 0, defaut: 0, todo: 0 },
  );

  // Groupes par module, puis découpage en pages de ROWS_PAR_PAGE lignes.
  const groups = new Map<number, Point[]>();
  for (const p of points) {
    const n = Number(p.module);
    if (!groups.has(n)) groups.set(n, []);
    groups.get(n)!.push(p);
  }
  const sections = [...groups.entries()].flatMap(([num, pts]) => {
    const mod = modules.find((m) => Number(m.number) === num);
    const label = mod ? moduleDisplayTitle(mod, modules) : `Module ${num}`;
    const parts = chunk(pts, ROWS_PAR_PAGE);
    return parts.map((rows, i) => ({
      num,
      label,
      rows,
      total: pts.length,
      part: i + 1,
      parts: parts.length,
      dernier: i === parts.length - 1,
    }));
  });

  const totalPages = Math.max(1, sections.length);
  const pages: ReactNode[] = [];
  let page = 1;

  for (const s of sections) {
    const premiere = page === 1;
    const ok = s.rows.filter((p) => p.testStatus === "ok").length;
    const defaut = s.rows.filter((p) => p.testStatus === "defaut").length;
    pages.push(
      <section key={`${s.num}-${s.part}`} className="print-page">
        <DocHeader project={project} />
        {premiere && (
          <>
            <div className="module-title">Rapport de mise en service</div>
            <div className="report-summary">
              <div className="summary-box">
                <b>{points.length}</b>
                <span>Points testés</span>
              </div>
              <div className="summary-box ok">
                <b>{stats.ok}</b>
                <span>Validés (OK)</span>
              </div>
              <div className="summary-box defaut">
                <b>{stats.defaut}</b>
                <span>En défaut</span>
              </div>
              <div className="summary-box">
                <b>{stats.todo}</b>
                <span>Restant à tester</span>
              </div>
            </div>
          </>
        )}

        <div className="test-module-banner">
          <div>
            <h3>{s.label}</h3>
            <p>
              {s.total} point{s.total > 1 ? "s" : ""} · {ok} OK · {defaut} défaut sur cette page
            </p>
          </div>
          {s.parts > 1 && (
            <div className="test-module-meta">
              Page {s.part} / {s.parts}
            </div>
          )}
        </div>

        <table className="rep-table">
          <colgroup>
            <col style={{ width: "16mm" }} />
            <col style={{ width: "16mm" }} />
            <col />
            <col style={{ width: "20mm" }} />
            <col style={{ width: "24mm" }} />
            <col style={{ width: "52mm" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Borne</th>
              <th>Sens</th>
              <th>Désignation</th>
              <th>Signal</th>
              <th>Résultat</th>
              <th>Commentaire</th>
            </tr>
          </thead>
          <tbody>
            {s.rows.map((p) => {
              const info = statutInfo(p.testStatus);
              const signal = p.direction === "output" ? p.relay || p.signal || "" : p.signal || "";
              return (
                <tr key={p.uid} className={info.cls}>
                  <td className="mono">{p.repere || "—"}</td>
                  <td>{p.direction === "input" ? "Entrée" : "Sortie"}</td>
                  <td>{p.designation}</td>
                  <td>{signal || "—"}</td>
                  <td>
                    <span className={`badge ${info.cls}`}>{info.label}</span>
                  </td>
                  <td className="comment-cell">{p.testComment || ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {s.dernier && (
          <div className="rep-legend">
            <span>
              <i className="ok" /> Test validé (OK)
            </span>
            <span>
              <i className="defaut" /> En défaut
            </span>
            <span>
              <i className="todo" /> Restant à tester
            </span>
          </div>
        )}

        <div className="side-page">{page}</div>
        <DocFooter project={project} page={page} total={totalPages} />
      </section>,
    );
    page += 1;
  }

  return (
    <div className="print-root tests-report">
      {/* Couverture */}
      <section className="print-page cover-page">
        <DocHeader project={project} />
        <img className="cover-logo" src={DUMORTIER_LOGO} alt="Logo Dumortier Groupe Fareneït" />
        <div className="cover-sub">AUTOMATISME · RÉGULATION · GTC</div>
        <div className="cover-title">Rapport de mise en service</div>
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
            <b>Document de mise en service</b>
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
  );
}
