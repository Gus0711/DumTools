"use client";

import { useState, useTransition } from "react";
import { Ban, Loader2, Plus, Shuffle, Star, Trash2 } from "lucide-react";
import { Badge, Button, Input, Label } from "@/ui";
import { cn } from "@/lib/cn";
import {
  enregistrerNomenclature,
  marquerPointSansMateriel,
  supprimerNomenclature,
} from "./actions";
import type { PointAvecNomenclature } from "./queries";

/** Nom du groupe de variantes créé depuis l'interface. Le modèle en accepte
 *  plusieurs par point ; en pratique un seul suffit — « la fourniture de ce
 *  point », déclinée en Milesight ou en Enless. */
const GROUPE_PAR_DEFAUT = "Fourniture";
import type { ProduitChoix } from "./saisie-mouvement";

/* =============================================================================
 * LE MATÉRIEL D'UN POINT — un bloc, trois portes
 *
 * C'est la SOURCE des lignes de BOM dérivées : « Commande chaudière » appelle
 * un relai et sa base, et c'est ici que ça se décide. On l'ouvre donc partout
 * où la question se pose plutôt que sur un écran qu'il faut connaître :
 *   · l'écran Nomenclature du magasin (l'entretien au calme) ;
 *   · la configuration des points (le catalogue, avec le nom et le type) ;
 *   · la ligne de besoin d'une affaire (là où on VOIT que c'est faux).
 *
 * Un seul composant : trois copies auraient divergé au premier correctif. Et
 * le rappel est écrit sur le bloc — le réglage vaut pour TOUTES les affaires,
 * c'est sa force et c'est son danger.
 * ========================================================================== */

export function MaterielPoint({
  point,
  produits,
  peutGerer = true,
  compact = false,
  onFait,
}: {
  point: PointAvecNomenclature;
  produits: ProduitChoix[];
  peutGerer?: boolean;
  /** Rendu resserré (dépliage dans une ligne de tableau). */
  compact?: boolean;
  /** Appelé après une écriture réussie — pour rafraîchir l'écran hôte. */
  onFait?: () => void;
}) {
  const [pending, start] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [ajout, setAjout] = useState<{ recherche: string; quantite: string } | null>(null);

  function run(action: () => Promise<void>, apres?: () => void) {
    setErreur(null);
    start(async () => {
      try {
        await action();
        apres?.();
        onFait?.();
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
    <div className={cn(compact && "border-t border-hairline bg-surface-2 px-4 py-3")}>
      {compact && (
        <p className="stamp mb-2">
          Matériel appelé par « {point.nom} » — vaut pour toutes les affaires
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!compact && (
          <>
            <span className="font-medium text-fg">{point.nom}</span>
            <Badge tone="neutral">{point.type}</Badge>
          </>
        )}
        {point.sansMateriel ? (
          <Badge tone="neutral">Aucun matériel</Badge>
        ) : (
          point.lignes.length === 0 && (
            <span className="text-xs text-subtle">
              Aucun produit — ce point sera signalé comme non chiffré dans les BOM.
            </span>
          )
        )}
        {pending && <Loader2 className="h-4 w-4 animate-spin text-muted" />}

        {peutGerer && (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              disabled={pending}
              title={
                point.sansMateriel
                  ? "Ce point redeviendra à chiffrer"
                  : "Ce point ne demande aucun matériel — il cessera d'être signalé"
              }
              onClick={() =>
                run(() =>
                  marquerPointSansMateriel({ nom: point.nom, valeur: !point.sansMateriel }),
                )
              }
            >
              <Ban className="h-4 w-4" />
              {point.sansMateriel ? "À chiffrer" : "Aucun matériel"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                setAjout(ajout ? null : { recherche: "", quantite: "1" })
              }
            >
              <Plus className="h-4 w-4" /> Produit
            </Button>
          </>
        )}
      </div>

      {erreur && (
        <p className="mt-2 text-sm text-danger">{erreur}</p>
      )}

      {point.lignes.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {point.lignes.map((l) => (
            <li
              key={l.id}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-xs",
                l.optionnel && "opacity-70",
              )}
            >
              <span className="tabular-nums text-muted">{l.quantite} ×</span>
              <span className="ref">{l.refInterne}</span>
              <span className="text-fg">{l.designation}</span>
              {l.optionnel && <span className="text-subtle">(option)</span>}
              {l.variante && (
                <span className="text-subtle">
                  au choix{l.parDefaut ? " · défaut" : ""}
                </span>
              )}
              {peutGerer && (
                <>
                  <button
                    type="button"
                    // « Au choix » : cette ligne devient une des fournitures
                    // possibles, jamais additionnée aux autres du même groupe.
                    title={
                      l.variante
                        ? "Repasser en fourniture systématique"
                        : "Cette ligne est une fourniture possible parmi d'autres"
                    }
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        enregistrerNomenclature({
                          pointCatalogId: point.id,
                          produitId: l.produitId,
                          quantite: l.quantite,
                          optionnel: l.optionnel,
                          variante: l.variante ? null : GROUPE_PAR_DEFAUT,
                          parDefaut: false,
                        }),
                      )
                    }
                    className="text-subtle transition-colors hover:text-brand disabled:opacity-50"
                  >
                    <Shuffle className="h-3.5 w-3.5" />
                  </button>
                  {l.variante && (
                    <button
                      type="button"
                      title={
                        l.parDefaut
                          ? "Ne plus proposer par défaut"
                          : "Retenir par défaut quand l'affaire n'a rien choisi"
                      }
                      disabled={pending}
                      onClick={() =>
                        run(() =>
                          enregistrerNomenclature({
                            pointCatalogId: point.id,
                            produitId: l.produitId,
                            quantite: l.quantite,
                            optionnel: l.optionnel,
                            variante: l.variante,
                            parDefaut: !l.parDefaut,
                          }),
                        )
                      }
                      className={cn(
                        "transition-colors disabled:opacity-50",
                        l.parDefaut ? "text-brand" : "text-subtle hover:text-brand",
                      )}
                    >
                      <Star className="h-3.5 w-3.5" />
                    </button>
                  )}
                </>
              )}
              {peutGerer && (
                <button
                  type="button"
                  aria-label={`Retirer ${l.refInterne}`}
                  disabled={pending}
                  onClick={() => run(() => supprimerNomenclature(l.id))}
                  className="text-subtle transition-colors hover:text-danger disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {ajout && peutGerer && (
        <div className="mt-2 border border-hairline bg-surface p-3">
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
                          pointCatalogId: point.id,
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
  );
}
