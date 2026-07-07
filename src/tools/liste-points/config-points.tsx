"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/ui";
import { cn } from "@/lib/cn";
import { IO_TYPES, type IoType, type ModelePoint } from "./model";
import type { ModeleRow, PointCatalogueRow } from "./queries";
import {
  enregistrerModele,
  enregistrerPointCatalogue,
  supprimerModele,
  supprimerPointCatalogue,
} from "./config-actions";

type PointDraft = { id?: string; nom: string; type: string };
type ModeleDraft = { id?: string; nom: string; ordre: number; points: ModelePoint[] };

export function ConfigPoints({
  catalogue,
  modeles,
}: {
  catalogue: PointCatalogueRow[];
  modeles: ModeleRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [ptDraft, setPtDraft] = useState<PointDraft | null>(null);
  const [modDraft, setModDraft] = useState<ModeleDraft | null>(null);

  function run(action: () => Promise<void>, done?: () => void) {
    startTransition(async () => {
      await action();
      done?.();
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-6 md:px-10">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-fg">Catalogue &amp; modèles</h1>
          <p className="mt-1 text-sm text-muted">
            Points suggérés (nom → type d&apos;E/S) et modèles de saisie de l&apos;outil Liste de
            points. Partagés entre tous.
          </p>
        </div>
        {pending && <Loader2 className="mt-1 h-5 w-5 animate-spin text-muted" />}
      </div>

      {/* Catalogue de points ------------------------------------------------ */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg">
            Catalogue de points <span className="text-subtle">({catalogue.length})</span>
          </h2>
          <Button size="sm" variant="outline" onClick={() => setPtDraft({ nom: "", type: "AI" })}>
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

        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
                <th className="px-4 py-2.5 font-medium">Nom</th>
                <th className="w-24 px-4 py-2.5 font-medium">Type</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {catalogue.map((c) =>
                ptDraft?.id === c.id ? (
                  <tr key={c.id}>
                    <td colSpan={3} className="p-0">
                      <PointForm
                        draft={ptDraft}
                        setDraft={setPtDraft}
                        pending={pending}
                        onSave={() => run(() => enregistrerPointCatalogue(ptDraft), () => setPtDraft(null))}
                        onCancel={() => setPtDraft(null)}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={c.id} className="border-b border-border-soft last:border-0">
                    <td className="px-4 py-2 text-fg">{c.nom}</td>
                    <td className="px-4 py-2">
                      <TypeBadge type={c.type} />
                    </td>
                    <td className="px-2 py-2">
                      <LigneActions
                        onEdit={() => setPtDraft({ id: c.id, nom: c.nom, type: c.type })}
                        onDelete={() => run(() => supprimerPointCatalogue(c.id))}
                      />
                    </td>
                  </tr>
                ),
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
                className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-2.5"
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
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted">Type</span>
        <TypeSelect value={draft.type} onChange={(v) => setDraft({ ...draft, type: v })} />
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
    setDraft({ ...draft, points: [...draft.points, { nom: c.nom, type: c.type as IoType }] });
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
