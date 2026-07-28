"use client";

// Bloc « Scans » de la fiche Affaire : ce que le Scanner a produit pour ce
// chantier, groupé par jour et exportable. Lecture seule — l'édition (note,
// rattachement, suppression) reste dans l'outil, dont le lien est affiché.
//
// Composant client uniquement pour l'export CSV et le repli des jours ; les
// données arrivent déjà résolues du serveur.

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Download, ExternalLink, ScanLine } from "lucide-react";
import { Button } from "@/ui";
import { estLignePhoto, estModem, formatLabel } from "./model";
import type { ModemScanRow } from "./queries";
import { cleJour, libelleJour } from "./periodes";
import { resumeLot, telechargerCsv } from "./export";
import { urlPhoto, VignettesPhotos, Visionneuse } from "./photos";

const fmtHeure = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
});

export function ScansAffaire({
  scans,
  affaireNom,
  hrefOutil,
}: {
  scans: ModemScanRow[];
  affaireNom: string;
  /** Lien vers le Scanner (espace perso du propriétaire de l'outil). */
  hrefOutil: string;
}) {
  const [replies, setReplies] = useState<Set<string>>(new Set());
  const [apercu, setApercu] = useState<string | null>(null);

  const jours = useMemo(() => {
    const m = new Map<string, { cle: string; libelle: string; lignes: ModemScanRow[] }>();
    for (const s of scans) {
      const d = new Date(s.scanneLe);
      const cle = cleJour(d);
      const g = m.get(cle);
      if (g) g.lignes.push(s);
      else m.set(cle, { cle, libelle: libelleJour(d), lignes: [s] });
    }
    return [...m.values()];
  }, [scans]);

  const basculer = useCallback((cle: string) => {
    setReplies((prev) => {
      const next = new Set(prev);
      if (next.has(cle)) next.delete(cle);
      else next.add(cle);
      return next;
    });
  }, []);

  const total = resumeLot(scans);

  return (
    <>
      {apercu && <Visionneuse url={apercu} onFermer={() => setApercu(null)} />}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
            <ScanLine className="h-4 w-4 text-muted" />
            Scans
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs tabular-nums text-muted">
              {scans.length}
            </span>
          </h2>
          <p className="mt-1 text-xs text-subtle">
            Codes scannés sur cette affaire{total.modems > 0 && `, dont ${total.modems} modem${total.modems > 1 ? "s" : ""}`}
            {total.photos > 0 && ` · ${total.photos} photo${total.photos > 1 ? "s" : ""}`}
            . Groupés par jour.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => telechargerCsv(scans, affaireNom)}
          >
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Link
            href={hrefOutil}
            className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-brand"
          >
            Ouvrir le Scanner <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto border border-hairline bg-surface">
        <table className="table-cards w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
              <th className="px-4 py-2.5 font-medium">Réseau / Contenu</th>
              <th className="px-4 py-2.5 font-medium">Type</th>
              <th className="px-4 py-2.5 font-medium">N° série</th>
              <th className="px-4 py-2.5 font-medium">IMEI</th>
              <th className="px-4 py-2.5 font-medium">Photos</th>
              <th className="px-4 py-2.5 font-medium">Groupe</th>
              <th className="px-4 py-2.5 font-medium">Note</th>
              <th className="px-4 py-2.5 font-medium whitespace-nowrap">Heure</th>
            </tr>
          </thead>
          {jours.map((j) => {
            const replie = replies.has(j.cle);
            return (
              <tbody key={j.cle}>
                <tr className="border-b border-border-soft bg-surface-2">
                  <td colSpan={8} className="cell-card-title px-3 py-1.5">
                    <div className="flex w-full items-center gap-2">
                      <button
                        type="button"
                        onClick={() => basculer(j.cle)}
                        aria-expanded={!replie}
                        className="flex min-w-0 items-center gap-1.5 rounded p-0.5 text-left hover:text-brand"
                      >
                        <ChevronRight
                          className={`h-3.5 w-3.5 shrink-0 text-subtle transition-transform ${
                            replie ? "" : "rotate-90"
                          }`}
                        />
                        <span className="truncate text-sm font-semibold text-fg">
                          {j.libelle}
                        </span>
                      </button>
                      <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-xs tabular-nums text-muted">
                        {j.lignes.length}
                      </span>
                      <button
                        type="button"
                        onClick={() => telechargerCsv(j.lignes, `${affaireNom} ${j.cle}`)}
                        title="Exporter cette journée en CSV"
                        className="ml-auto shrink-0 rounded p-1 text-subtle hover:bg-surface hover:text-brand"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
                {!replie &&
                  j.lignes.map((l) => (
                    <tr key={l.id} className="border-b border-border-soft hover:bg-surface-2">
                      <td data-label="Réseau / Contenu" className="cell-card-title px-4 py-2.5 font-medium text-fg">
                        {estModem(l) ? (
                          (l.ssid ?? "—")
                        ) : estLignePhoto(l) ? (
                          <span className="text-xs font-normal italic text-subtle">
                            Photo seule (aucun code)
                          </span>
                        ) : (
                          <span
                            className="block max-w-[22rem] truncate font-mono text-xs font-normal text-muted"
                            title={l.raw}
                          >
                            {l.raw}
                          </span>
                        )}
                      </td>
                      <td data-label="Type" className="px-4 py-2.5">
                        <span
                          className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                            estModem(l) ? "bg-brand-soft text-brand" : "bg-surface-2 text-muted"
                          }`}
                        >
                          {formatLabel(l.format, l)}
                        </span>
                      </td>
                      <td data-label="N° série" className="px-4 py-2.5 tabular-nums text-muted">
                        {l.serie ?? "—"}
                      </td>
                      <td data-label="IMEI" className="px-4 py-2.5 tabular-nums text-muted">
                        {l.imei ?? "—"}
                      </td>
                      <td data-label="Photos" className="px-4 py-2.5">
                        {/* Lecture seule : l'ajout et la suppression se font
                            dans le Scanner, pas depuis la fiche affaire. */}
                        <VignettesPhotos
                          photos={l.photos}
                          onOuvrir={(ph) => setApercu(urlPhoto(ph))}
                        />
                      </td>
                      <td data-label="Groupe" className="px-4 py-2.5 text-muted">
                        {l.groupe ?? "—"}
                      </td>
                      <td data-label="Note" className="px-4 py-2.5 text-muted">
                        {l.note || "—"}
                      </td>
                      <td data-label="Heure" className="px-4 py-2.5 whitespace-nowrap text-xs text-muted">
                        {fmtHeure.format(new Date(l.scanneLe))}
                        {l.auteur && <span className="block text-subtle">{l.auteur}</span>}
                      </td>
                    </tr>
                  ))}
              </tbody>
            );
          })}
        </table>
      </div>
    </>
  );
}
