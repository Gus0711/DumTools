"use client";

import { useEffect, useState, useTransition } from "react";
import { Boxes, TriangleAlert } from "lucide-react";
import { Badge, Button, EnteteBloc } from "@/ui";
import { cn } from "@/lib/cn";
import { apercuReprise, reprendreBom, type ApercuReprise } from "./actions";
import { formatEuros } from "./model";

/* =============================================================================
 * REPRENDRE LE MATÉRIEL D'UNE AFFAIRE
 *
 * On MONTRE avant de verser : la BOM d'une affaire contient des lignes qu'on ne
 * vend pas (hors fourniture) et des trous qu'elle ne sait pas chiffrer. Les
 * verser en silence donnerait un devis faux sans que personne ne l'ait décidé.
 *
 * Et une fois versé, c'est COPIÉ : la BOM continuera d'évoluer avec l'affaire,
 * le devis restera ce qui a été chiffré (principe n°1).
 * ========================================================================== */

export function RepriseBom({
  devisId,
  chantierId,
  chantierNom,
  onFerme,
  onFini,
}: {
  devisId: string;
  chantierId: string;
  chantierNom: string;
  onFerme: () => void;
  onFini: () => void;
}) {
  const [apercu, setApercu] = useState<ApercuReprise | null>(null);
  const [choisis, setChoisis] = useState<Set<string>>(new Set());
  const [titreLot, setTitreLot] = useState("Fourniture");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  useEffect(() => {
    let vivant = true;
    apercuReprise(chantierId)
      .then((a) => {
        if (!vivant) return;
        setApercu(a);
        // Présélection : tout ce qui est réellement de notre fourniture. Le
        // reste reste visible mais décoché — c'est une décision, pas un oubli.
        setChoisis(new Set(a.lignes.filter((l) => !l.horsFourniture).map((l) => l.produitId)));
      })
      .catch((e) => vivant && setErreur(e instanceof Error ? e.message : "Lecture impossible"));
    return () => {
      vivant = false;
    };
  }, [chantierId]);

  function basculer(produitId: string) {
    setChoisis((s) => {
      const n = new Set(s);
      if (n.has(produitId)) n.delete(produitId);
      else n.add(produitId);
      return n;
    });
  }

  function verser() {
    setErreur(null);
    demarrer(async () => {
      try {
        await reprendreBom(devisId, chantierId, [...choisis], { titreLot });
        onFini();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Reprise impossible");
      }
    });
  }

  return (
    <div className="bloc anim-rise signal-ai mt-4">
      <EnteteBloc
        icone={Boxes}
        titre={`Matériel de ${chantierNom}`}
        mention="dérivé de la nomenclature de l'affaire"
        actions={
          <button onClick={onFerme} className="text-sm text-muted hover:text-fg">
            Fermer
          </button>
        }
      />

      {!apercu ? (
        <p className="px-3 py-6 text-center text-sm text-subtle">Lecture de la nomenclature…</p>
      ) : (
        <div className="p-3">
          {apercu.projets.length > 0 && (
            <p className="mb-3 text-xs text-subtle">
              Dérivé de {apercu.projets.length} projet GTB : {apercu.projets.map((p) => p.nom).join(", ")}
            </p>
          )}

          {/* Ce que la BOM ne sait pas chiffrer est annoncé — jamais versé en
              silence, jamais tu. */}
          {apercu.trous.length > 0 && (
            <p className="mb-3 flex items-start gap-2 border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-fg">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              <span>
                {apercu.trous.length} élément{apercu.trous.length > 1 ? "s" : ""}{" "}
                de l&apos;affaire
                n&apos;{apercu.trous.length > 1 ? "ont" : "a"} pas de matériel connu (
                {apercu.trous.map((t) => t.nom).slice(0, 4).join(", ")}
                {apercu.trous.length > 4 ? "…" : ""}) : rien ne sera versé pour {apercu.trous.length > 1 ? "eux" : "lui"}.
                Ça se répare sur l&apos;écran Matériel de l&apos;affaire.
              </span>
            </p>
          )}

          {apercu.lignes.length === 0 ? (
            <p className="py-6 text-center text-sm text-subtle">
              Cette affaire n&apos;a encore aucun matériel dérivable.
            </p>
          ) : (
            <>
              <div className="max-h-80 overflow-y-auto border border-border">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="w-8" />
                      <th>Article</th>
                      <th className="cell-num">Besoin</th>
                      <th className="cell-num">Déboursé</th>
                      <th>Origine</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apercu.lignes.map((l) => (
                      <tr
                        key={l.produitId}
                        className={cn(l.horsFourniture && "opacity-60")}
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={choisis.has(l.produitId)}
                            onChange={() => basculer(l.produitId)}
                            className="h-4 w-4 accent-[var(--brand)]"
                          />
                        </td>
                        <td className="cell-wrap">
                          <span className="ref mr-2 text-subtle">{l.refInterne}</span>
                          {l.designation}
                          {l.horsFourniture && (
                            <Badge tone="neutral" className="ml-2">
                              Hors fourniture
                            </Badge>
                          )}
                        </td>
                        <td className="cell-num">
                          {l.besoin} {l.unite}
                        </td>
                        <td className="cell-num">
                          {l.debourseCents === null ? (
                            <span className="text-warning">sans prix</span>
                          ) : (
                            formatEuros(l.debourseCents)
                          )}
                        </td>
                        <td className="cell-wrap text-xs text-subtle">
                          {l.origines.slice(0, 2).join(" · ")}
                          {l.origines.length > 2 ? ` +${l.origines.length - 2}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {erreur && <p className="mt-3 text-sm text-danger">{erreur}</p>}

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="text-sm text-muted">
                  Dans le lot
                  <input
                    value={titreLot}
                    onChange={(e) => setTitreLot(e.target.value)}
                    className="ml-2 h-8 rounded-md border border-border bg-surface px-2 text-sm text-fg"
                  />
                </label>
                <Button onClick={verser} disabled={enCours || choisis.size === 0}>
                  {enCours ? "Reprise…" : `Verser ${choisis.size} ligne${choisis.size > 1 ? "s" : ""}`}
                </Button>
                <p className="text-xs text-subtle">
                  Les lignes sont copiées : le devis ne suivra plus les évolutions de l&apos;affaire.
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
