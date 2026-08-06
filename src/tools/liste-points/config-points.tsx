"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, Loader2, Package, Pencil, Plus, Search, Trash2, TriangleAlert, X } from "lucide-react";
import { Button, Cartouche, Input } from "@/ui";
import { cn } from "@/lib/cn";
import { IO_TYPES, nomLocalise, signalLabel, signalsForType, type IoType, type ModelePoint } from "./model";
import type { ModeleRow, PointCatalogueRow } from "./queries";
import { MaterielPoint } from "@/tools/magasin/materiel-point";
import type { PointAvecNomenclature } from "@/tools/magasin/queries";
import type { ProduitChoix } from "@/tools/magasin/saisie-mouvement";
import {
  enregistrerModele,
  enregistrerPointCatalogue,
  supprimerModele,
  supprimerPointCatalogue,
} from "./config-actions";

type PointDraft = { id?: string; nom: string; type: string; signal: string };
type ModeleDraft = { id?: string; nom: string; ordre: number; points: ModelePoint[] };

export function ConfigPoints({
  catalogue,
  modeles,
  nomenclatures,
  produits,
  peutGererMateriel,
}: {
  catalogue: PointCatalogueRow[];
  modeles: ModeleRow[];
  /** Le matériel appelé par chaque point (magasin) — même bloc que l'écran
   *  Nomenclature et que la ligne de besoin d'une affaire. */
  nomenclatures: PointAvecNomenclature[];
  produits: ProduitChoix[];
  peutGererMateriel: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [ptDraft, setPtDraft] = useState<PointDraft | null>(null);
  /** 126 points : sans recherche, l'écran n'est pas utilisable. */
  const [q, setQ] = useState("");
  const [materielOuvert, setMaterielOuvert] = useState<string | null>(null);
  const [modDraft, setModDraft] = useState<ModeleDraft | null>(null);

  const filtres = useMemo(() => {
    const f = q.trim().toLowerCase();
    if (!f) return catalogue;
    return catalogue.filter(
      (c) => c.nom.toLowerCase().includes(f) || c.type.toLowerCase().includes(f),
    );
  }, [catalogue, q]);

  const materielDe = (nom: string) => nomenclatures.find((n) => n.nom === nom);

  function run(action: () => Promise<void>, done?: () => void) {
    startTransition(async () => {
      await action();
      done?.();
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-[1700px] px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille="Configuration"
        titre="Points &amp; modèles"
        description="Le vocabulaire de l’entreprise : un point réutilisable d’une affaire à l’autre (nom → type d’E/S + signal), et les modèles de saisie. Le nom dit ce que c’est — le local (« Salle Communale 1 ») va dans le texte libre de la ligne, jamais ici. Le signal pré-affecte la bonne borne à l’insertion."
        actions={pending ? <Loader2 className="h-5 w-5 animate-spin text-muted" /> : null}
        className="mb-6"
      />

      {/* Catalogue de points ------------------------------------------------ */}
      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-fg">
            Points{" "}
            <span className="text-subtle">
              ({filtres.length}
              {filtres.length !== catalogue.length && ` sur ${catalogue.length}`})
            </span>
          </h2>
          <div className="relative ml-auto mr-2 w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Chercher un point…"
              className="pl-8"
            />
          </div>
          <Button size="sm" variant="outline" onClick={() => setPtDraft({ nom: "", type: "AI", signal: "0-10V" })}>
            <Plus className="h-4 w-4" /> Ajouter un point
          </Button>
        </div>

        {ptDraft && !ptDraft.id && (
          <PointForm
            draft={ptDraft}
            setDraft={setPtDraft}
            pending={pending}
            onSave={() => run(() => enregistrerPointCatalogue(ptDraft), () => setPtDraft(null))}
            onCancel={() => setPtDraft(null)}
          />
        )}

        <div className="overflow-x-auto border border-hairline bg-surface">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
                <th className="px-4 py-2.5 font-medium">Nom</th>
                <th className="w-24 px-4 py-2.5 font-medium">Type</th>
                <th className="w-32 px-4 py-2.5 font-medium">Signal / protocole</th>
                <th className="px-4 py-2.5 font-medium">Matériel appelé</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {filtres.flatMap((c) =>
                ptDraft?.id === c.id ? [
                  <tr key={c.id}>
                    <td colSpan={5} className="p-0">
                      <PointForm
                        draft={ptDraft}
                        setDraft={setPtDraft}
                        pending={pending}
                        onSave={() => run(() => enregistrerPointCatalogue(ptDraft), () => setPtDraft(null))}
                        onCancel={() => setPtDraft(null)}
                      />
                    </td>
                  </tr>,
                ] : [
                  <tr key={c.id} className="border-b border-border-soft last:border-0">
                    <td className="px-4 py-2 text-fg">{c.nom}</td>
                    <td className="px-4 py-2">
                      <TypeBadge type={c.type} />
                    </td>
                    <td className="px-4 py-2 text-muted">
                      {c.signal ? (
                        signalLabel(c.signal)
                      ) : (
                        <span className="text-subtle">{c.type === "COM" ? "—" : "défaut"}</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {(() => {
                        const mat = materielDe(c.nom);
                        const resume = mat?.sansMateriel
                          ? "aucun matériel"
                          : mat && mat.lignes.length > 0
                            ? mat.lignes.map((l) => `${l.quantite}× ${l.refInterne}`).join(" + ")
                            : "à relier";
                        return (
                          <button
                            type="button"
                            disabled={!mat}
                            onClick={() => setMaterielOuvert((v) => (v === c.id ? null : c.id))}
                            title="Voir et régler le matériel que ce point appelle"
                            className={cn(
                              "inline-flex max-w-full items-center gap-1.5 text-left text-xs transition-colors",
                              mat && mat.lignes.length > 0
                                ? "text-muted hover:text-brand"
                                : "text-subtle hover:text-brand",
                              !mat && "cursor-default hover:text-subtle",
                            )}
                          >
                            <Package className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{resume}</span>
                          </button>
                        );
                      })()}
                    </td>
                    <td className="px-2 py-2">
                      <LigneActions
                        onEdit={() =>
                          setPtDraft({
                            id: c.id,
                            nom: c.nom,
                            type: c.type,
                            signal: c.signal ?? signalsForType(c.type)[0] ?? "",
                          })
                        }
                        onDelete={() => run(() => supprimerPointCatalogue(c.id))}
                      />
                    </td>
                  </tr>,
                  // Le matériel du point, déplié SOUS sa ligne — même bloc que
                  // l'écran Nomenclature et que la ligne de besoin d'une affaire.
                  ...(materielOuvert === c.id && materielDe(c.nom)
                    ? [
                        <tr key={`mat-${c.id}`}>
                          <td colSpan={5} className="p-0">
                            <MaterielPoint
                              compact
                              point={materielDe(c.nom)!}
                              produits={produits}
                              peutGerer={peutGererMateriel}
                              onFait={() => router.refresh()}
                            />
                          </td>
                        </tr>,
                      ]
                    : []),
                ],
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modèles ------------------------------------------------------------ */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg">
            Modèles <span className="text-subtle">({modeles.length})</span>
          </h2>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setModDraft({ nom: "", ordre: modeles.length, points: [] })}
          >
            <Plus className="h-4 w-4" /> Ajouter un modèle
          </Button>
        </div>

        {modDraft && !modDraft.id && (
          <ModeleForm
            draft={modDraft}
            setDraft={setModDraft}
            catalogue={catalogue}
            pending={pending}
            onSave={() => run(() => enregistrerModele(modDraft), () => setModDraft(null))}
            onCancel={() => setModDraft(null)}
          />
        )}

        <div className="space-y-2">
          {modeles.map((m) =>
            modDraft?.id === m.id ? (
              <ModeleForm
                key={m.id}
                draft={modDraft}
                setDraft={setModDraft}
                catalogue={catalogue}
                pending={pending}
                onSave={() => run(() => enregistrerModele(modDraft), () => setModDraft(null))}
                onCancel={() => setModDraft(null)}
              />
            ) : (
              <div
                key={m.id}
                className="flex items-center gap-3 border border-hairline bg-surface px-4 py-2.5"
              >
                <span className="font-medium text-fg">{m.nom}</span>
                <span className="text-xs text-subtle">
                  {m.points.length} point{m.points.length > 1 ? "s" : ""}
                </span>
                <span className="ml-2 flex flex-wrap gap-1">
                  {m.points.slice(0, 8).map((p, i) => (
                    <span key={i} className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">
                      {p.nom}
                    </span>
                  ))}
                  {m.points.length > 8 && <span className="text-[11px] text-subtle">…</span>}
                </span>
                <span className="ml-auto">
                  <LigneActions
                    onEdit={() => setModDraft({ id: m.id, nom: m.nom, ordre: m.ordre, points: m.points })}
                    onDelete={() => run(() => supprimerModele(m.id))}
                  />
                </span>
              </div>
            ),
          )}
        </div>
      </section>
    </div>
  );
}

// --- Formulaire point catalogue --------------------------------------------

function PointForm({
  draft,
  setDraft,
  pending,
  onSave,
  onCancel,
}: {
  draft: PointDraft;
  setDraft: (d: PointDraft) => void;
  pending: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  // Avertissement non bloquant : ici c'est un humain qui juge (le MCP, lui, refuse).
  const localise = draft.nom ? nomLocalise(draft.nom) : null;
  return (
    <div className="mb-3 flex flex-wrap items-end gap-3 rounded-lg border border-brand/40 bg-surface p-4">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted">Nom</span>
        <input
          value={draft.nom}
          onChange={(e) => setDraft({ ...draft, nom: e.target.value })}
          placeholder="Sonde départ"
          className="h-9 w-64 rounded-md border border-border bg-surface px-2.5 text-sm text-fg placeholder:text-subtle"
        />
      </label>
      {localise && (
        <p className="order-last flex w-full items-start gap-1.5 text-xs text-warning">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Ce nom ressemble à un point de chantier : {localise}. Le catalogue est le
            vocabulaire partagé — le local va dans le texte libre de la ligne, pas ici.
          </span>
        </p>
      )}
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted">Type</span>
        <TypeSelect
          value={draft.type}
          onChange={(v) => {
            // Réaligne le signal sur un défaut cohérent avec le nouveau type.
            const sigs = signalsForType(v);
            const signal = sigs.includes(draft.signal) ? draft.signal : sigs[0] ?? "";
            setDraft({ ...draft, type: v, signal });
          }}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted">
          {draft.type === "COM" ? "Protocole" : "Signal"}
        </span>
        <select
          value={draft.signal}
          onChange={(e) => setDraft({ ...draft, signal: e.target.value })}
          className="h-9 w-40 rounded-md border border-border bg-surface px-2.5 text-sm text-fg"
        >
          {draft.type === "COM" && <option value="">— aucun —</option>}
          {signalsForType(draft.type).map((s) => (
            <option key={s} value={s}>
              {signalLabel(s)}
            </option>
          ))}
        </select>
      </label>
      <div className="ml-auto flex gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
          <X className="h-4 w-4" /> Annuler
        </Button>
        <Button size="sm" onClick={onSave} disabled={pending}>
          <Check className="h-4 w-4" /> Enregistrer
        </Button>
      </div>
    </div>
  );
}

// --- Formulaire modèle ------------------------------------------------------

function ModeleForm({
  draft,
  setDraft,
  catalogue,
  pending,
  onSave,
  onCancel,
}: {
  draft: ModeleDraft;
  setDraft: (d: ModeleDraft) => void;
  catalogue: PointCatalogueRow[];
  pending: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [choix, setChoix] = useState("");
  const options = useMemo(
    () => [...catalogue].sort((a, b) => a.nom.localeCompare(b.nom)),
    [catalogue],
  );

  const addPoint = (nom: string) => {
    const c = catalogue.find((x) => x.nom === nom);
    if (!c) return;
    setDraft({
      ...draft,
      points: [...draft.points, { nom: c.nom, type: c.type as IoType, signal: c.signal ?? undefined }],
    });
    setChoix("");
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= draft.points.length) return;
    const pts = [...draft.points];
    [pts[i], pts[j]] = [pts[j], pts[i]];
    setDraft({ ...draft, points: pts });
  };
  const remove = (i: number) =>
    setDraft({ ...draft, points: draft.points.filter((_, k) => k !== i) });

  return (
    <div className="mb-3 rounded-lg border border-brand/40 bg-surface p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted">Nom du modèle</span>
          <input
            value={draft.nom}
            onChange={(e) => setDraft({ ...draft, nom: e.target.value })}
            placeholder="Chaudière"
            className="h-9 w-64 rounded-md border border-border bg-surface px-2.5 text-sm text-fg placeholder:text-subtle"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted">Ajouter un point</span>
          <select
            value={choix}
            onChange={(e) => addPoint(e.target.value)}
            className="h-9 w-72 rounded-md border border-border bg-surface px-2.5 text-sm text-fg"
          >
            <option value="">— choisir un point du catalogue —</option>
            {options.map((o) => (
              <option key={o.id} value={o.nom}>
                {o.nom} ({o.type})
              </option>
            ))}
          </select>
        </label>
      </div>

      <ol className="mt-3 space-y-1">
        {draft.points.length === 0 && (
          <li className="text-xs text-subtle">Aucun point. Ajoute-les depuis le catalogue ci-dessus.</li>
        )}
        {draft.points.map((p, i) => (
          <li
            key={i}
            className="flex items-center gap-2 rounded border border-border-soft bg-surface-2 px-2.5 py-1.5 text-sm"
          >
            <span className="w-5 text-right text-xs text-subtle">{i + 1}</span>
            <span className="text-fg">{p.nom}</span>
            <TypeBadge type={p.type} />
            {p.signal && p.type !== "COM" && (
              <span className="text-[11px] text-subtle">{signalLabel(p.signal)}</span>
            )}
            <span className="ml-auto flex items-center gap-0.5">
              <IconBtn label="Monter" onClick={() => move(i, -1)} disabled={i === 0}>
                <ArrowUp className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn label="Descendre" onClick={() => move(i, 1)} disabled={i === draft.points.length - 1}>
                <ArrowDown className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn label="Retirer" onClick={() => remove(i)}>
                <X className="h-3.5 w-3.5" />
              </IconBtn>
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
          <X className="h-4 w-4" /> Annuler
        </Button>
        <Button size="sm" onClick={onSave} disabled={pending}>
          <Check className="h-4 w-4" /> Enregistrer
        </Button>
      </div>
    </div>
  );
}

// --- Primitives -------------------------------------------------------------

const TYPE_CLS: Record<string, string> = {
  AI: "bg-io-ai/15 text-io-ai",
  DI: "bg-io-di/15 text-io-di",
  AO: "bg-io-ao/15 text-io-ao",
  DO: "bg-io-do/15 text-io-do",
  COM: "bg-io-com/15 text-io-com",
};

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", TYPE_CLS[type] ?? "bg-surface-2 text-muted")}>
      {type}
    </span>
  );
}

function TypeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-24 rounded-md border border-border bg-surface px-2.5 text-sm text-fg"
    >
      {IO_TYPES.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}

function LigneActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-end gap-1">
      <IconBtn label="Modifier" onClick={onEdit}>
        <Pencil className="h-4 w-4" />
      </IconBtn>
      <IconBtn
        label="Supprimer"
        onClick={() => {
          if (confirm("Supprimer définitivement ?")) onDelete();
        }}
        danger
      >
        <Trash2 className="h-4 w-4" />
      </IconBtn>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-subtle transition-colors disabled:opacity-30",
        danger ? "hover:bg-danger/12 hover:text-danger" : "hover:bg-surface-2 hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
