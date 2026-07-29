"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Minus, Plus, Search, X } from "lucide-react";
import { Button, Input, Label } from "@/ui";
import { cn } from "@/lib/cn";
import { enregistrerMouvement } from "./actions";
import {
  MOUVEMENT_AIDE,
  MOUVEMENT_LABEL,
  SENS_MOUVEMENT,
  TYPES_SAISISSABLES,
  formatEuros,
  parseEuros,
  type DepotVue,
  type TypeMouvement,
} from "./model";

/* =============================================================================
 * LA SAISIE D'UN MOUVEMENT
 * Le seul geste qui fait vivre le stock — donc le seul écran qu'il faut rendre
 * VRAIMENT rapide. Le type choisi commande tout le reste : quels dépôts, quels
 * champs. On ne montre jamais un champ qui n'a pas de sens pour le mouvement en
 * cours (pas de prix sur une sortie, pas d'affaire sur une réception).
 * ========================================================================== */

export interface ProduitChoix {
  id: string;
  refInterne: string;
  refFabricant: string | null;
  designation: string;
  unite: string;
  serialisable: boolean;
  stock: number;
  dernierPrixCents: number | null;
}

export interface AffaireChoix {
  id: string;
  nom: string;
  clientNom: string;
  numeroWhy: string | null;
}

export function SaisieMouvement({
  produits,
  depots,
  affaires,
  peutPrix,
  typeInitial = "RECEPTION",
  produitInitial,
  chantierInitial,
  onFermer,
}: {
  produits: ProduitChoix[];
  depots: DepotVue[];
  affaires: AffaireChoix[];
  peutPrix: boolean;
  typeInitial?: TypeMouvement;
  produitInitial?: string;
  chantierInitial?: string;
  onFermer: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const depotsTenus = useMemo(() => depots.filter((d) => d.actif && !d.dortoir), [depots]);
  const depotsTous = useMemo(() => depots.filter((d) => d.actif), [depots]);
  const defautDepot = depotsTenus[0]?.id ?? depotsTous[0]?.id ?? "";

  const [type, setType] = useState<TypeMouvement>(typeInitial);
  const [produitId, setProduitId] = useState(produitInitial ?? "");
  const [recherche, setRecherche] = useState("");
  const [quantite, setQuantite] = useState(1);
  const [depotSource, setDepotSource] = useState(defautDepot);
  const [depotDest, setDepotDest] = useState(defautDepot);
  // `null` = pas encore touché → on affiche la suggestion (dernier prix payé).
  // Dérivé plutôt que posé par un effet : sinon changer de produit provoquerait
  // un second rendu, et le champ « clignoterait » à chaque sélection.
  const [prixSaisi, setPrixSaisi] = useState<string | null>(null);
  const [numeroAchat, setNumeroAchat] = useState("");
  const [chantierId, setChantierId] = useState(chantierInitial ?? "");
  const [series, setSeries] = useState("");
  const [note, setNote] = useState("");

  const produit = produits.find((p) => p.id === produitId) ?? null;
  const sens = SENS_MOUVEMENT[type];

  // Le dernier prix payé pré-remplit la saisie : neuf fois sur dix c'est le bon,
  // et la dixième on le corrige.
  const prix =
    prixSaisi ??
    (produit?.dernierPrixCents != null
      ? (produit.dernierPrixCents / 100).toFixed(2).replace(".", ",")
      : "");

  const resultats = useMemo(() => {
    const f = recherche.trim().toLowerCase();
    if (!f) return produits.slice(0, 12);
    return produits
      .filter(
        (p) =>
          p.refInterne.toLowerCase().includes(f) ||
          (p.refFabricant ?? "").toLowerCase().includes(f) ||
          p.designation.toLowerCase().includes(f),
      )
      .slice(0, 12);
  }, [produits, recherche]);

  const listeSeries = series
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  function valider() {
    setErreur(null);
    if (!produitId) {
      setErreur("Choisissez un produit");
      return;
    }
    startTransition(async () => {
      try {
        await enregistrerMouvement({
          type,
          produitId,
          quantite,
          depotSourceId: sens.source ? depotSource : null,
          depotDestId: sens.dest ? depotDest : null,
          prixUnitaireCents: type === "RECEPTION" && peutPrix ? parseEuros(prix) : null,
          numeroAchat: type === "RECEPTION" ? numeroAchat : null,
          chantierId: type === "SORTIE" || type === "RETOUR" ? chantierId || null : null,
          note,
          series: listeSeries,
        });
        router.refresh();
        onFermer();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Erreur inattendue");
      }
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mouvement de stock"
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
    >
      <button
        type="button"
        aria-label="Fermer"
        onClick={onFermer}
        className="anim-fade absolute inset-0 bg-black/55 backdrop-blur-sm"
      />

      <div className="anim-rise bg-surface relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden border border-border sm:max-h-[88vh]">
        <div className="bloc-entete shrink-0">
          <span className="font-display text-sm font-semibold text-fg">Mouvement de stock</span>
          <button
            type="button"
            onClick={onFermer}
            aria-label="Fermer"
            className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded text-muted transition-colors hover:bg-surface-2"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5">
          {/* Le type commande tout le formulaire -------------------------- */}
          <div className="flex flex-wrap gap-1.5">
            {TYPES_SAISISSABLES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  "press rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                  t === type
                    ? "border-brand bg-brand text-brand-fg"
                    : "border-border bg-surface text-muted hover:bg-surface-2",
                )}
              >
                {MOUVEMENT_LABEL[t]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">{MOUVEMENT_AIDE[type]}</p>

          {/* Produit ------------------------------------------------------ */}
          <div className="mt-4">
            <Label>Produit</Label>
            {produit ? (
              <div className="mt-1 flex items-center gap-3 border border-border bg-surface-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-fg">
                    <span className="ref">{produit.refInterne}</span> — {produit.designation}
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    Stock actuel : <strong className="tabular-nums">{produit.stock}</strong>{" "}
                    {produit.unite}
                    {produit.refFabricant ? ` · réf. fabricant ${produit.refFabricant}` : ""}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setProduitId("")}>
                  Changer
                </Button>
              </div>
            ) : (
              <>
                <div className="relative mt-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
                  <Input
                    autoFocus
                    value={recherche}
                    onChange={(e) => setRecherche(e.target.value)}
                    placeholder="Référence, désignation, marque…"
                    className="pl-8"
                  />
                </div>
                <ul className="mt-1 max-h-56 overflow-y-auto border border-hairline">
                  {resultats.length === 0 && (
                    <li className="px-3 py-2 text-sm text-subtle">Aucun produit</li>
                  )}
                  {resultats.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setProduitId(p.id)}
                        className="flex w-full items-baseline gap-2 border-b border-hairline px-3 py-2 text-left text-sm transition-colors last:border-0 hover:bg-surface-2"
                      >
                        <span className="ref shrink-0">{p.refInterne}</span>
                        <span className="min-w-0 flex-1 truncate text-fg">{p.designation}</span>
                        <span className="shrink-0 tabular-nums text-xs text-muted">
                          {p.stock} {p.unite}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {/* Quantité ----------------------------------------------------- */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Quantité</Label>
              <div className="mt-1 flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Diminuer"
                  onClick={() => setQuantite((q) => Math.max(1, q - 1))}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  min={1}
                  value={quantite}
                  onChange={(e) => setQuantite(Math.max(1, Math.round(Number(e.target.value)) || 1))}
                  className="text-center tabular-nums"
                />
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Augmenter"
                  onClick={() => setQuantite((q) => q + 1)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Dépôts : uniquement ceux que le type réclame ---------------- */}
            {sens.source && (
              <div>
                <Label>Dépôt de départ</Label>
                <select
                  value={depotSource}
                  onChange={(e) => setDepotSource(e.target.value)}
                  className="mt-1 h-[var(--control-h)] w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg"
                >
                  {depotsTous.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nom}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {sens.dest && (
              <div>
                <Label>Dépôt d&apos;arrivée</Label>
                <select
                  value={depotDest}
                  onChange={(e) => setDepotDest(e.target.value)}
                  className="mt-1 h-[var(--control-h)] w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg"
                >
                  {depotsTous.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nom}
                      {d.dortoir ? " (consommé)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Réception : prix payé + n° de commande d'achat ---------------- */}
          {type === "RECEPTION" && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {peutPrix && (
                <div>
                  <Label>Prix unitaire payé</Label>
                  <Input
                    value={prix}
                    onChange={(e) => setPrixSaisi(e.target.value)}
                    placeholder="412,50"
                    inputMode="decimal"
                    className="mt-1 tabular-nums"
                  />
                  <p className="mt-1 text-xs text-muted">
                    {parseEuros(prix) !== null
                      ? `${formatEuros(parseEuros(prix))} × ${quantite} = ${formatEuros(
                          (parseEuros(prix) ?? 0) * quantite,
                        )}`
                      : "Facultatif — c'est ce prix qui historise les achats."}
                  </p>
                </div>
              )}
              <div>
                <Label>N° de commande d&apos;achat</Label>
                <Input
                  value={numeroAchat}
                  onChange={(e) => setNumeroAchat(e.target.value)}
                  placeholder="Référence WhySoft"
                  className="mt-1"
                />
                <p className="mt-1 text-xs text-muted">
                  Simple référence : les commandes restent dans WhySoft.
                </p>
              </div>
            </div>
          )}

          {/* Sortie / retour : au titre de quelle affaire ------------------ */}
          {(type === "SORTIE" || type === "RETOUR") && (
            <div className="mt-4">
              <Label>Affaire</Label>
              <select
                value={chantierId}
                onChange={(e) => setChantierId(e.target.value)}
                className="mt-1 h-[var(--control-h)] w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg"
              >
                <option value="">— Aucune (dépannage, atelier, prêt) —</option>
                {affaires.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nom} — {a.clientNom}
                    {a.numeroWhy ? ` (${a.numeroWhy})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Séries : opportunistes, jamais imposées ---------------------- */}
          {produit?.serialisable && (
            <div className="mt-4">
              <Label>
                Numéros de série <span className="font-normal text-subtle">(facultatif)</span>
              </Label>
              <textarea
                value={series}
                onChange={(e) => setSeries(e.target.value)}
                rows={3}
                placeholder="Un par ligne — laissez vide si vous ne les avez pas"
                className="mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-2 font-mono text-sm text-fg"
              />
              <p
                className={cn(
                  "mt-1 text-xs",
                  listeSeries.length > quantite ? "text-danger" : "text-muted",
                )}
              >
                {listeSeries.length} saisi{listeSeries.length > 1 ? "s" : ""} pour {quantite}{" "}
                {quantite > 1 ? "unités" : "unité"}
                {listeSeries.length > quantite
                  ? " — trop de numéros, la quantité fait foi."
                  : " — la quantité fait foi, les séries sont un bonus."}
              </p>
            </div>
          )}

          <div className="mt-4">
            <Label>Note</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Bon de livraison, motif, précision…"
              className="mt-1"
            />
          </div>

          {erreur && (
            <div className="mt-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {erreur}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-hairline px-4 py-3">
          <Button variant="ghost" onClick={onFermer} disabled={pending}>
            Annuler
          </Button>
          <Button onClick={valider} disabled={pending || !produitId}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Enregistrer le mouvement
          </Button>
        </div>
      </div>
    </div>
  );
}
