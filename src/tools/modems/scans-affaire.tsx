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
import { Button, EnteteBloc } from "@/ui";
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

      {/* Le bleu du signal « AI » — celui du Scanner dans le registre. */}
      <section className="bloc signal-ai">
        <EnteteBloc
          icone={ScanLine}
          titre="Scans"
          compteur={scans.length}
          mention={[
            total.modems > 0 && `${total.modems} modem${total.modems > 1 ? "s" : ""}`,
            total.photos > 0 && `${total.photos} photo${total.photos > 1 ? "s" : ""}`,
            "groupés par jour",
          ]
            .filter(Boolean)
            .join(" · ")}
          actions={
            <>
              <Link
                href={hrefOutil}
                className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-fg"
              >
                Ouvrir le Scanner <ExternalLink className="h-3.5 w-3.5" />
              </Link>
              <Button size="sm" variant="outline" onClick={() => telechargerCsv(scans, affaireNom)}>
                <Download className="h-4 w-4" /> Export CSV
              </Button>
            </>
          }
        />

        <div className="overflow-x-auto">
          <table className="data-table table-cards">
            <thead>
              <tr>
                <th>Réseau / Contenu</th>
                <th>Type</th>
                <th>N° série</th>
                <th>IMEI</th>
                <th>Photos</th>
                <th>Groupe</th>
                <th>Note</th>
                <th>Heure</th>
              </tr>
            </thead>
            {jours.map((j) => {
            const replie = replies.has(j.cle);
            return (
              <tbody key={j.cle}>
                {/* Le bandeau du jour : même grain que l'entête d'un bloc. */}
                <tr className="bg-surface-2">
                  <td colSpan={8} className="cell-card-title !py-1.5">
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
                        <span className="font-display truncate text-sm font-semibold text-fg">
                          {j.libelle}
                        </span>
                      </button>
                      <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 font-mono text-xs tabular-nums text-muted">
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
                    <tr key={l.id}>
                      <td
                        data-label="Réseau / Contenu"
                        className="cell-title cell-card-title cell-wrap"
                      >
                        {estModem(l) ? (
                          (l.ssid ?? "—")
                        ) : estLignePhoto(l) ? (
                          <span className="text-xs font-normal italic text-subtle">
                            Photo seule (aucun code)
                          </span>
                        ) : (
                          <span
                            className="ref block max-w-[22rem] truncate font-normal text-muted"
                            title={l.raw}
                          >
                            {l.raw}
                          </span>
                        )}
                      </td>
                      <td data-label="Type">
                        <span
                          className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                            estModem(l) ? "bg-brand-soft text-brand" : "bg-surface-2 text-muted"
                          }`}
                        >
                          {formatLabel(l.format, l)}
                        </span>
                      </td>
                      <td data-label="N° série" className="ref">
                        {l.serie ?? "—"}
                      </td>
                      <td data-label="IMEI" className="ref">
                        {l.imei ?? "—"}
                      </td>
                      <td data-label="Photos">
                        {/* Lecture seule : l'ajout et la suppression se font
                            dans le Scanner, pas depuis la fiche affaire. */}
                        <VignettesPhotos
                          photos={l.photos}
                          onOuvrir={(ph) => setApercu(urlPhoto(ph))}
                        />
                      </td>
                      <td data-label="Groupe">{l.groupe ?? "—"}</td>
                      <td data-label="Note" className="cell-wrap">
                        {l.note || "—"}
                      </td>
                      <td data-label="Heure" className="text-xs">
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
      </section>
    </>
  );
}
