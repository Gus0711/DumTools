"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Loader2, Printer, TriangleAlert } from "lucide-react";
import { Button, Combobox, type ComboOption } from "@/ui";
import { type ModeleDef, type PointRow } from "./model";
import { sauverDocument } from "./actions";
import { Impression } from "./impression";
import { GenererGfx } from "./generer-gfx";
import { RowsEditor, type CatalogItem } from "./rows-editor";

export function Editeur({
  id,
  initial,
  clients,
  catalogue,
  modeles,
}: {
  id: string;
  initial: {
    clientNom: string;
    chantierNom: string;
    numeroWhy: string;
    date: string | null;
    rows: PointRow[];
  };
  clients: string[];
  catalogue: CatalogItem[];
  modeles: ModeleDef[];
}) {
  const [rows, setRows] = useState<PointRow[]>(initial.rows);
  const [clientNom, setClientNom] = useState(initial.clientNom);
  const [chantierNom, setChantierNom] = useState(initial.chantierNom);
  const [numeroWhy, setNumeroWhy] = useState(initial.numeroWhy);
  const [date, setDate] = useState(initial.date ?? "");
  const [save, setSave] = useState<"saved" | "saving" | "error">("saved");

  const clientOptions = useMemo<ComboOption[]>(
    () => clients.map((c) => ({ value: c })),
    [clients],
  );

  // Autosave (débounce)
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(async () => {
      setSave("saving");
      try {
        await sauverDocument(id, { clientNom, chantierNom, numeroWhy, date: date || null, rows });
        setSave("saved");
      } catch {
        setSave("error");
      }
    }, 700);
    return () => clearTimeout(t);
  }, [rows, clientNom, chantierNom, numeroWhy, date, id]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-6 md:px-10">
      <div className="mb-4 flex items-center justify-between gap-4">
        <Link
          href="/outils/liste-points"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"
        >
          <ArrowLeft className="h-4 w-4" /> Listes
        </Link>
        <div className="flex items-center gap-3">
          <SaveState state={save} />
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Imprimer
          </Button>
        </div>
      </div>

      {/* Métadonnées du document */}
      <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted">Client</span>
          <Combobox
            value={clientNom}
            onInput={setClientNom}
            onPick={(o) => setClientNom(o.value)}
            options={clientOptions}
            placeholder="Rechercher un client…"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted">Chantier</span>
          <input
            value={chantierNom}
            onChange={(e) => setChantierNom(e.target.value)}
            placeholder="Nom du chantier"
            className="h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg placeholder:text-subtle"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted">N° Why</span>
          <input
            value={numeroWhy}
            onChange={(e) => setNumeroWhy(e.target.value)}
            placeholder="Réf. affaire WhySoft"
            className="h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg placeholder:text-subtle"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg"
          />
        </label>
      </div>

      <RowsEditor
        rows={rows}
        setRows={setRows}
        catalogue={catalogue}
        modeles={modeles}
        toolbarExtra={
          <GenererGfx
            rows={rows}
            projectName={chantierNom || clientNom || "Projet"}
            chantier={chantierNom}
            client={clientNom}
            date={date}
          />
        }
      />

      {/* Vue imprimable (masquée à l'écran, révélée à l'impression) */}
      <Impression clientNom={clientNom} chantierNom={chantierNom} date={date || null} rows={rows} />
    </div>
  );
}

function SaveState({ state }: { state: "saved" | "saving" | "error" }) {
  if (state === "saving")
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Enregistrement…
      </span>
    );
  if (state === "error")
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-danger">
        <TriangleAlert className="h-4 w-4" /> Erreur d’enregistrement
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-success">
      <Check className="h-4 w-4" /> Enregistré
    </span>
  );
}
