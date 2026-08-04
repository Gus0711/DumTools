"use client";

import { type ReactNode } from "react";
import type { OrientationApercu } from "./apercu-pdf";
import { signalLabel } from "@/tools/liste-points/model";
import {
  moduleDisplayTitle,
  signalCompatibleBorne,
  type Module,
  type Point,
  type Project,
} from "./model";

/* TABLEAU RÉCAPITULATIF d'affectation E/S : une vue synthétique qui liste toutes
 * les entrées puis toutes les sorties avec leur repère, signal, module et canal
 * — ce qu'on relit d'un coup d'œil pour vérifier le câblage.
 *
 * Ce n'est PAS un document à part : ses pages sont montées dans le document
 * unique de l'onglet « Aperçu » (voir apercu.tsx), entre la page automate et les
 * schémas à bornes. Un seul document, donc une seule impression.
 *
 * Même infrastructure que le reste du document (`apercu-print.css` :
 * `.affectation-doc` + `.io-table` + pages A4 fixes). La pagination est faite
 * ICI, en pages de hauteur fixe — pas de flux CSS hasardeux qui risquerait
 * d'être rogné. */

/** Gabarit d'une page, en MILLIMÈTRES — toutes les valeurs sont mesurées au
 *  navigateur sur le rendu réel (et non estimées) :
 *   - `corps` / `corpsPremiere` : hauteur de `.recap-body` (apercu-print.css),
 *     la 1re page cédant de la place au bloc titre ;
 *   - `ligne` : hauteur d'une ligne de tableau (7,6 pt en paysage, 6,9 pt en
 *     portrait — police et interlignes fixes, donc hauteur constante) ;
 *   - `entete` : légende + ligne de titres d'un tableau ;
 *   - `gap` : l'écart flex entre deux tableaux sur une même page.
 *  `MARGE` garde un fond de page libre : la zone est en `overflow: hidden`,
 *  mieux vaut un blanc en bas qu'une ligne rognée. */
const GABARIT: Record<
  OrientationApercu,
  { corps: number; corpsPremiere: number; ligne: number; entete: number; gap: number }
> = {
  landscape: { corps: 162, corpsPremiere: 148, ligne: 7.3, entete: 15.6, gap: 4 },
  portrait: { corps: 246, corpsPremiere: 232, ligne: 6.1, entete: 14.4, gap: 4 },
};
const MARGE = 3;

interface LigneRecap {
  uid: string;
  repere: string;
  designation: string;
  source: string;
  signal: string;
  relay: string;
  module: string;
  canal: string;
  incompatible: boolean;
  nonAffecte: boolean;
}

function versLigne(p: Point, modules: Module[]): LigneRecap {
  const mod = modules.find((m) => Number(m.number) === Number(p.module));
  const nonAffecte = p.module == null || p.channel == null;
  return {
    uid: p.uid,
    repere: p.repere ?? "",
    designation: p.designation ?? "",
    source: p.source ?? "",
    signal: p.signal ? signalLabel(p.signal) : "",
    relay: p.relay ?? "",
    module: mod ? moduleDisplayTitle(mod, modules) : "",
    canal: p.channel != null ? String(p.channel) : "",
    incompatible: !nonAffecte && !signalCompatibleBorne(p.signal, p.repere),
    nonAffecte,
  };
}

/** Tri « comme le câblage » : affectés d'abord (par module puis canal), les non
 *  affectés à la fin, par désignation — pour les repérer en bloc. */
function trier(pts: Point[]): Point[] {
  return [...pts].sort((a, b) => {
    const am = a.module ?? Infinity;
    const bm = b.module ?? Infinity;
    if (am !== bm) return am - bm;
    const ac = a.channel ?? Infinity;
    const bc = b.channel ?? Infinity;
    if (ac !== bc) return ac - bc;
    return (a.designation ?? "").localeCompare(b.designation ?? "");
  });
}

interface BlocPage {
  section: "input" | "output";
  titre: string;
  suite: boolean;
  lignes: LigneRecap[];
}

/**
 * Répartit les sections en pages de hauteur fixe. Les entrées viennent
 * d'abord ; si elles se terminent au milieu d'une page, les sorties enchaînent
 * dessous (densité). Une section qui déborde continue en page suivante, sa
 * légende reprise avec « (suite) ».
 */
function paginer(
  sections: { section: "input" | "output"; titre: string; lignes: LigneRecap[] }[],
  orientation: OrientationApercu,
): BlocPage[][] {
  const g = GABARIT[orientation];
  const pages: BlocPage[][] = [];
  let courante: BlocPage[] = [];
  let occupe = 0; // mm déjà consommés sur la page en cours
  let capacite = g.corpsPremiere - MARGE;

  const fermerPage = () => {
    if (courante.length === 0) return;
    pages.push(courante);
    courante = [];
    occupe = 0;
    capacite = g.corps - MARGE;
  };

  for (const sec of sections) {
    if (sec.lignes.length === 0) continue;
    let i = 0;
    while (i < sec.lignes.length) {
      // Un 2e tableau sur la même page paie en plus l'écart flex.
      const surcout = g.entete + (courante.length > 0 ? g.gap : 0);
      const dispo = Math.floor((capacite - occupe - surcout) / g.ligne);
      if (dispo <= 0) {
        fermerPage();
        continue;
      }
      const prend = Math.min(dispo, sec.lignes.length - i);
      courante.push({
        section: sec.section,
        titre: sec.titre,
        suite: i > 0,
        lignes: sec.lignes.slice(i, i + prend),
      });
      i += prend;
      occupe += surcout + prend * g.ligne;
      if (i < sec.lignes.length) fermerPage();
    }
  }
  fermerPage();
  return pages;
}

export interface Recap {
  /** Pages du récapitulatif — vide s'il n'y a aucune E/S à lister. */
  pages: BlocPage[][];
  nbEntrees: number;
  nbSorties: number;
  nonAffectes: number;
  incompatibles: number;
}

/** Construit les pages du récapitulatif. Fonction pure : l'appelant (apercu.tsx)
 *  la mémoïse et numérote les pages dans la foulée du reste du document. */
export function construireRecap(
  project: Project,
  modules: Module[],
  orientation: OrientationApercu,
): Recap {
  const actifs = (project.points ?? []).filter((p) => p.active);
  const entrees = trier(actifs.filter((p) => p.direction === "input")).map((p) => versLigne(p, modules));
  const sorties = trier(actifs.filter((p) => p.direction === "output")).map((p) => versLigne(p, modules));
  const pages = paginer(
    [
      { section: "input", titre: "Entrées", lignes: entrees },
      { section: "output", titre: "Sorties", lignes: sorties },
    ],
    orientation,
  );
  const toutes = [...entrees, ...sorties];
  return {
    pages,
    nbEntrees: entrees.length,
    nbSorties: sorties.length,
    nonAffectes: toutes.filter((l) => l.nonAffecte).length,
    incompatibles: toutes.filter((l) => l.incompatible).length,
  };
}

/** Une page du récapitulatif. L'en-tête et le pied sont fournis par le document
 *  (apercu.tsx) : une seule définition du bandeau Distech et du cartouche de
 *  pied pour toutes les pages, quelle que soit leur nature. */
export function RecapPage({
  project,
  blocs,
  premiere,
  page,
  entete,
  pied,
  recap,
}: {
  project: Project;
  blocs: BlocPage[];
  premiere: boolean;
  page: number;
  entete: ReactNode;
  pied: ReactNode;
  recap: Recap;
}) {
  return (
    <section className={`print-page recap-page${premiere ? " first" : ""}`}>
      {entete}

      {premiere && (
        <div className="recap-intro">
          <div>
            <h1>Tableau d&apos;affectation des entrées / sorties</h1>
            {project.controller && (
              <div className="recap-sub">Automate {project.controller}</div>
            )}
          </div>
          <div className="recap-meta">
            <div>
              <b>{recap.nbEntrees}</b> entrées &nbsp;·&nbsp; <b>{recap.nbSorties}</b> sorties
            </div>
            {recap.nonAffectes > 0 && (
              <div className="recap-warn">{recap.nonAffectes} non affectée(s)</div>
            )}
            {recap.incompatibles > 0 && (
              <div className="recap-warn">{recap.incompatibles} borne(s) incompatible(s)</div>
            )}
            <div>
              Version {project.version} — {project.date}
            </div>
          </div>
        </div>
      )}

      <div className="recap-body">
        {blocs.map((bloc, i) => (
          <RecapTable key={i} bloc={bloc} />
        ))}
      </div>

      <div className="side-page">{page}</div>
      {pied}
    </section>
  );
}

function RecapTable({ bloc }: { bloc: BlocPage }): ReactNode {
  const isOut = bloc.section === "output";
  return (
    <table
      className={`io-table recap-table ${isOut ? "io-table-output" : "io-table-input"}`}
    >
      <caption>
        {bloc.titre}
        {bloc.suite && <span className="recap-suite"> (suite)</span>}
      </caption>
      <colgroup>
        <col className="c-rep" />
        <col className="c-des" />
        <col className="c-lib" />
        <col className="c-sig" />
        {isOut && <col className="c-rel" />}
        <col className="c-mod" />
        <col className="c-can" />
      </colgroup>
      <thead>
        <tr>
          <th>Repère</th>
          <th>Désignation</th>
          <th>Texte libre</th>
          <th>Signal</th>
          {isOut && <th>Relais</th>}
          <th>Module</th>
          <th>Canal</th>
        </tr>
      </thead>
      <tbody>
        {bloc.lignes.map((l) => (
          <tr key={l.uid} className={l.incompatible ? "io-row-incompatible" : undefined}>
            <td className="recap-rep">
              {l.repere || <span className="cell-libre">—</span>}
              {l.incompatible && <span className="io-incompatible-flag"> ⚠</span>}
            </td>
            <td>
              <span className="point-label">{l.designation || "—"}</span>
            </td>
            <td>
              {l.source ? (
                <span className="point-label">{l.source}</span>
              ) : (
                <span className="cell-libre">—</span>
              )}
            </td>
            <td>{l.signal || "—"}</td>
            {isOut && <td>{l.relay || <span className="cell-libre">—</span>}</td>}
            <td>
              {l.nonAffecte ? (
                <span className="recap-nonaff">non affecté</span>
              ) : (
                <span className="point-label">{l.module || "—"}</span>
              )}
            </td>
            <td className="recap-can">{l.canal || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
