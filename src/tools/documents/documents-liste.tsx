"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, Image as ImageIcon, Loader2, RefreshCw, RotateCw, Trash2 } from "lucide-react";
import { Button } from "@/ui";
import {
  formatTaille,
  STATUT_LABEL,
  STATUT_TON,
  type StatutSync,
} from "./model";
import type { DocResume } from "./queries";
import { relancerSync, supprimerDocument, synchroniserMaintenant } from "./actions";

function fmtDate(d: Date) {
  return new Date(d).toLocaleDateString("fr-FR");
}

/** Vignette kDrive (si le document est synchronisé), sinon icône selon le type. */
function Vignette({ doc }: { doc: DocResume }) {
  const [echec, setEchec] = useState(false);
  const dispo = doc.statutSync === "SYNC" && Boolean(doc.kdriveFileId) && !echec;
  if (dispo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- flux kDrive proxifié, pas d'optimisation Next
      <img
        src={`/api/documents/${doc.id}/thumbnail?w=96`}
        alt=""
        onError={() => setEchec(true)}
        className="h-10 w-10 shrink-0 rounded border border-border-soft bg-surface-2 object-cover"
      />
    );
  }
  const Icon = doc.mimeType?.startsWith("image/") ? ImageIcon : FileText;
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-border-soft bg-surface-2">
      <Icon className="h-5 w-5 text-subtle" />
    </div>
  );
}

function StatutBadge({ statut, erreur }: { statut: StatutSync; erreur: string | null }) {
  return (
    <span
      title={erreur ?? undefined}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATUT_TON[statut]}`}
    >
      {statut === "EN_COURS" && <Loader2 className="h-3 w-3 animate-spin" />}
      {STATUT_LABEL[statut]}
    </span>
  );
}

export function DocumentsListe({
  chantierId,
  docs,
}: {
  chantierId: string;
  docs: DocResume[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [sync, startSync] = useTransition();
  const [bilan, setBilan] = useState<string>("");

  const enAttente = docs.some((d) => d.statutSync === "EN_ATTENTE" || d.statutSync === "ERREUR");

  function agir(id: string, fn: () => Promise<unknown>) {
    setPendingId(id);
    startSync(async () => {
      await fn();
      setPendingId(null);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <FileText className="h-4 w-4 text-muted" />
          Documents
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs tabular-nums text-muted">
            {docs.length}
          </span>
        </h2>
        {enAttente && (
          <Button
            size="sm"
            variant="outline"
            disabled={sync}
            onClick={() =>
              startSync(async () => {
                const b = await synchroniserMaintenant(chantierId);
                setBilan(`${b.traites} traité(s), ${b.erreurs} échec(s)`);
                router.refresh();
              })
            }
          >
            {sync ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Synchroniser maintenant
          </Button>
        )}
      </div>
      {bilan && <p className="mb-2 text-xs text-muted">{bilan}</p>}

      {docs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-10 text-center text-muted">
          Aucun document. Déposez le premier ci-dessus.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
                <th className="px-4 py-2.5 font-medium">Fichier</th>
                <th className="px-4 py-2.5 font-medium">Catégorie</th>
                <th className="px-4 py-2.5 font-medium">Taille</th>
                <th className="px-4 py-2.5 font-medium">kDrive</th>
                <th className="px-4 py-2.5 font-medium">Déposé</th>
                <th className="px-4 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr
                  key={d.id}
                  className="border-b border-border-soft last:border-0 hover:bg-surface-2"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <Vignette doc={d} />
                      <a
                        href={`/api/documents/${d.id}/download`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-fg hover:text-brand"
                      >
                        {d.nom}
                      </a>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted">{d.categorie}</td>
                  <td className="px-4 py-2.5 tabular-nums text-muted">{formatTaille(d.taille)}</td>
                  <td className="px-4 py-2.5">
                    <StatutBadge statut={d.statutSync} erreur={d.syncError} />
                  </td>
                  <td className="px-4 py-2.5 text-muted">{fmtDate(d.createdAt)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <a
                        href={`/api/documents/${d.id}/download`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded p-1.5 text-subtle hover:bg-surface-2 hover:text-fg"
                        title="Télécharger"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                      {d.statutSync === "ERREUR" && (
                        <button
                          onClick={() => agir(d.id, () => relancerSync(d.id))}
                          disabled={pendingId === d.id}
                          className="rounded p-1.5 text-subtle hover:bg-surface-2 hover:text-fg"
                          title="Relancer la synchro"
                        >
                          <RotateCw className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => agir(d.id, () => supprimerDocument(d.id))}
                        disabled={pendingId === d.id}
                        className="rounded p-1.5 text-subtle hover:bg-danger/10 hover:text-danger"
                        title="Supprimer"
                      >
                        {pendingId === d.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
