"use client";

// Liste des RÉPONSES d'un formulaire — mode « tableur » (charte .data-table) :
// une ligne par réponse, colonnes dérivées du schéma courant, recherche plein
// texte, sélection multiple et export CSV. Pensé pour l'analyse au bureau (scan
// rapide, tri visuel) plutôt que des cartes. Clic sur une ligne → la fiche.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ClipboardList,
  Download,
  MapPin,
  Paperclip,
  Search,
  Trash2,
} from "lucide-react";
import { supprimerReponse } from "./actions";
import { estMedia, estPresentation, lienGoogleMaps } from "./model";
import type {
  ChampDef,
  PositionGps,
  RefValue,
  SchemaFormulaire,
  ValeurChamp,
} from "./model";
import type { ReponseMatriceRow } from "./queries";

const dateFr = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const dateSeule = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/** Nombre max de colonnes de valeurs affichées (le CSV, lui, les exporte toutes). */
const MAX_COLONNES = 6;

/** Un champ mérite-t-il une colonne (valeur lisible en une cellule) ? */
function colonneAffichable(c: ChampDef): boolean {
  return !estPresentation(c.type) && !estMedia(c.type);
}

/** Rend une valeur en texte court (cellule de table + CSV). */
function formatValeur(champ: ChampDef, v: ValeurChamp): string {
  if (v == null || v === "") return "";
  switch (champ.type) {
    case "case":
      return v === true ? "Oui" : "Non";
    case "date":
      return typeof v === "string" ? dateSeule.format(new Date(`${v}T12:00:00`)) : "";
    case "dateHeure":
      return typeof v === "string" ? dateFr.format(new Date(v)) : "";
    case "choix":
      return Array.isArray(v) ? v.join(", ") : String(v);
    case "gps": {
      const p = v as { lat: number; lng: number };
      return p.lat != null ? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` : "";
    }
    case "reference": {
      const r = v as RefValue;
      return r?.label ?? "";
    }
    default:
      return String(v);
  }
}

function telechargerCsv(nomFichier: string, contenu: string) {
  // BOM UTF-8 → Excel affiche correctement les accents.
  const blob = new Blob(["﻿" + contenu], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomFichier;
  a.click();
  URL.revokeObjectURL(url);
}

function champCsv(s: string): string {
  const t = s.replace(/\r?\n/g, " ");
  return /[";,]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export function IndexReponses({
  qui,
  formulaireId,
  formulaireNom,
  schema,
  reponsesInitiales,
  estAdmin,
}: {
  qui: string;
  formulaireId: string;
  formulaireNom: string;
  schema: SchemaFormulaire;
  reponsesInitiales: ReponseMatriceRow[];
  /** ADMIN : peut supprimer des réponses. Membre : consultation seule (figées). */
  estAdmin: boolean;
}) {
  const router = useRouter();
  const [reponses, setReponses] = useState(reponsesInitiales);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<string | null>(null);

  const base = `/perso/${qui}/formulaires/${formulaireId}/reponses`;
  const colonnesTotales = useMemo(
    () => schema.filter(colonneAffichable),
    [schema],
  );
  const colonnes = colonnesTotales.slice(0, MAX_COLONNES);
  const colMasquees = colonnesTotales.length - colonnes.length;

  const filtrees = useMemo(() => {
    const r = q.trim().toLowerCase();
    if (!r) return reponses;
    return reponses.filter((rep) => {
      if (rep.titre.toLowerCase().includes(r)) return true;
      if (rep.auteur?.toLowerCase().includes(r)) return true;
      return colonnesTotales.some((c) =>
        formatValeur(c, rep.valeurs[c.id] ?? null)
          .toLowerCase()
          .includes(r),
      );
    });
  }, [q, reponses, colonnesTotales]);

  async function supprimer(id: string) {
    setConfirm(null);
    setReponses((l) => l.filter((r) => r.id !== id));
    setSel((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
    await supprimerReponse(id);
    router.refresh();
  }

  function basculer(id: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const tousSel = filtrees.length > 0 && filtrees.every((r) => sel.has(r.id));
  function basculerTout() {
    setSel(tousSel ? new Set() : new Set(filtrees.map((r) => r.id)));
  }

  function exporter() {
    const cible =
      sel.size > 0 ? filtrees.filter((r) => sel.has(r.id)) : filtrees;
    const entetes = [
      "Réponse",
      ...colonnesTotales.map((c) => c.libelle || "Sans libellé"),
      "Auteur",
      "Pièces",
      "Reçue le",
    ];
    const lignes = cible.map((r) =>
      [
        r.titre || "Sans titre",
        ...colonnesTotales.map((c) => formatValeur(c, r.valeurs[c.id] ?? null)),
        r.auteur ?? "",
        String(r.nbMedias),
        dateFr.format(new Date(r.createdAt)),
      ]
        .map(champCsv)
        .join(";"),
    );
    const nom = `${(formulaireNom || "formulaire")
      .replace(/[^\p{L}\p{N}_-]+/gu, "-")
      .slice(0, 40)}-reponses.csv`;
    telechargerCsv(nom, [entetes.map(champCsv).join(";"), ...lignes].join("\r\n"));
  }

  if (reponses.length === 0) {
    return (
      <div className="data-card flex flex-col items-center gap-3 border-dashed p-12 text-center">
        <ClipboardList className="h-8 w-8 text-subtle" />
        <p className="text-muted">
          Aucune réponse pour l&apos;instant. Les réponses remplies sur le terrain
          apparaîtront ici dès leur synchronisation.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* ---- barre d'outils ---- */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher dans les réponses…"
            className="h-9 w-full rounded-md border border-border bg-surface pl-8 pr-3 text-sm text-fg placeholder:text-subtle hover:border-brand/40 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </label>
        <div className="ml-auto flex items-center gap-2">
          {sel.size > 0 && (
            <span className="text-xs text-muted">
              {sel.size} sélectionnée{sel.size > 1 ? "s" : ""}
            </span>
          )}
          <button
            onClick={exporter}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg shadow-sm hover:border-brand/40"
          >
            <Download className="h-4 w-4" />
            Exporter{" "}
            <span className="hidden sm:inline">
              {sel.size > 0 ? "la sélection" : "en CSV"}
            </span>
          </button>
        </div>
      </div>

      {/* ---- table ---- */}
      <div className="data-card">
        <div className="overflow-x-auto">
          <table className="data-table data-table--form">
            <thead>
              <tr>
                <th style={{ width: "2.5rem" }}>
                  <input
                    type="checkbox"
                    aria-label="Tout sélectionner"
                    checked={tousSel}
                    onChange={basculerTout}
                    className="accent-brand"
                  />
                </th>
                <th className="cell-wrap">Réponse</th>
                {colonnes.map((c) => (
                  <th key={c.id}>{c.libelle || "Sans libellé"}</th>
                ))}
                <th>Auteur</th>
                <th className="cell-num" title="Pièces jointes">
                  <Paperclip className="mx-auto h-3.5 w-3.5" />
                </th>
                <th>Reçue</th>
                {estAdmin && <th style={{ width: "2.5rem" }} />}
              </tr>
            </thead>
            <tbody>
              {filtrees.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => router.push(`${base}/${r.id}`)}
                  className="cursor-pointer"
                >
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label="Sélectionner"
                      checked={sel.has(r.id)}
                      onChange={() => basculer(r.id)}
                      className="accent-brand"
                    />
                  </td>
                  <td className="cell-title cell-wrap">
                    <Link
                      href={`${base}/${r.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="hover:text-brand hover:underline"
                    >
                      {r.titre || "Réponse sans titre"}
                    </Link>
                  </td>
                  {colonnes.map((c) => {
                    const v = r.valeurs[c.id] ?? null;
                    if (
                      c.type === "gps" &&
                      v &&
                      typeof v === "object" &&
                      "lat" in v
                    ) {
                      const p = v as PositionGps;
                      return (
                        <td key={c.id} onClick={(e) => e.stopPropagation()}>
                          <a
                            href={lienGoogleMaps(p.lat, p.lng)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-brand hover:underline"
                          >
                            <MapPin className="h-3.5 w-3.5 shrink-0" />
                            <span className="tabular-nums">
                              {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                            </span>
                          </a>
                        </td>
                      );
                    }
                    const t = formatValeur(c, v);
                    return (
                      <td key={c.id} title={t}>
                        {t || <span className="text-subtle">—</span>}
                      </td>
                    );
                  })}
                  <td>{r.auteur ?? <span className="text-subtle">—</span>}</td>
                  <td className="cell-num">
                    {r.nbMedias > 0 ? (
                      r.nbMedias
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </td>
                  <td className="tabular-nums">
                    {dateFr.format(new Date(r.createdAt))}
                  </td>
                  {estAdmin && (
                    <td onClick={(e) => e.stopPropagation()}>
                      {confirm === r.id ? (
                        <span className="flex items-center gap-1 whitespace-nowrap text-xs">
                          <button
                            onClick={() => supprimer(r.id)}
                            className="rounded px-1.5 py-1 font-medium text-danger hover:bg-danger/10"
                          >
                            Oui
                          </button>
                          <button
                            onClick={() => setConfirm(null)}
                            className="rounded px-1.5 py-1 text-muted hover:bg-surface-2"
                          >
                            Non
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirm(r.id)}
                          title="Supprimer"
                          className="rounded-md p-1.5 text-subtle hover:bg-danger/10 hover:text-danger"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {filtrees.length === 0 && (
                <tr>
                  <td
                    colSpan={colonnes.length + (estAdmin ? 6 : 5)}
                    className="py-8 text-center text-sm text-subtle"
                  >
                    Aucune réponse ne correspond à « {q} ».
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {colMasquees > 0 && (
        <p className="mt-2 text-xs text-subtle">
          {colMasquees} colonne{colMasquees > 1 ? "s" : ""} de plus dans le
          détail — ouvre une réponse pour tout voir, ou exporte en CSV (toutes
          les colonnes).
        </p>
      )}
    </div>
  );
}
