import { Download, FileText, FolderOpen } from "lucide-react";
import { formatTaille } from "./model";
import { listerFichiersKdrive } from "./queries";

/** Miroir LECTURE SEULE : fichiers présents dans le dossier kDrive de l'affaire
 *  mais non déposés via DumTools, groupés par sous-dossier. Async → à envelopper
 *  dans un <Suspense> pour ne pas retarder la liste principale. */
export async function MiroirKdrive({ chantierId }: { chantierId: string }) {
  const groupes = await listerFichiersKdrive(chantierId);
  const total = groupes.reduce((n, g) => n + g.fichiers.length, 0);
  if (total === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
        <FolderOpen className="h-4 w-4 text-muted" />
        Aussi sur kDrive
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs tabular-nums text-muted">
          {total}
        </span>
      </h2>
      <p className="mb-3 mt-1 text-xs text-muted">
        Fichiers présents dans le dossier kDrive de l&apos;affaire mais non déposés via
        DumTools — lecture seule.
      </p>

      <div className="space-y-5">
        {groupes.map((g) => (
          <div key={g.dossier}>
            <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-subtle">
              {g.dossier === "(racine)" ? "Dossier de l'affaire" : g.dossier}
            </h3>
            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              {g.fichiers.map((f) => (
                <a
                  key={f.fileId}
                  href={`/api/documents/kdrive/${f.fileId}/download?nom=${encodeURIComponent(f.nom)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 border-b border-border-soft px-4 py-2.5 last:border-0 hover:bg-surface-2"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-border-soft bg-surface-2">
                    <FileText className="h-4 w-4 text-subtle" />
                  </div>
                  <span className="flex-1 truncate font-medium text-fg">{f.nom}</span>
                  {f.taille > 0 && (
                    <span className="shrink-0 tabular-nums text-xs text-muted">
                      {formatTaille(f.taille)}
                    </span>
                  )}
                  <Download className="h-4 w-4 shrink-0 text-subtle" />
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
