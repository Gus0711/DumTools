"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/ui";
import { cn } from "@/lib/cn";
import type { AutomateRow, MaterielAdmin, ModuleRow } from "./catalogue-queries";
import {
  enregistrerAutomate,
  enregistrerModule,
  initialiserCatalogue,
  supprimerAutomate,
  supprimerModule,
  type AutomatePayload,
  type ModulePayload,
} from "./catalogue-actions";

const ENTREE_KINDS = ["UI", "DI"];
const SORTIE_KINDS = ["UO", "DO", "OUT"];
const CATEGORIES = ["extension", "communication", "accessoire"];

function automateVide(ordre: number): AutomatePayload {
  return {
    reference: "",
    image: "",
    alimIntegree: false,
    alimLabel: "",
    entreeKind: "UI",
    entreeCount: 0,
    sortieKind: "UO",
    sortieCount: 0,
    entreeCodes: [],
    sortieCodes: [],
    extensible: false,
    modulesCompat: [],
    maxModules: 0,
    maxPoints: 0,
    docUrl: "",
    actif: true,
    ordre,
  };
}

function moduleVide(ordre: number): ModulePayload {
  return {
    type: "",
    image: "",
    categorie: "extension",
    entreeKind: "UI",
    entreeCount: 0,
    sortieKind: "UO",
    sortieCount: 0,
    docUrl: "",
    actif: true,
    ordre,
  };
}

export function ConfigMateriel({ initial }: { initial: MaterielAdmin }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [autoDraft, setAutoDraft] = useState<AutomatePayload | null>(null);
  const [modDraft, setModDraft] = useState<ModulePayload | null>(null);

  // Modules raccordables à un automate : extension (E/S) + communication.
  const typesCompatibles = useMemo(
    () => initial.modules.filter((m) => m.categorie !== "accessoire").map((m) => m.type),
    [initial.modules],
  );

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
          <h1 className="text-xl font-semibold text-fg">Base matériel</h1>
          <p className="mt-1 text-sm text-muted">
            Automates et modules Distech pilotant le sélecteur, la recommandation et l&apos;aperçu de
            l&apos;outil Affectation E/S. Modifiable par tous.
          </p>
        </div>
        {pending && <Loader2 className="mt-1 h-5 w-5 animate-spin text-muted" />}
      </div>

      {initial.vide && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-lg border border-brand/30 bg-brand-soft px-4 py-3">
          <p className="text-sm text-fg">
            La base est vide : l&apos;outil utilise les valeurs par défaut intégrées. Initialisez-la
            pour pouvoir l&apos;éditer.
          </p>
          <Button size="sm" onClick={() => run(() => initialiserCatalogue())}>
            Initialiser depuis les valeurs par défaut
          </Button>
        </div>
      )}

      {/* Automates ---------------------------------------------------------- */}
      <Bloc
        titre="Automates"
        onAdd={() => setAutoDraft(automateVide(initial.automates.length))}
        addLabel="Ajouter un automate"
      >
        {autoDraft && !autoDraft.id && (
          <AutomateForm
            draft={autoDraft}
            setDraft={setAutoDraft}
            typesCompatibles={typesCompatibles}
            pending={pending}
            onSave={() => run(() => enregistrerAutomate(autoDraft), () => setAutoDraft(null))}
            onCancel={() => setAutoDraft(null)}
          />
        )}
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
                <th className="px-4 py-2.5 font-medium">Référence</th>
                <th className="px-4 py-2.5 text-center font-medium">E/S intégrées</th>
                <th className="px-4 py-2.5 text-center font-medium">Extensible</th>
                <th className="px-4 py-2.5 font-medium">Alimentation</th>
                <th className="px-4 py-2.5 text-center font-medium">Actif</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {initial.automates.length === 0 && !autoDraft && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-subtle">
                    Aucun automate.
                  </td>
                </tr>
              )}
              {initial.automates.map((a) =>
                autoDraft?.id === a.id ? (
                  <tr key={a.id}>
                    <td colSpan={6} className="p-0">
                      <AutomateForm
                        draft={autoDraft}
                        setDraft={setAutoDraft}
                        typesCompatibles={typesCompatibles}
                        pending={pending}
                        onSave={() => run(() => enregistrerAutomate(autoDraft), () => setAutoDraft(null))}
                        onCancel={() => setAutoDraft(null)}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={a.id} className={cn("border-b border-border-soft last:border-0", !a.actif && "opacity-50")}>
                    <td className="px-4 py-2 font-medium text-fg">
                      <span className="inline-flex items-center gap-2">
                        {a.reference}
                        <DocLink url={a.docUrl} />
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center tabular-nums text-muted">
                      {a.entreeCount} {a.entreeKind} / {a.sortieCount} {a.sortieKind}
                    </td>
                    <td className="px-4 py-2 text-center text-muted">
                      {a.extensible ? `oui (${a.modulesCompat.length} type·s)` : "non"}
                    </td>
                    <td className="px-4 py-2 text-muted">
                      {a.alimIntegree ? a.alimLabel || "intégrée" : "externe"}
                    </td>
                    <td className="px-4 py-2 text-center">{a.actif ? "✓" : "—"}</td>
                    <td className="px-2 py-2">
                      <LigneActions
                        onEdit={() => setAutoDraft(rowToAutoDraft(a))}
                        onDelete={() => run(() => supprimerAutomate(a.id))}
                      />
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </Bloc>

      {/* Modules ------------------------------------------------------------ */}
      <Bloc
        titre="Modules"
        onAdd={() => setModDraft(moduleVide(initial.modules.length))}
        addLabel="Ajouter un module"
      >
        {modDraft && !modDraft.id && (
          <ModuleForm
            draft={modDraft}
            setDraft={setModDraft}
            pending={pending}
            onSave={() => run(() => enregistrerModule(modDraft), () => setModDraft(null))}
            onCancel={() => setModDraft(null)}
          />
        )}
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Catégorie</th>
                <th className="px-4 py-2.5 text-center font-medium">Entrées</th>
                <th className="px-4 py-2.5 text-center font-medium">Sorties</th>
                <th className="px-4 py-2.5 text-center font-medium">Actif</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {initial.modules.length === 0 && !modDraft && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-subtle">
                    Aucun module.
                  </td>
                </tr>
              )}
              {initial.modules.map((m) =>
                modDraft?.id === m.id ? (
                  <tr key={m.id}>
                    <td colSpan={6} className="p-0">
                      <ModuleForm
                        draft={modDraft}
                        setDraft={setModDraft}
                        pending={pending}
                        onSave={() => run(() => enregistrerModule(modDraft), () => setModDraft(null))}
                        onCancel={() => setModDraft(null)}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={m.id} className={cn("border-b border-border-soft last:border-0", !m.actif && "opacity-50")}>
                    <td className="px-4 py-2 font-medium text-fg">
                      <span className="inline-flex items-center gap-2">
                        {m.type}
                        <DocLink url={m.docUrl} />
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted">{m.categorie}</td>
                    <td className="px-4 py-2 text-center tabular-nums text-muted">
                      {m.entreeCount} {m.entreeKind}
                    </td>
                    <td className="px-4 py-2 text-center tabular-nums text-muted">
                      {m.sortieCount} {m.sortieKind}
                    </td>
                    <td className="px-4 py-2 text-center">{m.actif ? "✓" : "—"}</td>
                    <td className="px-2 py-2">
                      <LigneActions
                        onEdit={() => setModDraft(rowToModDraft(m))}
                        onDelete={() => run(() => supprimerModule(m.id))}
                      />
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </Bloc>
    </div>
  );
}

// --- Sous-composants --------------------------------------------------------

function Bloc({
  titre,
  addLabel,
  onAdd,
  children,
}: {
  titre: string;
  addLabel: string;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg">{titre}</h2>
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus className="h-4 w-4" /> {addLabel}
        </Button>
      </div>
      {children}
    </section>
  );
}

function LigneActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        aria-label="Modifier"
        onClick={onEdit}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Supprimer"
        onClick={() => {
          if (confirm("Supprimer définitivement cette entrée ?")) onDelete();
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-subtle transition-colors hover:bg-danger/12 hover:text-danger"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function DocLink({ url }: { url: string }) {
  if (!url) return null;
  return (
    <a
      href={encodeURI(url)}
      target="_blank"
      rel="noopener noreferrer"
      title="Fiche technique"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex text-muted transition-colors hover:text-brand"
    >
      <FileText className="h-3.5 w-3.5" />
    </a>
  );
}

function FormShell({
  pending,
  onSave,
  onCancel,
  children,
}: {
  pending: boolean;
  onSave: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3 rounded-lg border border-brand/40 bg-surface p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
      <div className="mt-4 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
          <X className="h-4 w-4" /> Annuler
        </Button>
        <Button size="sm" onClick={onSave} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Enregistrer
        </Button>
      </div>
    </div>
  );
}

function AutomateForm({
  draft,
  setDraft,
  typesCompatibles,
  pending,
  onSave,
  onCancel,
}: {
  draft: AutomatePayload;
  setDraft: (d: AutomatePayload) => void;
  typesCompatibles: string[];
  pending: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const up = (patch: Partial<AutomatePayload>) => setDraft({ ...draft, ...patch });
  const toggleCompat = (type: string) =>
    up({
      modulesCompat: draft.modulesCompat.includes(type)
        ? draft.modulesCompat.filter((t) => t !== type)
        : [...draft.modulesCompat, type],
    });
  return (
    <FormShell pending={pending} onSave={onSave} onCancel={onCancel}>
      <Champ label="Référence">
        <TextInput value={draft.reference} onChange={(v) => up({ reference: v })} placeholder="ECY-600" />
      </Champ>
      <Champ label="Image (chemin public)">
        <TextInput value={draft.image} onChange={(v) => up({ image: v })} placeholder="/materiel/ctrl-ECY-600.png" />
      </Champ>
      <Champ label="Ordre">
        <NumInput value={draft.ordre} onChange={(v) => up({ ordre: v })} />
      </Champ>
      <Champ label="Entrées intégrées">
        <div className="flex gap-2">
          <SelectInput value={draft.entreeKind} onChange={(v) => up({ entreeKind: v })} options={ENTREE_KINDS} />
          <NumInput value={draft.entreeCount} onChange={(v) => up({ entreeCount: v })} />
        </div>
      </Champ>
      <Champ label="Sorties intégrées">
        <div className="flex gap-2">
          <SelectInput value={draft.sortieKind} onChange={(v) => up({ sortieKind: v })} options={SORTIE_KINDS} />
          <NumInput value={draft.sortieCount} onChange={(v) => up({ sortieCount: v })} />
        </div>
      </Champ>
      <Champ label="Alimentation">
        <div className="space-y-1.5">
          <Coche label="Intégrée au boîtier" checked={draft.alimIntegree} onChange={(v) => up({ alimIntegree: v })} />
          {draft.alimIntegree && (
            <TextInput value={draft.alimLabel} onChange={(v) => up({ alimLabel: v })} placeholder="24 VAC/DC intégrée" />
          )}
        </div>
      </Champ>
      <Champ label="Extensibilité" className="sm:col-span-2 lg:col-span-3">
        <Coche label="Accepte des modules d'extension" checked={draft.extensible} onChange={(v) => up({ extensible: v })} />
        {draft.extensible && (
          <>
            <p className="mt-2 text-xs text-muted">Modules compatibles (E/S et communication) :</p>
            <div className="mt-1 flex flex-wrap gap-3">
              {typesCompatibles.length === 0 && (
                <span className="text-xs text-subtle">Aucun module compatible défini.</span>
              )}
              {typesCompatibles.map((t) => (
                <Coche key={t} label={t} checked={draft.modulesCompat.includes(t)} onChange={() => toggleCompat(t)} />
              ))}
            </div>
          </>
        )}
      </Champ>
      {draft.extensible && (
        <>
          <Champ label="Max modules d'extension">
            <NumInput value={draft.maxModules} onChange={(v) => up({ maxModules: v })} />
          </Champ>
          <Champ label="Capacité max (points E/S)">
            <NumInput value={draft.maxPoints} onChange={(v) => up({ maxPoints: v })} />
          </Champ>
        </>
      )}
      <Champ label="Fiche technique (URL / chemin public)" className="sm:col-span-2 lg:col-span-3">
        <TextInput
          value={draft.docUrl}
          onChange={(v) => up({ docUrl: v })}
          placeholder="/materiel/Documentations_Distech/ECY-600-Series_SP.pdf"
        />
      </Champ>
      <Champ label="Actif">
        <Coche label="Disponible dans l'outil" checked={draft.actif} onChange={(v) => up({ actif: v })} />
      </Champ>
    </FormShell>
  );
}

function ModuleForm({
  draft,
  setDraft,
  pending,
  onSave,
  onCancel,
}: {
  draft: ModulePayload;
  setDraft: (d: ModulePayload) => void;
  pending: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const up = (patch: Partial<ModulePayload>) => setDraft({ ...draft, ...patch });
  return (
    <FormShell pending={pending} onSave={onSave} onCancel={onCancel}>
      <Champ label="Type">
        <TextInput value={draft.type} onChange={(v) => up({ type: v })} placeholder="8UI6UO" />
      </Champ>
      <Champ label="Catégorie">
        <SelectInput value={draft.categorie} onChange={(v) => up({ categorie: v })} options={CATEGORIES} />
      </Champ>
      <Champ label="Ordre">
        <NumInput value={draft.ordre} onChange={(v) => up({ ordre: v })} />
      </Champ>
      <Champ label="Entrées">
        <div className="flex gap-2">
          <SelectInput value={draft.entreeKind} onChange={(v) => up({ entreeKind: v })} options={ENTREE_KINDS} />
          <NumInput value={draft.entreeCount} onChange={(v) => up({ entreeCount: v })} />
        </div>
      </Champ>
      <Champ label="Sorties">
        <div className="flex gap-2">
          <SelectInput value={draft.sortieKind} onChange={(v) => up({ sortieKind: v })} options={SORTIE_KINDS} />
          <NumInput value={draft.sortieCount} onChange={(v) => up({ sortieCount: v })} />
        </div>
      </Champ>
      <Champ label="Image (chemin public)">
        <TextInput value={draft.image} onChange={(v) => up({ image: v })} placeholder="/materiel/mod-8UI6UO.png" />
      </Champ>
      <Champ label="Fiche technique (URL / chemin public)">
        <TextInput
          value={draft.docUrl}
          onChange={(v) => up({ docUrl: v })}
          placeholder="/materiel/Documentations_Distech/ECY IO Modules_SP.pdf"
        />
      </Champ>
      <Champ label="Actif">
        <Coche label="Disponible dans l'outil" checked={draft.actif} onChange={(v) => up({ actif: v })} />
      </Champ>
    </FormShell>
  );
}

// --- Primitives de formulaire ----------------------------------------------

function Champ({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("block space-y-1", className)}>
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg placeholder:text-subtle"
    />
  );
}

function NumInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      min={0}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
      className="h-9 w-20 rounded-md border border-border bg-surface px-2.5 text-sm text-fg"
    />
  );
}

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-md border border-border bg-surface px-2.5 text-sm text-fg"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function Coche({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-fg">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

// --- Conversion ligne BDD → brouillon --------------------------------------

function rowToAutoDraft(a: AutomateRow): AutomatePayload {
  return {
    id: a.id,
    reference: a.reference,
    image: a.image,
    alimIntegree: a.alimIntegree,
    alimLabel: a.alimLabel,
    entreeKind: a.entreeKind,
    entreeCount: a.entreeCount,
    sortieKind: a.sortieKind,
    sortieCount: a.sortieCount,
    entreeCodes: a.entreeCodes,
    sortieCodes: a.sortieCodes,
    extensible: a.extensible,
    modulesCompat: a.modulesCompat,
    maxModules: a.maxModules,
    maxPoints: a.maxPoints,
    docUrl: a.docUrl,
    actif: a.actif,
    ordre: a.ordre,
  };
}

function rowToModDraft(m: ModuleRow): ModulePayload {
  return {
    id: m.id,
    type: m.type,
    image: m.image,
    categorie: m.categorie,
    entreeKind: m.entreeKind,
    entreeCount: m.entreeCount,
    sortieKind: m.sortieKind,
    sortieCount: m.sortieCount,
    docUrl: m.docUrl,
    actif: m.actif,
    ordre: m.ordre,
  };
}
