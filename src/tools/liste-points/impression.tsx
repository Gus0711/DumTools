"use client";

/* eslint-disable @next/next/no-img-element */
import { useLayoutEffect, useRef, useState } from "react";
import { ES_TYPES, IO_TYPES, type Io, type IoType, type PointRow } from "./model";

const PXMM = 96 / 25.4;
const PAGE_H = (297 - 24) * PXMM; // hauteur imprimable A4 (marges 12 mm)
const SAFETY = 28;

const IO_HEX: Record<IoType, string> = {
  AI: "#1f6feb",
  DI: "#b4690e",
  AO: "#7b41c9",
  DO: "#1a8a4a",
  COM: "#0d8c97",
};

function emptySum(): Io {
  return { AI: 0, DI: 0, AO: 0, DO: 0, COM: 0 };
}
function addRow(sum: Io, r: PointRow) {
  if (r.kind === "point" && r.io) for (const k of IO_TYPES) sum[k] += r.io[k] ? 1 : 0;
}
function isPoint(r: PointRow) {
  return r.kind === "point" && ES_TYPES.some((k) => r.io?.[k]);
}
function fmtDate(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleDateString("fr-FR");
}

/** Document imprimable : pagination A4 avec sous-total/page et total général. */
export function Impression({
  clientNom,
  chantierNom,
  date,
  rows,
}: {
  clientNom: string;
  chantierNom: string;
  date: string | null;
  rows: PointRow[];
}) {
  const headRef = useRef<HTMLDivElement>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const tfootRef = useRef<HTMLTableSectionElement>(null);
  const [pages, setPages] = useState<PointRow[][]>([]);

  useLayoutEffect(() => {
    const tbody = tbodyRef.current;
    if (!tbody || !headRef.current || !theadRef.current || !tfootRef.current) {
      return;
    }
    const headerH = headRef.current.getBoundingClientRect().height;
    const theadH = theadRef.current.getBoundingClientRect().height;
    const footH = tfootRef.current.getBoundingClientRect().height;
    const heights = Array.from(tbody.children).map(
      (el) => el.getBoundingClientRect().height,
    );

    const result: PointRow[][] = [];
    let cur: PointRow[] = [];
    let used = 0;
    let first = true;
    const budget = () =>
      PAGE_H - theadH - footH - SAFETY - (first ? headerH : 0);

    rows.forEach((r, i) => {
      const h = heights[i] ?? 0;
      if (cur.length && used + h > budget()) {
        result.push(cur);
        cur = [];
        used = 0;
        first = false;
      }
      cur.push(r);
      used += h;
    });
    if (cur.length) result.push(cur);

    // Ne pas laisser un titre de section seul en bas de page.
    for (let i = 0; i < result.length - 1; i++) {
      const pg = result[i];
      if (pg.length && pg[pg.length - 1].kind === "section") {
        result[i + 1].unshift(pg.pop()!);
      }
    }
    setPages(result);
  }, [rows, clientNom, chantierNom, date]);

  const grand = emptySum();
  let grandPts = 0;
  for (const r of rows) {
    addRow(grand, r);
    if (isPoint(r)) grandPts++;
  }

  return (
    <>
      {/* Zone de mesure : hors écran mais AVEC layout (visibility, pas display:none)
          → getBoundingClientRect renvoie de vraies hauteurs. Masquée à l'impression
          car hors de .print-root (body * { visibility: hidden }). */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: -10000,
          top: 0,
          width: "186mm",
          visibility: "hidden",
        }}
      >
        <div ref={headRef}>
          <HeaderContent
            clientNom={clientNom}
            chantierNom={chantierNom}
            date={date}
          />
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead ref={theadRef}>
            <PrintHeadRow />
          </thead>
          <tbody ref={tbodyRef}>
            {rows.map((r) => (
              <PrintRow key={`m-${r.id}`} r={r} />
            ))}
          </tbody>
          <tfoot ref={tfootRef}>
            <PrintFootRow label="Sous-total" sum={emptySum()} pts={0} />
          </tfoot>
        </table>
      </div>

      <div className="print-root" aria-hidden>
        {/* Pages finales */}
        {pages.map((pg, idx) => {
        const last = idx === pages.length - 1;
        const sub = emptySum();
        let pts = 0;
        for (const r of pg) {
          addRow(sub, r);
          if (isPoint(r)) pts++;
        }
        return (
          <div key={idx} className="print-page">
            {idx === 0 && (
              <HeaderContent
                clientNom={clientNom}
                chantierNom={chantierNom}
                date={date}
              />
            )}
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12,
              }}
            >
              <thead>
                <PrintHeadRow />
              </thead>
              <tbody>
                {pg.map((r) => (
                  <PrintRow key={r.id} r={r} />
                ))}
              </tbody>
              <tfoot>
                {last ? (
                  <PrintFootRow
                    label={`Total général — ${ES_TYPES.reduce((s, k) => s + grand[k], 0)} E/S`}
                    sum={grand}
                    pts={grandPts}
                    grand
                  />
                ) : (
                  <PrintFootRow
                    label={`Sous-total page ${idx + 1}`}
                    sum={sub}
                    pts={pts}
                  />
                )}
              </tfoot>
            </table>
          </div>
        );
      })}
      </div>
    </>
  );
}

function HeaderContent({
  clientNom,
  chantierNom,
  date,
}: {
  clientNom: string;
  chantierNom: string;
  date: string | null;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <img src="/logo-dumortier.png" alt="Dumortier" style={{ height: 44 }} />
        <div style={{ fontSize: 12, color: "#555" }}>{fmtDate(date)}</div>
      </div>
      <div style={{ marginTop: 8 }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: "#c79213",
            fontWeight: 700,
          }}
        >
          Liste de Points · GTB / GTC
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#003765" }}>
          {clientNom || "—"}
        </div>
        <div style={{ fontSize: 13, color: "#333" }}>{chantierNom || "—"}</div>
      </div>
    </div>
  );
}

function PrintHeadRow() {
  return (
    <tr style={{ borderBottom: "1.5px solid #003765" }}>
      <th style={{ textAlign: "left", padding: "4px 6px", fontSize: 11 }}>
        Nom du point
      </th>
      <th style={{ textAlign: "left", padding: "4px 6px", fontSize: 11 }}>
        Texte libre
      </th>
      {IO_TYPES.map((t) => (
        <th key={t} style={{ width: 34, padding: "4px 2px", fontSize: 11 }}>
          {t}
        </th>
      ))}
    </tr>
  );
}

function PrintRow({ r }: { r: PointRow }) {
  if (r.kind === "section") {
    return (
      <tr style={{ background: "#eef1f6" }}>
        <td
          colSpan={IO_TYPES.length + 2}
          style={{ padding: "4px 6px", fontWeight: 700, color: "#003765" }}
        >
          {r.nom || ""}
        </td>
      </tr>
    );
  }
  return (
    <tr style={{ borderBottom: "1px solid #e5e8ee" }}>
      <td style={{ padding: "3px 6px" }}>{r.nom || ""}</td>
      <td style={{ padding: "3px 6px", color: "#555" }}>{r.note || ""}</td>
      {IO_TYPES.map((t) => (
        <td key={t} style={{ textAlign: "center", padding: "3px 2px" }}>
          {r.io?.[t] ? (
            <span
              style={{
                display: "inline-block",
                minWidth: 22,
                borderRadius: 4,
                padding: "1px 4px",
                fontSize: 10,
                fontWeight: 700,
                color: "#fff",
                background: IO_HEX[t],
              }}
            >
              {t}
            </span>
          ) : (
            ""
          )}
        </td>
      ))}
    </tr>
  );
}

function PrintFootRow({
  label,
  sum,
  pts,
  grand,
}: {
  label: string;
  sum: Io;
  pts: number;
  grand?: boolean;
}) {
  const com = sum.COM || 0;
  return (
    <tr
      style={{
        borderTop: grand ? "2px solid #003765" : "1px solid #003765",
        fontWeight: 700,
        background: grand ? "#eef1f6" : undefined,
      }}
    >
      <td style={{ padding: "5px 6px" }}>{label}</td>
      <td style={{ padding: "5px 6px", fontWeight: 400, color: "#555" }}>
        {pts} pt{pts > 1 ? "s" : ""} · {com} communicant{com > 1 ? "s" : ""}
      </td>
      {IO_TYPES.map((t) => (
        <td key={t} style={{ textAlign: "center", padding: "5px 2px" }}>
          {sum[t] || 0}
        </td>
      ))}
    </tr>
  );
}
