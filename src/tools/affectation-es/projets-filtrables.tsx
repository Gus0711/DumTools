"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CircuitBoard, Search } from "lucide-react";
import { Input } from "@/ui";
import { SupprimerProjet } from "./supprimer-projet";
import type { ProjetResume } from "./queries";

export function ProjetsFiltrables({ projets }: { projets: ProjetResume[] }) {
  const [recherche, setRecherche] = useState("");
  const [client, setClient] = useState("");

  const clients = useMemo(
    () =>
      Array.from(
        new Set(projets.map((p) => p.clientNom.trim()).filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b, "fr")),
    [projets],
  );

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return projets.filter((p) => {
      if (client && p.clientNom.trim() !== client) return false;
      if (!q) return true;
      return (
        p.nom.toLowerCase().includes(q) ||
        p.clientNom.toLowerCase().includes(q) ||
        (p.numeroWhy ?? "").toLowerCase().includes(q) ||
        (p.auteur ?? "").toLowerCase().includes(q)
      );
    });
  }, [projets, recherche, client]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <Input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher (projet, client, auteur)…"
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
          <CircuitBoard className="mx-auto h-8 w-8 text-subtle" />
          <p className="mt-3 text-muted">Aucun projet ne correspond à la recherche.</p>
        </div>
      ) : (
        <div className="data-card">
          <table className="data-table data-table--fit table-cards">
            <thead>
              <tr>
                <th className="w-[26%]">Projet</th>
                <th className="w-[22%]">Client</th>
                <th className="w-[12%]">N° Why</th>
                <th className="w-[11%] cell-num">Modules</th>
                <th className="w-[10%] cell-num">Points</th>
                <th className="w-[15%]">Auteur</th>
                <th className="w-11" />
              </tr>
            </thead>
            <tbody>
              {filtres.map((p) => (
                <tr key={p.id}>
                  <td className="cell-wrap cell-card-title">
                    <Link
                      href={`/outils/affectation-es/${p.id}`}
                      className="cell-title inline-flex items-center gap-2 hover:text-brand"
                    >
                      <CircuitBoard className="h-4 w-4 shrink-0 text-subtle" />
                      {p.nom}
                    </Link>
                  </td>
                  <td data-label="Client" className="cell-wrap">{p.clientNom || "—"}</td>
                  <td data-label="N° Why">
                    {p.numeroWhy ? (
                      <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-fg">
                        {p.numeroWhy}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td data-label="Modules" className="cell-num">{p.nbModules}</td>
                  <td data-label="Points" className="cell-num">{p.nbPoints}</td>
                  <td data-label="Auteur">{p.auteur ?? "—"}</td>
                  <td className="text-right">
                    <SupprimerProjet id={p.id} />
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
