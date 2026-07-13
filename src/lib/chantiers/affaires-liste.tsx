"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Briefcase, Hash, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Combobox, type ComboOption } from "@/ui";
import type { EtatAffaire } from "@/generated/prisma/enums";
import type { AffaireResume } from "./queries";
import { ETATS_ACTIFS, ETATS_AFFAIRE } from "./etats";
import { EtatBadge, ETAT_TONE } from "./etat-badge";

function fmtDate(d: Date) {
  return new Date(d).toLocaleDateString("fr-FR");
}

/** Normalise pour une recherche insensible à la casse / aux accents. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function AffairesListe({ affaires }: { affaires: AffaireResume[] }) {
  const [query, setQuery] = useState("");
  // Par défaut : uniquement les affaires actives (Devis, Commande, En cours) —
  // Livrée / Clôturée / Corbeille restent accessibles en cliquant leur puce.
  const [etats, setEtats] = useState<Set<EtatAffaire>>(new Set(ETATS_ACTIFS));
  const [client, setClient] = useState("");

  // Clients réellement présents dans les affaires (pour l'autocomplétion).
  const clientOptions = useMemo<ComboOption[]>(
    () =>
      Array.from(new Set(affaires.map((a) => a.clientNom)))
        .sort((a, b) => a.localeCompare(b))
        .map((c) => ({ value: c })),
    [affaires],
  );

  const filtrees = useMemo(() => {
    const q = norm(query.trim());
    const cl = norm(client.trim());
    return affaires.filter((a) => {
      if (etats.size > 0 && !etats.has(a.etat)) return false;
      if (cl && !norm(a.clientNom).includes(cl)) return false;
      if (q) {
        const cible = norm(`${a.nom} ${a.clientNom} ${a.numeroWhy ?? ""}`);
        if (!cible.includes(q)) return false;
      }
      return true;
    });
  }, [affaires, query, etats, client]);

  function toggleEtat(e: EtatAffaire) {
    setEtats((prev) => {
      const next = new Set(prev);
      if (next.has(e)) next.delete(e);
      else next.add(e);
      return next;
    });
  }

  const etatsParDefaut =
    etats.size === ETATS_ACTIFS.length && ETATS_ACTIFS.every((e) => etats.has(e));
  const filtreActif = query.trim() !== "" || client !== "" || !etatsParDefaut;
  function reinitialiser() {
    setQuery("");
    setEtats(new Set(ETATS_ACTIFS));
    setClient("");
  }

  return (
    <div>
      {/* --- Barre de recherche + filtres --- */}
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher (nom, client, n° Why)…"
              className={cn(
                "h-9 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm text-fg",
                "placeholder:text-subtle focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20",
              )}
            />
          </div>

          <div className="w-56">
            <Combobox
              value={client}
              onInput={setClient}
              onPick={(o) => setClient(o.value)}
              options={clientOptions}
              placeholder="Filtrer par client…"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {ETATS_AFFAIRE.map((e) => {
            const actif = etats.has(e.value);
            return (
              <button
                key={e.value}
                type="button"
                onClick={() => toggleEtat(e.value)}
                aria-pressed={actif}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-all",
                  ETAT_TONE[e.value],
                  actif
                    ? "border-current opacity-100"
                    : "border-transparent opacity-45 hover:opacity-80",
                )}
              >
                {e.label}
              </button>
            );
          })}

          {filtreActif && (
            <button
              type="button"
              onClick={reinitialiser}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-muted hover:text-fg"
            >
              <X className="h-3.5 w-3.5" /> Réinitialiser
            </button>
          )}

          <span className="ml-auto text-xs tabular-nums text-subtle">
            {filtrees.length} / {affaires.length} affaire{affaires.length > 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* --- Tableau --- */}
      {filtrees.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-12 text-center text-muted">
          Aucune affaire ne correspond aux filtres.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="table-cards w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
                <th className="px-4 py-2.5 font-medium">Affaire</th>
                <th className="px-4 py-2.5 font-medium">Client</th>
                <th className="px-4 py-2.5 font-medium">N° Why</th>
                <th className="px-4 py-2.5 font-medium">État</th>
                <th className="px-4 py-2.5 font-medium">Réalisations</th>
                <th className="px-4 py-2.5 font-medium">Modifié</th>
              </tr>
            </thead>
            <tbody>
              {filtrees.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-border-soft last:border-0 hover:bg-surface-2"
                >
                  <td className="cell-card-title px-4 py-2.5">
                    <Link
                      href={`/affaires/${a.id}`}
                      className="inline-flex items-center gap-2 font-medium text-fg hover:text-brand"
                    >
                      <Briefcase className="h-4 w-4 text-subtle" />
                      {a.nom}
                    </Link>
                  </td>
                  <td data-label="Client" className="px-4 py-2.5 text-muted">{a.clientNom}</td>
                  <td data-label="N° Why" className="px-4 py-2.5 text-muted">
                    {a.numeroWhy ? (
                      <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-fg">
                        <Hash className="h-3 w-3 text-subtle" />
                        {a.numeroWhy}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td data-label="État" className="px-4 py-2.5">
                    <EtatBadge etat={a.etat} />
                  </td>
                  <td data-label="Réalisations" className="px-4 py-2.5 tabular-nums text-muted">{a.nbRealisations}</td>
                  <td data-label="Modifié" className="px-4 py-2.5 text-muted">{fmtDate(a.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
