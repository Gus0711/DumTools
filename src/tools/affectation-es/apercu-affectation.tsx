"use client";

/* eslint-disable @next/next/no-img-element */
import { useMemo, type ReactNode } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/ui";
import "./apercu-print.css";
import { signalLabel } from "@/tools/liste-points/model";
import {
  moduleDisplayTitle,
  signalCompatibleBorne,
  type Module,
  type Point,
  type Project,
} from "./model";

/* Aperçu + impression du TABLEAU RÉCAPITULATIF d'affectation E/S (A4 paysage).
 *
 * Distinct du document de l'onglet « Aperçu » (schémas à bornes, une page par
 * module) : ici, une seule vue synthétique liste toutes les entrées puis toutes
 * les sorties avec leur repère, signal, module et canal — ce qu'on relit d'un
 * coup d'œil pour vérifier le câblage.
 *
 * Réutilise l'infrastructure d'impression paysage déjà éprouvée
 * (`apercu-print.css` : `.affectation-doc` + `.io-table` + pages A4 fixes). La
 * pagination est faite ICI, en pages de hauteur fixe, comme le reste du
 * document — pas de flux CSS hasardeux qui risquerait d'être rogné. */

const DISTECH_LOGO = "/materiel/distech-logo.png";
const DUMORTIER_LOGO = "/logo-dumortier.png";

/** Nombre de lignes de tableau qui tiennent sur une page paysage. Volontairement
 *  prudent : la zone de contenu est en `overflow: hidden`, mieux vaut une page
 *  un peu aérée qu'une ligne rognée. La 1re page cède de la place au bloc titre. */
const LIGNES_PAR_PAGE = 20;
const LIGNES_PREMIERE_PAGE = 13;
/** Coût, en « lignes », de l'en-tête d'un tableau (légende + ligne de titres). */
const SURCOUT_SECTION = 2;

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
): BlocPage[][] {
  const pages: BlocPage[][] = [];
  let courante: BlocPage[] = [];
  let occupe = 0;
  let capacite = LIGNES_PREMIERE_PAGE;

  const fermerPage = () => {
    if (courante.length === 0) return;
    pages.push(courante);
    courante = [];
    occupe = 0;
    capacite = LIGNES_PAR_PAGE;
  };

  for (const sec of sections) {
    if (sec.lignes.length === 0) continue;
    let i = 0;
    while (i < sec.lignes.length) {
      const dispo = capacite - occupe - SURCOUT_SECTION;
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
      occupe += SURCOUT_SECTION + prend;
      if (i < sec.lignes.length) fermerPage();
    }
  }
  fermerPage();
  return pages.length > 0 ? pages : [[]];
}

export function ApercuAffectation({
  project,
  modules,
  onFermer,
}: {
  project: Project;
  modules: Module[];
  onFermer: () => void;
}) {
  const { pages, nbEntrees, nbSorties, nonAffectes, incompatibles } = useMemo(() => {
    const actifs = (project.points ?? []).filter((p) => p.active);
    const entrees = trier(actifs.filter((p) => p.direction === "input")).map((p) =>
      versLigne(p, modules),
    );
    const sorties = trier(actifs.filter((p) => p.direction === "output")).map((p) =>
      versLigne(p, modules),
    );
    const pages = paginer([
      { section: "input", titre: "Entrées", lignes: entrees },
      { section: "output", titre: "Sorties", lignes: sorties },
    ]);
    return {
      pages,
      nbEntrees: entrees.length,
      nbSorties: sorties.length,
      nonAffectes: [...entrees, ...sorties].filter((l) => l.nonAffecte).length,
      incompatibles: [...entrees, ...sorties].filter((l) => l.incompatible).length,
    };
  }, [project.points, modules]);

  const total = pages.length;

  return (
    <div>
      {/* Barre d'action — hors .print-root, donc jamais imprimée. */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <Button variant="outline" size="sm" onClick={onFermer}>
          <ArrowLeft className="h-4 w-4" /> Retour à l&apos;édition
        </Button>
        <span className="text-sm text-muted">
          Tableau d&apos;affectation — {nbEntrees} entrée{nbEntrees > 1 ? "s" : ""},{" "}
          {nbSorties} sortie{nbSorties > 1 ? "s" : ""}
        </span>
        <div className="ml-auto">
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Imprimer (A4 paysage)
          </Button>
        </div>
      </div>

      <div className="print-root affectation-doc">
        {pages.map((blocs, idx) => (
          <RecapPage
            key={idx}
            project={project}
            blocs={blocs}
            premiere={idx === 0}
            page={idx + 1}
            total={total}
            nbEntrees={nbEntrees}
            nbSorties={nbSorties}
            nonAffectes={nonAffectes}
            incompatibles={incompatibles}
          />
        ))}
      </div>
    </div>
  );
}

function RecapPage({
  project,
  blocs,
  premiere,
  page,
  total,
  nbEntrees,
  nbSorties,
  nonAffectes,
  incompatibles,
}: {
  project: Project;
  blocs: BlocPage[];
  premiere: boolean;
  page: number;
  total: number;
  nbEntrees: number;
  nbSorties: number;
  nonAffectes: number;
  incompatibles: number;
}) {
  return (
    <section className={`print-page recap-page${premiere ? " first" : ""}`}>
      <div className="doc-header">
        <img className="header-distech-logo" src={DISTECH_LOGO} alt="Distech Controls" />
        <span className="header-title">{project.header || " "}</span>
      </div>

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
              <b>{nbEntrees}</b> entrées &nbsp;·&nbsp; <b>{nbSorties}</b> sorties
            </div>
            {nonAffectes > 0 && (
              <div className="recap-warn">{nonAffectes} non affectée(s)</div>
            )}
            {incompatibles > 0 && (
              <div className="recap-warn">{incompatibles} borne(s) incompatible(s)</div>
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
