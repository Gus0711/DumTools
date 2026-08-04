"use client";

/* eslint-disable @next/next/no-img-element */
import { useLayoutEffect, useRef, useState } from "react";
import "./impression-print.css";
import { ES_TYPES, IO_TYPES, type Io, type IoType, type PointRow } from "./model";

const PXMM = 96 / 25.4;
/** Hauteur utile d'une page : celle de `.print-page` (surface A4 hors marges
 *  d'impression, voir impression-print.css). */
const PAGE_H = 271 * PXMM;
/** Garde-fou : mieux vaut une page un peu creuse qu'une ligne coupée au massicot. */
const SECURITE = 24;

const LOGO = "/logo-dumortier.png";

/** Libellé de la case de synthèse, en deux lignes (la case est étroite). */
const LIB_SYNTHESE: Record<IoType, [string, string]> = {
  AI: ["entrées", "analogiques"],
  DI: ["entrées", "logiques"],
  AO: ["sorties", "analogiques"],
  DO: ["sorties", "logiques"],
  COM: ["objets", "communicants"],
};

function vide(): Io {
  return { AI: 0, DI: 0, AO: 0, DO: 0, COM: 0 };
}
function cumuler(somme: Io, r: PointRow) {
  if (r.kind === "point" && r.io) for (const k of IO_TYPES) somme[k] += r.io[k] ? 1 : 0;
}
function totalES(somme: Io) {
  return ES_TYPES.reduce((s, k) => s + somme[k], 0);
}
function fmtDate(v: string | null) {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleDateString("fr-FR");
}

// --- Lignes du document ----------------------------------------------------
// Le tableau imprimé ne reprend pas les lignes brutes : on y intercale les
// sous-totaux de section et on numérote les points en continu.

type LignePrint =
  | { t: "section"; cle: string; nom: string }
  | { t: "point"; cle: string; n: number; r: PointRow }
  | { t: "soustotal"; cle: string; nom: string; somme: Io };

function construireLignes(rows: PointRow[]): LignePrint[] {
  const out: LignePrint[] = [];
  let n = 0;
  let section = "";
  let somme = vide();
  let contenu = false;

  const clore = () => {
    if (section && contenu) {
      out.push({ t: "soustotal", cle: `st-${out.length}`, nom: section, somme });
    }
    somme = vide();
    contenu = false;
  };

  for (const r of rows) {
    if (r.kind === "section") {
      clore();
      section = r.nom || "";
      out.push({ t: "section", cle: r.id, nom: section });
    } else {
      n += 1;
      out.push({ t: "point", cle: r.id, n, r });
      cumuler(somme, r);
      contenu = true;
    }
  }
  clore();
  return out;
}

export interface ImpressionProps {
  clientNom: string;
  chantierNom: string;
  date: string | null;
  rows: PointRow[];
  /** Référence de l'affaire dans WhySoft — estampille du document. */
  numeroWhy?: string;
  /** Nom du projet d'automate (un chantier peut en porter plusieurs). */
  projetNom?: string;
  version?: string;
  /** Référence de l'automate, quand elle est déjà arrêtée. */
  automate?: string;
}

/** Document imprimable : cartouche, synthèse, tableau paginé A4 avec
 *  sous-total par section, sous-total par page et total général. */
export function Impression({
  clientNom,
  chantierNom,
  date,
  rows,
  numeroWhy,
  projetNom,
  version,
  automate,
}: ImpressionProps) {
  const refTete1 = useRef<HTMLDivElement>(null);
  const refTeteN = useRef<HTMLDivElement>(null);
  const refThead = useRef<HTMLTableSectionElement>(null);
  const refTbody = useRef<HTMLTableSectionElement>(null);
  const refTfoot = useRef<HTMLTableSectionElement>(null);
  const refPied = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<LignePrint[][]>([]);

  const lignes = construireLignes(rows);

  // Totaux du document (indépendants de la pagination).
  const grand = vide();
  let nbPoints = 0;
  for (const r of rows) {
    if (r.kind !== "point") continue;
    cumuler(grand, r);
    nbPoints += 1;
  }
  const grandES = totalES(grand);

  const titre = chantierNom || clientNom || "Liste de points";
  const soustitre = chantierNom ? clientNom : "";

  const empreinte = JSON.stringify([rows, clientNom, chantierNom, date, numeroWhy, projetNom, version, automate]);

  useLayoutEffect(() => {
    const tbody = refTbody.current;
    if (!tbody || !refTete1.current || !refTeteN.current || !refThead.current || !refTfoot.current || !refPied.current) {
      return;
    }
    const hTete1 = refTete1.current.getBoundingClientRect().height;
    const hTeteN = refTeteN.current.getBoundingClientRect().height;
    const hThead = refThead.current.getBoundingClientRect().height;
    const hTfoot = refTfoot.current.getBoundingClientRect().height;
    const hPied = refPied.current.getBoundingClientRect().height;
    const hauteurs = Array.from(tbody.children).map((el) => el.getBoundingClientRect().height);

    const resultat: LignePrint[][] = [];
    let courante: LignePrint[] = [];
    let occupe = 0;
    let premiere = true;
    const budget = () => PAGE_H - (premiere ? hTete1 : hTeteN) - hThead - hTfoot - hPied - SECURITE;

    lignes.forEach((l, i) => {
      const h = hauteurs[i] ?? 0;
      if (courante.length && occupe + h > budget()) {
        resultat.push(courante);
        courante = [];
        occupe = 0;
        premiere = false;
      }
      courante.push(l);
      occupe += h;
    });
    if (courante.length) resultat.push(courante);

    // Ni un titre de section, ni un titre suivi d'un seul point ne restent
    // seuls en bas de page : ils descendent avec leur contenu.
    for (let i = 0; i < resultat.length - 1; i++) {
      const pg = resultat[i];
      while (pg.length && pg[pg.length - 1].t === "section") {
        resultat[i + 1].unshift(pg.pop()!);
      }
    }
    setPages(resultat.filter((p) => p.length));
    // `lignes` est dérivé de `rows` : l'empreinte couvre toutes les entrées.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empreinte]);

  const tete1 = (
    <TetePremiere
      titre={titre}
      soustitre={soustitre}
      numeroWhy={numeroWhy}
      projetNom={projetNom}
      version={version}
      automate={automate}
      date={date}
      grand={grand}
      nbPoints={nbPoints}
      grandES={grandES}
    />
  );
  const teteN = <TeteSuite titre={titre} client={soustitre} numeroWhy={numeroWhy} />;
  const pied = <DocPied titre={titre} numeroWhy={numeroWhy} page={1} total={1} />;

  return (
    <>
      {/* Passe de mesure : le document complet, hors écran mais avec layout. */}
      <div className="liste-doc liste-mesure" aria-hidden>
        <div ref={refTete1}>{tete1}</div>
        <div ref={refTeteN}>{teteN}</div>
        <table className="pts">
          <Colonnes />
          <thead ref={refThead}>
            <LigneEntete />
          </thead>
          <tbody ref={refTbody}>
            {lignes.map((l) => (
              <LigneCorps key={`m-${l.cle}`} l={l} />
            ))}
          </tbody>
          <tfoot ref={refTfoot}>
            <LigneTotal label="Total général" somme={vide()} general />
          </tfoot>
        </table>
        <div ref={refPied}>{pied}</div>
      </div>

      <div className="liste-doc print-root" aria-hidden>
        {pages.map((pg, idx) => {
          const derniere = idx === pages.length - 1;
          const sous = vide();
          for (const l of pg) if (l.t === "point") cumuler(sous, l.r);
          return (
            <section key={idx} className="print-page">
              {idx === 0 ? tete1 : teteN}
              <table className="pts">
                <Colonnes />
                <thead>
                  <LigneEntete />
                </thead>
                <tbody>
                  {pg.map((l) => (
                    <LigneCorps key={l.cle} l={l} />
                  ))}
                </tbody>
                <tfoot>
                  {derniere ? (
                    <LigneTotal
                      label={`Total général — ${grandES} E/S physiques`}
                      somme={grand}
                      general
                    />
                  ) : (
                    <LigneTotal
                      label={`Sous-total page ${idx + 1} — ${totalES(sous)} E/S`}
                      somme={sous}
                    />
                  )}
                </tfoot>
              </table>
              <DocPied titre={titre} numeroWhy={numeroWhy} page={idx + 1} total={pages.length} />
            </section>
          );
        })}
      </div>
    </>
  );
}

// --- Cartouche & têtes ------------------------------------------------------

function Bandeau() {
  return (
    <div className="bandeau">
      <i className="b1" />
      <i className="b2" />
    </div>
  );
}

function TetePremiere({
  titre,
  soustitre,
  numeroWhy,
  projetNom,
  version,
  automate,
  date,
  grand,
  nbPoints,
  grandES,
}: {
  titre: string;
  soustitre: string;
  numeroWhy?: string;
  projetNom?: string;
  version?: string;
  automate?: string;
  date: string | null;
  grand: Io;
  nbPoints: number;
  grandES: number;
}) {
  const refs: [string, string][] = [
    ["Réf. affaire", numeroWhy || ""],
    ["Projet", projetNom || ""],
    ["Version", version || ""],
    ["Établie le", fmtDate(date)],
    ["Automate", automate || ""],
  ];
  return (
    <>
      <Bandeau />
      <header className="doc-tete">
        <div className="txt">
          <p className="surtitre">Liste de points · GTB / GTC</p>
          <h1>{titre}</h1>
          {soustitre && (
            <p className="soustitre">
              <b>{soustitre}</b>
            </p>
          )}
        </div>
        <div className="marque">
          <img src={LOGO} alt="Dumortier — Groupe Fareneït" />
          {numeroWhy && <div className="ref-pill">{numeroWhy}</div>}
        </div>
      </header>
      <div className="filet" />
      <p className="meta">
        {refs
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <span key={k}>
              <b>{k}</b> · {v}
            </span>
          ))}
      </p>
      <Synthese grand={grand} nbPoints={nbPoints} grandES={grandES} />
    </>
  );
}

function Synthese({ grand, nbPoints, grandES }: { grand: Io; nbPoints: number; grandES: number }) {
  return (
    <div className="synthese">
      {IO_TYPES.map((k) => {
        const [l1, l2] = LIB_SYNTHESE[k];
        return (
          <div className={`cell s-${k.toLowerCase()}`} key={k}>
            <div className="k">
              <b>{k}</b> · {l1}
              <br />
              {l2}
            </div>
            <div className="v">{grand[k]}</div>
          </div>
        );
      })}
      <div className="cell bilan">
        <div className="k">
          Points
          <br />
          listés
        </div>
        <div className="v">{nbPoints}</div>
      </div>
      <div className="cell bilan">
        <div className="k">
          E/S
          <br />
          physiques
        </div>
        <div className="v">{grandES}</div>
      </div>
    </div>
  );
}

function TeteSuite({ titre, client, numeroWhy }: { titre: string; client: string; numeroWhy?: string }) {
  return (
    <>
      <Bandeau />
      <div className="tete-suite">
        <span className="stamp">Liste de points · GTB / GTC</span>
        <span className="suite">
          {titre}
          {client && (
            <>
              {" "}
              <i>·</i> {client}
            </>
          )}
        </span>
        {numeroWhy && <span className="ref">{numeroWhy}</span>}
      </div>
    </>
  );
}

function DocPied({
  titre,
  numeroWhy,
  page,
  total,
}: {
  titre: string;
  numeroWhy?: string;
  page: number;
  total: number;
}) {
  return (
    <footer className="doc-pied">
      <div>
        <b>DUMORTIER</b> — Groupe Fareneït · Liste de points GTB / GTC
      </div>
      <div>
        {titre}
        {numeroWhy && (
          <>
            {" "}
            <i>·</i> {numeroWhy}
          </>
        )}
      </div>
      <div>
        Page {page} / {total}
      </div>
    </footer>
  );
}

// --- Tableau ----------------------------------------------------------------

function Colonnes() {
  return (
    <colgroup>
      <col className="c-num" />
      <col className="c-nom" />
      <col className="c-libre" />
      {IO_TYPES.map((k) => (
        <col className="c-io" key={k} />
      ))}
    </colgroup>
  );
}

function LigneEntete() {
  return (
    <tr>
      <th className="num">N°</th>
      <th>Nom du point</th>
      <th>Texte libre</th>
      {IO_TYPES.map((k) => (
        <th className={`io h-${k.toLowerCase()}`} key={k}>
          <span>{k}</span>
        </th>
      ))}
    </tr>
  );
}

function LigneCorps({ l }: { l: LignePrint }) {
  if (l.t === "section") {
    return (
      <tr className="sep">
        <td colSpan={IO_TYPES.length + 3}>{l.nom}</td>
      </tr>
    );
  }
  if (l.t === "soustotal") {
    return (
      <tr className="st">
        <td colSpan={3}>
          Sous-total · {l.nom} — {totalES(l.somme)} E/S
        </td>
        {IO_TYPES.map((k) => (
          <td className="io" key={k}>
            {l.somme[k] || ""}
          </td>
        ))}
      </tr>
    );
  }
  const r = l.r;
  // Le signal complète le texte libre : le protocole pour un objet communicant,
  // le type de sonde ou de commande pour une E/S. « D » (contact sec) n'apprend
  // rien de plus que la colonne DI/DO — on ne l'imprime pas.
  const signal = r.signal && r.signal !== "D" ? r.signal : "";
  const com = !!r.io?.COM;
  return (
    <tr className={l.n % 2 === 0 ? "pair" : undefined}>
      <td className="num">{l.n}</td>
      <td className="nom">{r.nom || ""}</td>
      <td className="libre">
        {signal && <span className={com ? "proto" : "sig"}>{signal}</span>}
        {signal && r.note ? " · " : ""}
        {r.note || ""}
      </td>
      {IO_TYPES.map((k) => (
        <td className="io" key={k}>
          {r.io?.[k] ? <span className={`pastille p-${k.toLowerCase()}`}>{k}</span> : ""}
        </td>
      ))}
    </tr>
  );
}

function LigneTotal({ label, somme, general }: { label: string; somme: Io; general?: boolean }) {
  return (
    <tr className={general ? "tg" : "tp"}>
      <td colSpan={3}>{label}</td>
      {IO_TYPES.map((k) => (
        <td className="io" key={k}>
          {somme[k] || 0}
        </td>
      ))}
    </tr>
  );
}
