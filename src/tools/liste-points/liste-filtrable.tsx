"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Search } from "lucide-react";
import { Input } from "@/ui";
import { SupprimerListe } from "./supprimer-liste";
import type { ListeResume } from "./queries";

function fmtDate(d: Date | null) {
  return d ? new Date(d).toLocaleDateString("fr-FR") : "—";
}

export function ListeFiltrable({ docs }: { docs: ListeResume[] }) {
  const [recherche, setRecherche] = useState("");
  const [client, setClient] = useState("");

  const clients = useMemo(
    () =>
      Array.from(new Set(docs.map((d) => d.clientNom.trim()).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b, "fr"),
      ),
    [docs],
  );

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return docs.filter((d) => {
      if (client && d.clientNom.trim() !== client) return false;
      if (!q) return true;
      return (
        d.titre.toLowerCase().includes(q) ||
        d.clientNom.toLowerCase().includes(q) ||
        d.chantierNom.toLowerCase().includes(q) ||
        (d.numeroWhy ?? "").toLowerCase().includes(q) ||
        (d.auteur ?? "").toLowerCase().includes(q)
      );
    });
  }, [docs, recherche, client]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <Input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher (titre, client, chantier, auteur)…"
            className="pl-9"
          />
        </div>
        <select
          value={client}
          onChange={(e) => setClient(e.target.value)}
          className="h-10 max-w-52 rounded-md border border-border bg-surface px-2.5 text-sm text-fg shadow-sm transition-[border-color,box-shadow] duration-150 hover:border-brand/40 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        >
          <option value="">Tous les clients</option>
          {clients.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {filtres.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-12 text-center">
          <FileText className="mx-auto h-8 w-8 text-subtle" />
          <p className="mt-3 text-muted">Aucune liste ne correspond à la recherche.</p>
        </div>
      ) : (
        <div className="data-card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Titre</th>
                <th>Chantier</th>
                <th>N° Why</th>
                <th className="cell-num">Points</th>
                <th>Date</th>
                <th>Auteur</th>
                <th>Modifié</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {filtres.map((d) => (
                <tr key={d.id}>
                  <td className="cell-wrap">
                    <Link
                      href={`/outils/liste-points/${d.id}`}
                      className="cell-title inline-flex items-center gap-2 hover:text-brand"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-subtle" />
                      {d.titre}
                    </Link>
                  </td>
                  <td className="cell-wrap">{d.chantierNom || "—"}</td>
                  <td>
                    {d.numeroWhy ? (
                      <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-fg">
                        {d.numeroWhy}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="cell-num">{d.nbPoints}</td>
                  <td>{fmtDate(d.date)}</td>
                  <td>{d.auteur ?? "—"}</td>
                  <td>{fmtDate(d.updatedAt)}</td>
                  <td className="text-right">
                    <SupprimerListe id={d.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
