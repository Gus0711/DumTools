"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { Button, Input, Label } from "@/ui";
import { enregistrerProduit, type SaisieProduit } from "./actions";
import {
  CATEGORIES,
  CATEGORIE_LABEL,
  formatEuros,
  parseEuros,
  type CategorieProduit,
} from "./model";
import type { FournisseurVue } from "./queries";

/** Valeur du select qui déplie la saisie d'un nouveau fournisseur. */
const NOUVEAU = "__NOUVEAU__";

/* =============================================================================
 * FICHE D'IDENTITÉ D'UN PRODUIT
 * Deux références : l'INTERNE (la nôtre, imprimable, qui survit à un changement
 * de gamme) et celle du FABRICANT. Le reste est optionnel — un produit doit
 * pouvoir se créer en dix secondes au milieu d'une réception.
 *
 * Le fournisseur et son prix sont ICI, pas dans un écran à part : un produit =
 * un fournisseur (docs/MAGASIN.md §3). Et le fournisseur peut se créer d'un
 * mot, sans quitter le formulaire.
 * ========================================================================== */

export interface ProduitEdition extends SaisieProduit {
  id?: string;
}

const selectCls =
  "mt-1 h-[var(--control-h)] w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg";

export function EditeurProduit({
  initial,
  fournisseurs,
  produits = [],
  peutPrix,
  onFermer,
}: {
  initial?: Partial<ProduitEdition>;
  fournisseurs: FournisseurVue[];
  /** Les autres produits, pour désigner un remplaçant (obsolescence). */
  produits?: { id: string; refInterne: string; designation: string }[];
  /** Sans le droit de voir les prix, on n'affiche pas le volet achat. */
  peutPrix: boolean;
  onFermer: (id?: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const [refInterne, setRefInterne] = useState(initial?.refInterne ?? "");
  const [refFabricant, setRefFabricant] = useState(initial?.refFabricant ?? "");
  const [designation, setDesignation] = useState(initial?.designation ?? "");
  const [marque, setMarque] = useState(initial?.marque ?? "");
  const [categorie, setCategorie] = useState<CategorieProduit>(
    (initial?.categorie as CategorieProduit) ?? "AUTRE",
  );
  const [unite, setUnite] = useState(initial?.unite ?? "U");
  const [serialisable, setSerialisable] = useState(Boolean(initial?.serialisable));
  const [seuilMini, setSeuilMini] = useState(String(initial?.seuilMini ?? 0));
  const [emplacement, setEmplacement] = useState(initial?.emplacement ?? "");
  const [docUrl, setDocUrl] = useState(initial?.docUrl ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [fournisseurId, setFournisseurId] = useState(initial?.fournisseurId ?? "");
  const [fournisseurNom, setFournisseurNom] = useState("");
  const [refFournisseur, setRefFournisseur] = useState(initial?.refFournisseur ?? "");
  const [prixAchat, setPrixAchat] = useState(
    initial?.prixAchatCents != null
      ? (initial.prixAchatCents / 100).toFixed(2).replace(".", ",")
      : "",
  );
  const [delaiJours, setDelaiJours] = useState(
    initial?.delaiJours != null ? String(initial.delaiJours) : "",
  );
  const [remplaceParId, setRemplaceParId] = useState(initial?.remplaceParId ?? "");

  function valider() {
    setErreur(null);
    startTransition(async () => {
      try {
        const { id } = await enregistrerProduit({
          id: initial?.id,
          refInterne,
          refFabricant,
          designation,
          marque,
          categorie,
          unite,
          serialisable,
          seuilMini: Number(seuilMini) || 0,
          emplacement,
          docUrl,
          note,
          fournisseurId: fournisseurId === NOUVEAU ? null : fournisseurId || null,
          fournisseurNom: fournisseurId === NOUVEAU ? fournisseurNom : null,
          refFournisseur,
          prixAchatCents: peutPrix ? parseEuros(prixAchat) : undefined,
          delaiJours: delaiJours.trim() === "" ? null : Number(delaiJours),
          remplaceParId: remplaceParId || null,
        });
        router.refresh();
        onFermer(id);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Erreur inattendue");
      }
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={initial?.id ? "Modifier le produit" : "Nouveau produit"}
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
    >
      <button
        type="button"
        aria-label="Fermer"
        onClick={() => onFermer()}
        className="anim-fade absolute inset-0 bg-black/55 backdrop-blur-sm"
      />

      <div className="anim-rise bg-surface relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden border border-border">
        <div className="bloc-entete shrink-0">
          <span className="font-display text-sm font-semibold text-fg">
            {initial?.id ? "Modifier le produit" : "Nouveau produit"}
          </span>
          <button
            type="button"
            onClick={() => onFermer()}
            aria-label="Fermer"
            className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded text-muted transition-colors hover:bg-surface-2"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Référence interne *</Label>
              <Input
                autoFocus
                value={refInterne}
                onChange={(e) => setRefInterne(e.target.value)}
                placeholder="ECY-303"
                className="mt-1 font-mono"
              />
              <p className="mt-1 text-xs text-muted">La nôtre — elle ne changera plus.</p>
            </div>
            <div>
              <Label>Référence fabricant</Label>
              <Input
                value={refFabricant ?? ""}
                onChange={(e) => setRefFabricant(e.target.value)}
                placeholder="ECY-303 / STP100-2…"
                className="mt-1 font-mono"
              />
            </div>
          </div>

          <div className="mt-3">
            <Label>Désignation *</Label>
            <Input
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              placeholder="Automate ECLYPSE 8UI/6UO"
              className="mt-1"
            />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Marque</Label>
              <Input
                value={marque ?? ""}
                onChange={(e) => setMarque(e.target.value)}
                placeholder="Distech Controls"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Catégorie</Label>
              <select
                value={categorie}
                onChange={(e) => setCategorie(e.target.value as CategorieProduit)}
                className={selectCls}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORIE_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Unité</Label>
              <select
                value={unite}
                onChange={(e) => setUnite(e.target.value)}
                className={selectCls}
              >
                <option value="U">Unité</option>
                <option value="m">Mètre</option>
                <option value="kg">Kilo</option>
              </select>
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Seuil mini</Label>
              <Input
                type="number"
                min={0}
                value={seuilMini}
                onChange={(e) => setSeuilMini(e.target.value)}
                className="mt-1 tabular-nums"
              />
              <p className="mt-1 text-xs text-muted">0 = pas d&apos;alerte.</p>
            </div>
            <div>
              <Label>Emplacement</Label>
              <Input
                value={emplacement ?? ""}
                onChange={(e) => setEmplacement(e.target.value)}
                placeholder="Bac A3, étagère 2"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Suivi par n° de série</Label>
              <label className="mt-1 flex h-[var(--control-h)] items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-sm text-fg">
                <input
                  type="checkbox"
                  checked={serialisable}
                  onChange={(e) => setSerialisable(e.target.checked)}
                  className="h-4 w-4 accent-[var(--brand)]"
                />
                Proposer les séries
              </label>
            </div>
          </div>

          <div className="mt-3">
            <Label>Fiche technique (URL)</Label>
            <Input
              value={docUrl ?? ""}
              onChange={(e) => setDocUrl(e.target.value)}
              placeholder="/materiel/Documentations_Distech/…"
              className="mt-1"
            />
          </div>

          {/* Achat : un produit, un fournisseur ------------------------- */}
          <div className="mt-4 border-t border-hairline pt-4">
            <p className="stamp mb-2">Achat</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Fournisseur</Label>
                <select
                  value={fournisseurId}
                  onChange={(e) => setFournisseurId(e.target.value)}
                  className={selectCls}
                >
                  <option value="">— Aucun —</option>
                  {fournisseurs.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nom}
                    </option>
                  ))}
                  <option value={NOUVEAU}>+ Nouveau fournisseur…</option>
                </select>
                {fournisseurId === NOUVEAU && (
                  <Input
                    autoFocus
                    value={fournisseurNom}
                    onChange={(e) => setFournisseurNom(e.target.value)}
                    placeholder="Nom du fournisseur"
                    className="mt-2"
                  />
                )}
              </div>
              <div>
                <Label>Sa référence</Label>
                <Input
                  value={refFournisseur ?? ""}
                  onChange={(e) => setRefFournisseur(e.target.value)}
                  placeholder="Celle qui va sur le bon de commande"
                  className="mt-1 font-mono"
                />
              </div>
            </div>
            {peutPrix && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Prix d&apos;achat</Label>
                  <Input
                    value={prixAchat}
                    onChange={(e) => setPrixAchat(e.target.value)}
                    placeholder="412,50"
                    inputMode="decimal"
                    className="mt-1 tabular-nums"
                  />
                  <p className="mt-1 text-xs text-muted">
                    {parseEuros(prixAchat) !== null
                      ? `${formatEuros(parseEuros(prixAchat))} — utilisé tant qu'aucune réception n'a été valorisée.`
                      : "Sert à chiffrer avant le premier achat."}
                  </p>
                </div>
                <div>
                  <Label>Délai (jours)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={delaiJours}
                    onChange={(e) => setDelaiJours(e.target.value)}
                    className="mt-1 tabular-nums"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Obsolescence : ce qu'on commande à la place --------------------- */}
          {initial?.id && (
            <div className="mt-3">
              <Label>Remplacé par</Label>
              <select
                value={remplaceParId ?? ""}
                onChange={(e) => setRemplaceParId(e.target.value)}
                className={selectCls}
              >
                <option value="">— Toujours d&apos;actualité —</option>
                {produits
                  .filter((p) => p.id !== initial.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.refInterne} — {p.designation}
                    </option>
                  ))}
              </select>
              <p className="mt-1 text-xs text-muted">
                Pour un produit obsolète : indique quel article commander à sa place. La fiche
                l&apos;affiche, et l&apos;historique de l&apos;ancien reste consultable.
              </p>
            </div>
          )}

          <div className="mt-3">
            <Label>Note</Label>
            <Input value={note ?? ""} onChange={(e) => setNote(e.target.value)} className="mt-1" />
          </div>

          {erreur && (
            <div className="mt-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {erreur}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-hairline px-4 py-3">
          <Button variant="ghost" onClick={() => onFermer()} disabled={pending}>
            Annuler
          </Button>
          <Button onClick={valider} disabled={pending || !refInterne.trim() || !designation.trim()}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
        </div>
      </div>
    </div>
  );
}
