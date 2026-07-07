"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Building2, Search } from "lucide-react";
import { Input } from "@/ui";
import type { ClientResume } from "./queries";

function fmtDate(d: Date) {
  return new Date(d).toLocaleDateString("fr-FR");
}

export function ClientsIndex({ clients }: { clients: ClientResume[] }) {
  const [recherche, setRecherche] = useState("");

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => c.nom.toLowerCase().includes(q));
  }, [clients, recherche]);

  return (
    <>
      <div className="mb-4 max-w-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <Input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un client…"
            className="pl-9"
          />
        </div>
      </div>

      {filtres.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-12 text-center">
          <Building2 className="mx-auto h-8 w-8 text-subtle" />
          <p className="mt-3 text-muted">
            {clients.length === 0
              ? "Aucun client. Créez le premier ou il sera créé automatiquement depuis un outil."
              : "Aucun client ne correspond à la recherche."}
          </p>
        </div>
      ) : (
        <div className="data-card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Client</th>
                <th className="cell-num">Réalisations</th>
                <th>Modifié</th>
              </tr>
            </thead>
            <tbody>
              {filtres.map((c) => (
                <tr key={c.id}>
                  <td className="cell-wrap">
                    <Link
                      href={`/clients/${c.id}`}
                      className="cell-title inline-flex items-center gap-2 hover:text-brand"
                    >
                      <Building2 className="h-4 w-4 shrink-0 text-subtle" />
                      {c.nom}
                    </Link>
                  </td>
                  <td className="cell-num">{c.nbRealisations}</td>
                  <td>{fmtDate(c.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
