"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Globe, Hash, NotebookPen, Search } from "lucide-react";
import { Input } from "@/ui";
import { fmtDateHeure, fmtRelatif } from "@/lib/dates";
import type { NoteResume } from "./queries";

/* Index des notes : recherche instantanée (titre, affaire, client, n° Why,
 * auteur et même le texte du résumé), table maison en mode cartes sur mobile,
 * extrait du contenu sous chaque titre. */

export function NotesIndex({ notes }: { notes: NoteResume[] }) {
  const [recherche, setRecherche] = useState("");

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) =>
      `${n.titre} ${n.affaireNom} ${n.clientNom} ${n.numeroWhy ?? ""} ${n.auteur ?? ""} ${n.resume}`
        .toLowerCase()
        .includes(q),
    );
  }, [notes, recherche]);

  const nbPartagees = notes.filter((n) => n.partagee).length;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <Input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher une note, une affaire, un client…"
            className="pl-9"
          />
        </div>
        {notes.length > 0 && (
          <p className="text-sm text-subtle">
            {recherche
              ? `${filtrees.length} / ${notes.length} note${notes.length > 1 ? "s" : ""}`
              : `${notes.length} note${notes.length > 1 ? "s" : ""}${
                  nbPartagees > 0
                    ? ` · ${nbPartagees} partagée${nbPartagees > 1 ? "s" : ""}`
                    : ""
                }`}
          </p>
        )}
      </div>

      {filtrees.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-12 text-center">
          <NotebookPen className="mx-auto h-8 w-8 text-subtle" />
          <p className="mt-3 text-muted">
            {notes.length === 0
              ? "Aucune note pour l'instant. Les notes se créent depuis la fiche d'une affaire."
              : "Aucune note ne correspond à la recherche."}
          </p>
        </div>
      ) : (
        <div className="data-card overflow-x-auto">
          <table className="data-table table-cards">
            <thead>
              <tr>
                <th>Note</th>
                <th>Affaire</th>
                <th>Client</th>
                <th>N° Why</th>
                <th>Auteur</th>
                <th>Modifiée</th>
              </tr>
            </thead>
            <tbody>
              {filtrees.map((n) => (
                <tr key={n.id}>
                  <td className="cell-wrap cell-card-title">
                    <Link href={`/outils/notes/${n.id}`} className="group block min-w-0">
                      <span className="cell-title inline-flex max-w-full items-center gap-2 group-hover:text-brand">
                        <NotebookPen className="h-4 w-4 shrink-0 text-subtle" />
                        <span className="min-w-0 truncate">{n.titre}</span>
                        {n.partagee && (
                          <Globe
                            className="h-3.5 w-3.5 shrink-0 text-success"
                            aria-label="Partagée par lien public"
                          />
                        )}
                      </span>
                      {n.resume && n.resume !== "Note vide" && (
                        <span className="mt-0.5 block truncate pl-6 text-xs font-normal text-subtle">
                          {n.resume}
                        </span>
                      )}
                    </Link>
                  </td>
                  <td data-label="Affaire" className="cell-wrap">{n.affaireNom}</td>
                  <td data-label="Client">{n.clientNom}</td>
                  <td data-label="N° Why">
                    {n.numeroWhy ? (
                      <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-fg">
                        <Hash className="h-3 w-3 text-subtle" />
                        {n.numeroWhy}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td data-label="Auteur">{n.auteur ?? "—"}</td>
                  <td data-label="Modifiée">
                    <span suppressHydrationWarning title={fmtDateHeure(n.updatedAt)}>
                      {fmtRelatif(n.updatedAt)}
                    </span>
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
