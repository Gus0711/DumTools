"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CloudUpload, Loader2, TriangleAlert, X } from "lucide-react";
import { Button, Label } from "@/ui";
import { CATEGORIES, formatTaille, TAILLE_MAX, type Categorie } from "./model";

export function Depot({ chantierId }: { chantierId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fichier, setFichier] = useState<File | null>(null);
  const [categorie, setCategorie] = useState<Categorie>("Documentation");
  const [erreur, setErreur] = useState("");
  const [doublon, setDoublon] = useState(false);
  const [pending, start] = useTransition();

  function choisir(f: File | null) {
    setErreur("");
    setDoublon(false);
    if (f && f.size > TAILLE_MAX) {
      setErreur(`« ${f.name} » dépasse 500 Mo.`);
      return;
    }
    setFichier(f);
  }

  function envoyer(mode: "" | "ecraser" | "renommer") {
    if (!fichier) return;
    setErreur("");
    start(async () => {
      const fd = new FormData();
      fd.set("file", fichier);
      fd.set("chantierId", chantierId);
      fd.set("categorie", categorie);
      if (mode) fd.set("mode", mode);
      const res = await fetch("/api/documents/upload", { method: "POST", body: fd });
      if (res.status === 409) {
        setDoublon(true);
        return;
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErreur(j.error || "Échec du dépôt.");
        return;
      }
      setFichier(null);
      setDoublon(false);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <Label>Catégorie (sous-dossier kDrive)</Label>
          <select
            value={categorie}
            onChange={(e) => setCategorie(e.target.value as Categorie)}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          choisir(e.dataTransfer.files?.[0] ?? null);
        }}
        className="mt-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface-2 px-4 py-8 text-center transition-colors hover:border-brand"
      >
        <CloudUpload className="h-7 w-7 text-subtle" />
        {fichier ? (
          <span className="text-sm text-fg">
            {fichier.name}{" "}
            <span className="text-muted">({formatTaille(fichier.size)})</span>
          </span>
        ) : (
          <span className="text-sm text-muted">
            Glissez un fichier ici, ou cliquez pour choisir (max 500 Mo, tout type)
          </span>
        )}
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => choisir(e.target.files?.[0] ?? null)}
        />
      </label>

      {erreur && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-danger">
          <TriangleAlert className="h-4 w-4" /> {erreur}
        </p>
      )}

      {doublon ? (
        <div className="mt-3 rounded-md border border-border bg-surface-2 p-3">
          <p className="flex items-center gap-1.5 text-sm text-fg">
            <TriangleAlert className="h-4 w-4 text-io-di" />
            Un fichier « {fichier?.name} » existe déjà dans « {categorie} ».
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => envoyer("ecraser")} disabled={pending}>
              Écraser (nouvelle version)
            </Button>
            <Button size="sm" variant="outline" onClick={() => envoyer("renommer")} disabled={pending}>
              Renommer (garder les deux)
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDoublon(false)} disabled={pending}>
              <X className="h-4 w-4" /> Annuler
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex justify-end">
          <Button onClick={() => envoyer("")} disabled={pending || !fichier}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
            Déposer
          </Button>
        </div>
      )}
    </div>
  );
}
