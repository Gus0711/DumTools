"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2, Plus, Search, Tags, Trash2 } from "lucide-react";
import { Badge, Button, Input, Label } from "@/ui";
import { cn } from "@/lib/cn";
import {
  enregistrerNomenclature,
  marquerPointSansMateriel,
  supprimerNomenclature,
} from "./actions";
import type { PointAvecNomenclature } from "./queries";
import type { ProduitChoix } from "./saisie-mouvement";

/* =============================================================================
 * LA NOMENCLATURE DES POINTS
 * « Sonde T° gaine » ne coûte pas qu'une entrée analogique : elle appelle une
 * sonde, un doigt de gant, un presse-étoupe. C'est ce tableau qui rend la BOM
 * d'une affaire dérivable depuis la simple liste de points — le plus gros
 * levier du magasin.
 * ========================================================================== */

export function Nomenclature({
  points,
  produits,
}: {
  points: PointAvecNomenclature[];
  produits: ProduitChoix[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [seulementVides, setSeulementVides] = useState(false);
  const [ajout, setAjout] = useState<{
    pointId: string;
    recherche: string;
    quantite: string;
  } | null>(null);

  const filtres = useMemo(() => {
    const f = q.trim().toLowerCase();
    return points.filter((p) => {
      if (seulementVides && (p.lignes.length > 0 || p.sansMateriel)) return false;
      if (!f) return true;
      return (
        p.nom.toLowerCase().includes(f) ||
        p.lignes.some(
          (l) =>
            l.refInterne.toLowerCase().includes(f) || l.designation.toLowerCase().includes(f),
        )
      );
    });
  }, [points, q, seulementVides]);

  const nbVides = points.filter((p) => p.lignes.length === 0 && !p.sansMateriel).length;

  function run(action: () => Promise<void>, apres?: () => void) {
    setErreur(null);
    startTransition(async () => {
      try {
        await action();
        apres?.();
        router.refresh();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Erreur inattendue");
      }
    });
  }

  const resultats = (recherche: string) => {
    const f = recherche.trim().toLowerCase();
    if (!f) return produits.slice(0, 8);
    return produits
      .filter(
        (p) =>
          p.refInterne.toLowerCase().includes(f) ||
          p.designation.toLowerCase().includes(f) ||
          (p.refFabricant ?? "").toLowerCase().includes(f),
      )
      .slice(0, 8);
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Chercher un point ou un produit…"
            className="pl-8"
          />
        </div>
        <Button
          variant={seulementVides ? "accent" : "outline"}
          onClick={() => setSeulementVides((v) => !v)}
        >
          <Tags className="h-4 w-4" />
          Sans nomenclature
          {nbVides > 0 && <span className="ml-1 tabular-nums">({nbVides})</span>}
        </Button>
        {pending && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
      </div>

      {erreur && (
        <div className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {erreur}
        </div>
      )}

      <div className="data-card divide-y divide-hairline">
        {filtres.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-subtle">Aucun point.</p>
        )}
        {filtres.map((p) => (
          <div key={p.id} className="px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-medium text-fg">{p.nom}</span>
              <Badge tone="neutral">{p.type}</Badge>
              {p.sansMateriel ? (
                <Badge tone="neutral">Aucun matériel</Badge>
              ) : (
                p.lignes.length === 0 && (
                  <span className="text-xs text-subtle">
                    Aucun produit — ce point sera signalé comme non chiffré dans les BOM.
                  </span>
                )
              )}
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                title={
                  p.sansMateriel
                    ? "Ce point redeviendra à chiffrer"
                    : "Ce point ne demande aucun matériel — il cessera d'être signalé"
                }
                onClick={() =>
                  run(() =>
                    marquerPointSansMateriel({ nom: p.nom, valeur: !p.sansMateriel }),
                  )
                }
              >
                <Ban className="h-4 w-4" />
                {p.sansMateriel ? "À chiffrer" : "Aucun matériel"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setAjout(
                    ajout?.pointId === p.id
                      ? null
                      : { pointId: p.id, recherche: "", quantite: "1" },
                  )
                }
              >
                <Plus className="h-4 w-4" /> Produit
              </Button>
            </div>

            {p.lignes.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {p.lignes.map((l) => (
                  <li
                    key={l.id}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs",
                      l.optionnel && "opacity-70",
                    )}
                  >
                    <span className="tabular-nums text-muted">{l.quantite} ×</span>
                    <span className="ref">{l.refInterne}</span>
                    <span className="text-fg">{l.designation}</span>
                    {l.optionnel && <span className="text-subtle">(option)</span>}
                    <button
                      type="button"
                      aria-label="Retirer"
                      onClick={() => run(() => supprimerNomenclature(l.id))}
                      className="text-subtle transition-colors hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {ajout?.pointId === p.id && (
              <div className="mt-2 border border-hairline p-3">
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <Label>Produit</Label>
                    <Input
                      autoFocus
                      value={ajout.recherche}
                      onChange={(e) => setAjout({ ...ajout, recherche: e.target.value })}
                      placeholder="Chercher…"
                      className="mt-1"
                    />
                  </div>
                  <div className="w-20">
                    <Label>Qté</Label>
                    <Input
                      type="number"
                      min={1}
                      value={ajout.quantite}
                      onChange={(e) => setAjout({ ...ajout, quantite: e.target.value })}
                      className="mt-1 tabular-nums"
                    />
                  </div>
                </div>
                <ul className="mt-2 max-h-44 overflow-y-auto border border-hairline">
                  {resultats(ajout.recherche).map((prod) => (
                    <li key={prod.id}>
                      <button
                        type="button"
                        onClick={() =>
                          run(
                            () =>
                              enregistrerNomenclature({
                                pointCatalogId: p.id,
                                produitId: prod.id,
                                quantite: Math.max(1, Number(ajout.quantite) || 1),
                              }),
                            () => setAjout(null),
                          )
                        }
                        className="flex w-full items-baseline gap-2 border-b border-hairline px-3 py-2 text-left text-sm transition-colors last:border-0 hover:bg-surface-2"
                      >
                        <span className="ref shrink-0">{prod.refInterne}</span>
                        <span className="min-w-0 flex-1 truncate text-fg">{prod.designation}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
