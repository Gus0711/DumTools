"use client";

import { useState, useTransition } from "react";
import { Check, CloudUpload, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/ui";
import { synchroniserMaintenant } from "@/tools/documents/actions";
import type { KdriveMarker } from "./model";

/**
 * Bouton générique « Sauvegarder sur kDrive » : génère un PDF (fourni par
 * `genererPdf`), le dépose comme Document de l'affaire (dossier Documentation,
 * versionné) via la route d'upload, force la synchro immédiate, puis remonte le
 * marqueur pour l'affichage d'état. Partagé par la liste de points et le
 * document d'affectation (Aperçu). Désactivé sans affaire rattachée.
 */
export function BoutonSauvegardeKdrive({
  chantierId,
  nomFichier,
  currentHash,
  marker,
  genererPdf,
  onSaved,
  label = "Sauvegarder sur kDrive",
}: {
  chantierId: string | null;
  nomFichier: string;
  currentHash: string;
  marker?: KdriveMarker;
  genererPdf: () => Promise<Blob>;
  onSaved: (m: KdriveMarker) => void;
  label?: string;
}) {
  const [pending, start] = useTransition();
  const [erreur, setErreur] = useState("");

  const etat: "jamais" | "ajour" | "modifie" = !marker
    ? "jamais"
    : marker.hash === currentHash
      ? "ajour"
      : "modifie";

  function sauvegarder() {
    if (!chantierId) return;
    setErreur("");
    start(async () => {
      try {
        const blob = await genererPdf();
        const fd = new FormData();
        fd.set("file", new File([blob], nomFichier, { type: "application/pdf" }));
        fd.set("chantierId", chantierId);
        fd.set("categorie", "Documentation");
        // Même nom (même jour) → écrase/versionne au lieu de renvoyer un doublon (409).
        fd.set("mode", "ecraser");
        const res = await fetch("/api/documents/upload", { method: "POST", body: fd });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          setErreur(j.error || "Échec de la sauvegarde.");
          return;
        }
        // Push immédiat (sans attendre le cron du worker documents-sync).
        try {
          await synchroniserMaintenant(chantierId);
        } catch {
          /* le drain périodique reprendra le dépôt resté en attente */
        }
        onSaved({ savedAt: new Date().toISOString(), hash: currentHash, nom: nomFichier });
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Génération du PDF impossible.");
      }
    });
  }

  const fmt = (iso: string) => new Date(iso).toLocaleDateString("fr-FR");

  return (
    <div className="flex items-center gap-2">
      {chantierId && etat === "ajour" && marker && (
        <span className="inline-flex items-center gap-1 text-xs text-io-do">
          <Check className="h-3.5 w-3.5" /> Sur kDrive · {fmt(marker.savedAt)}
        </span>
      )}
      {chantierId && etat === "modifie" && (
        <span
          className="inline-flex items-center gap-1 text-xs text-io-di"
          title="Le contenu a changé depuis la dernière sauvegarde kDrive"
        >
          <TriangleAlert className="h-3.5 w-3.5" /> Modifié depuis
        </span>
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={pending || !chantierId}
        title={chantierId ? undefined : "Rattache d'abord ce projet à une affaire"}
        onClick={sauvegarder}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
        {label}
      </Button>
      {erreur && <span className="text-xs text-danger">{erreur}</span>}
    </div>
  );
}
