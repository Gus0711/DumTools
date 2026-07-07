"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Loader2,
  Plus,
  Trash2,
  TriangleAlert,
  Upload,
  Wand2,
} from "lucide-react";
import { Button, Combobox } from "@/ui";
import { cn } from "@/lib/cn";
import {
  moduleDef,
  moduleFieldsFromDef,
  type Catalogue,
} from "./catalogue";
import {
  isCommunicationType,
  isIntegratedControllerType,
  moduleDisplayTitle,
  moduleSort,
  type Module,
  type Project,
} from "./model";
import { sauverProjet } from "./actions";
import {
  calculerBesoin,
  proposerAutomates,
  type Besoin,
  type Proposition,
} from "./reco-automate";
import { pointsToRows, syncPoints } from "./derivation";
import { ListeTab } from "./liste-tab";
import { AffectationTab } from "./affectation-tab";
import { TestsTab } from "./tests-tab";
import { Apercu } from "./apercu";
import { importGfx } from "./gfx-import";
import { importPdf } from "./pdf-import";
import type { CatalogItem } from "@/tools/liste-points/rows-editor";
import type { ModeleDef, PointRow } from "@/tools/liste-points/model";

const TABS = [
  { id: "projet", label: "Projet" },
  { id: "liste", label: "Liste de points" },
  { id: "modules", label: "Modules" },
  { id: "affectation", label: "Affectation" },
  { id: "tests", label: "Mise en service" },
  { id: "apercu", label: "Aperçu" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function Editeur({
  id,
  initial,
  clients,
  catalogue,
  cataloguePoints,
  modeles,
}: {
  id: string;
  initial: { nom: string; clientNom: string; numeroWhy: string; project: Project };
  clients: string[];
  catalogue: Catalogue;
  cataloguePoints: CatalogItem[];
  modeles: ModeleDef[];
}) {
  const [nom, setNom] = useState(initial.nom);
  const [clientNom, setClientNom] = useState(initial.clientNom);
  const [numeroWhy, setNumeroWhy] = useState(initial.numeroWhy);
  const [project, setProject] = useState<Project>(initial.project);
  const [tab, setTab] = useState<TabId>("projet");
  const [save, setSave] = useState<"saved" | "saving" | "error">("saved");
  const [importState, setImportState] = useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "error"; msg: string } | { kind: "done"; msg: string }
  >({ kind: "idle" });

  const patch = (fn: (p: Project) => Project) => setProject((p) => fn(p));
  const set = <K extends keyof Project>(key: K, value: Project[K]) =>
    patch((p) => ({ ...p, [key]: value }));

  // Édition des lignes de la liste → resynchronise les points dérivés (bornes).
  const setListeRows: React.Dispatch<React.SetStateAction<PointRow[]>> = (updater) =>
    setProject((p) => {
      const rows =
        typeof updater === "function"
          ? (updater as (r: PointRow[]) => PointRow[])(p.rows ?? [])
          : updater;
      return { ...p, rows, points: syncPoints(rows, p.points ?? []) };
    });

  // Applique une proposition d'automate : définit le contrôleur et, si la solution
  // requiert des modules d'extension, les ajoute — sauf si des modules d'E/S existent déjà.
  function appliquerProposition(prop: Proposition) {
    patch((p) => {
      let mods = p.modules ?? [];
      const aDejaModulesIo = mods.some(
        (m) => !isCommunicationType(m) && !isIntegratedControllerType(m),
      );
      if (prop.modules > 0 && prop.moduleType && !aDejaModulesIo) {
        let num = nextIoModuleNumber(mods);
        const nouveaux: Module[] = Array.from({ length: prop.modules }, () => {
          const mod = buildModule(catalogue, prop.moduleType!, num);
          num += 1;
          return mod;
        });
        mods = [...mods, ...nouveaux];
      }
      return { ...p, controller: prop.reference, modules: mods };
    });
  }

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(async () => {
      setSave("saving");
      try {
        await sauverProjet(id, { nom, clientNom, numeroWhy, project });
        setSave("saved");
      } catch {
        setSave("error");
      }
    }, 700);
    return () => clearTimeout(t);
  }, [nom, clientNom, numeroWhy, project, id]);

  const modules = useMemo(
    () => [...(project.modules ?? [])].sort(moduleSort),
    [project.modules],
  );

  async function handleGfx(file: File) {
    setImportState({ kind: "loading" });
    try {
      const res = await importGfx(file);
      setNom(res.projectFields.name);
      setProject((p) => ({
        ...p,
        ...res.projectFields,
        controller: res.controller,
        modules: res.modules,
        points: res.points,
        rows: pointsToRows(res.points),
      }));
      setImportState({
        kind: "done",
        msg: `${res.meta.controller} · ${res.meta.inputs} entrées / ${res.meta.outputs} sorties · ${res.meta.extensions} extension(s)`,
      });
      setTab("liste");
    } catch (e) {
      setImportState({
        kind: "error",
        msg: e instanceof Error ? e.message : "Import impossible",
      });
    }
  }

  async function handlePdf(file: File) {
    setImportState({ kind: "loading" });
    try {
      const res = await importPdf(file);
      setNom(res.projectFields.name);
      setProject((p) => ({
        ...p,
        ...res.projectFields,
        controller: res.controller,
        modules: res.modules,
        points: res.points,
        rows: pointsToRows(res.points),
      }));
      setImportState({
        kind: "done",
        msg: `${res.meta.controller} · ${res.meta.pages} page(s) · ${res.meta.inputs} entrées / ${res.meta.outputs} sorties`,
      });
      setTab("liste");
    } catch (e) {
      setImportState({
        kind: "error",
        msg: e instanceof Error ? e.message : "Import PDF impossible",
      });
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-6 md:px-10">
      <div className="mb-4 flex items-center justify-between gap-4">
        <Link
          href="/outils/affectation-es"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"
        >
          <ArrowLeft className="h-4 w-4" /> Projets
        </Link>
        <div className="flex items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-fg transition-colors hover:bg-surface-2">
            {importState.kind === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Importer .gfx
            <input
              type="file"
              accept=".gfx,application/zip"
              className="hidden"
              disabled={importState.kind === "loading"}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleGfx(f);
                e.target.value = "";
              }}
            />
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-fg transition-colors hover:bg-surface-2">
            <Upload className="h-4 w-4" />
            Importer PDF
            <input
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              disabled={importState.kind === "loading"}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handlePdf(f);
                e.target.value = "";
              }}
            />
          </label>
          <SaveState state={save} />
        </div>
      </div>

      {importState.kind === "error" && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {importState.msg}
        </div>
      )}
      {importState.kind === "done" && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          <Check className="mt-0.5 h-4 w-4 shrink-0" /> Import GFX réussi — {importState.msg}
        </div>
      )}

      {/* Onglets */}
      <div className="mb-5 flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px border-b-2 px-3.5 py-2 text-sm font-medium transition-colors",
              tab === t.id
                ? "border-brand text-brand"
                : "border-transparent text-muted hover:text-fg",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "projet" && (
        <ProjetTab
          nom={nom}
          setNom={setNom}
          clientNom={clientNom}
          setClientNom={setClientNom}
          numeroWhy={numeroWhy}
          setNumeroWhy={setNumeroWhy}
          clients={clients}
          project={project}
          set={set}
          catalogue={catalogue}
          onPickAutomate={appliquerProposition}
        />
      )}

      {tab === "modules" && (
        <ModulesTab modules={modules} patch={patch} catalogue={catalogue} />
      )}

      {tab === "liste" && (
        <ListeTab
          project={project}
          nom={nom}
          clientNom={clientNom}
          setRows={setListeRows}
          cataloguePoints={cataloguePoints}
          modeles={modeles}
        />
      )}

      {tab === "affectation" && (
        <AffectationTab project={project} patch={patch} modules={modules} />
      )}

      {tab === "tests" && <TestsTab project={project} patch={patch} modules={modules} />}

      {tab === "apercu" && <Apercu project={project} modules={modules} catalogue={catalogue} />}
    </div>
  );
}

// --- Onglet Projet ----------------------------------------------------------

function ProjetTab({
  nom,
  setNom,
  clientNom,
  setClientNom,
  numeroWhy,
  setNumeroWhy,
  clients,
  project,
  set,
  catalogue,
  onPickAutomate,
}: {
  nom: string;
  setNom: (v: string) => void;
  clientNom: string;
  setClientNom: (v: string) => void;
  numeroWhy: string;
  setNumeroWhy: (v: string) => void;
  clients: string[];
  project: Project;
  set: <K extends keyof Project>(key: K, value: Project[K]) => void;
  catalogue: Catalogue;
  onPickAutomate: (prop: Proposition) => void;
}) {
  const clientOptions = useMemo(() => clients.map((c) => ({ value: c })), [clients]);
  const automateOptions = useMemo(
    () => ["", ...catalogue.automates.map((a) => a.reference)],
    [catalogue.automates],
  );
  const [showReco, setShowReco] = useState(false);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Section titre="Identification">
        <Field label="Nom du projet">
          <TextInput value={nom} onChange={setNom} />
        </Field>
        <Field label="Client">
          <Combobox
            value={clientNom}
            onInput={setClientNom}
            onPick={(o) => setClientNom(o.value)}
            options={clientOptions}
            placeholder="Rechercher un client…"
          />
        </Field>
        <Field label="N° Why (réf. affaire WhySoft)">
          <TextInput value={numeroWhy} onChange={setNumeroWhy} />
        </Field>
        <Field label="En-tête (client - site)">
          <TextInput value={project.header} onChange={(v) => set("header", v)} />
        </Field>
        <Field label="Titre du document">
          <TextInput
            value={project.document_title}
            onChange={(v) => set("document_title", v)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Version">
            <TextInput value={project.version} onChange={(v) => set("version", v)} />
          </Field>
          <Field label="Date">
            <TextInput value={project.date} onChange={(v) => set("date", v)} />
          </Field>
        </div>
      </Section>

      <Section titre="Automate & alimentation">
        <Field label="Automate">
          <Select
            value={project.controller}
            onChange={(v) => set("controller", v)}
            options={automateOptions}
            labels={{ "": "— à choisir —" }}
          />
        </Field>
        <div>
          <button
            type="button"
            onClick={() => setShowReco((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-surface-2"
          >
            <Wand2 className="h-3.5 w-3.5" />
            Proposer un automate selon les E/S
          </button>
          {showReco && (
            <RecoAutomate
              project={project}
              catalogue={catalogue}
              onPick={(p) => {
                onPickAutomate(p);
                setShowReco(false);
              }}
            />
          )}
        </div>
        <Field label="Alimentation">
          <Select
            value={project.power_supply}
            onChange={(v) => set("power_supply", v)}
            options={["none", "integrated", "230V"]}
            labels={{
              none: "Aucune",
              integrated: "24 VAC/DC intégrée (ECY-PS24)",
              "230V": "100–240 VAC (ECY-PS100-240)",
            }}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-fg">
          <input
            type="checkbox"
            checked={project.include_references}
            onChange={(e) => set("include_references", e.target.checked)}
          />
          Afficher les repères dans les libellés de points
        </label>
      </Section>

      <Section titre="Réseaux">
        <Field label="Réseau 1">
          <TextInput value={project.network_1} onChange={(v) => set("network_1", v)} />
        </Field>
        <Field label="Réseau 2">
          <TextInput value={project.network_2} onChange={(v) => set("network_2", v)} />
        </Field>
        <Field label="Adresse IP automate">
          <TextInput
            value={project.controller_ip}
            onChange={(v) => set("controller_ip", v)}
          />
        </Field>
      </Section>

      <Section titre="Wi-Fi de mise en service">
        <Field label="SSID">
          <TextInput value={project.wifi_ssid} onChange={(v) => set("wifi_ssid", v)} />
        </Field>
        <Field label="Mot de passe">
          <TextInput
            value={project.wifi_password}
            onChange={(v) => set("wifi_password", v)}
          />
        </Field>
      </Section>
    </div>
  );
}

// --- Recommandation d'automate ----------------------------------------------

function RecoAutomate({
  project,
  catalogue,
  onPick,
}: {
  project: Project;
  catalogue: Catalogue;
  onPick: (prop: Proposition) => void;
}) {
  const besoin: Besoin = useMemo(() => calculerBesoin(project), [project]);
  const propositions = useMemo(() => proposerAutomates(besoin, catalogue), [besoin, catalogue]);
  const aucunPoint = besoin.entrees + besoin.sorties === 0;

  return (
    <div className="mt-2 rounded-md border border-border bg-surface-2 p-3">
      <div className="text-xs text-muted">
        Besoin :{" "}
        <b className="text-fg">{besoin.entrees}</b> entrées ({besoin.entreesAna} ana · {besoin.entreesTor} TOR) ·{" "}
        <b className="text-fg">{besoin.sorties}</b> sorties ({besoin.sortiesAna} ana · {besoin.sortiesTor} TOR)
      </div>

      {aucunPoint ? (
        <p className="mt-2 text-xs text-subtle">
          Ajoutez des entrées / sorties dans la liste de points pour obtenir une proposition.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {propositions.map((p, i) => (
            <li
              key={p.reference}
              className={cn(
                "rounded-md border p-2.5",
                i === 0 ? "border-brand bg-brand-soft" : "border-border bg-surface",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {i === 0 && (
                      <span className="rounded bg-brand px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-fg">
                        Le plus efficace
                      </span>
                    )}
                    <span className="font-medium text-fg">{p.reference}</span>
                    <span className="text-xs text-subtle">
                      {p.appareils} appareil{p.appareils > 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {p.couvreSansModule
                      ? `E/S intégrées ${p.uiIntegre}/${p.uoIntegre} — couvre sans module`
                      : p.uiIntegre > 0
                        ? `${p.uiIntegre}/${p.uoIntegre} intégrées + ${p.modules}× ${p.moduleType}`
                        : `${p.modules}× module ${p.moduleType}`}
                  </div>
                  <div className="mt-0.5 text-xs text-subtle">
                    {p.entreesDispo} E / {p.sortiesDispo} S dispo · reste {p.resteEntrees} E · {p.resteSorties} S libres
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={i === 0 ? "primary" : "outline"}
                  onClick={() => onPick(p)}
                >
                  Choisir
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- Onglet Modules ---------------------------------------------------------

/** Construit un objet Module (avec E/S dénormalisées) depuis le catalogue. */
function buildModule(catalogue: Catalogue, type: string, number: number): Module {
  const def = moduleDef(catalogue, type);
  const fields = def
    ? moduleFieldsFromDef(def)
    : { inputKind: "UI", inputCount: 0, outputKind: "UO", outputCount: 0 };
  return { number, type, ...fields };
}

function nextIoModuleNumber(modules: Module[]): number {
  const nums = modules
    .filter((m) => !isCommunicationType(m) && !isIntegratedControllerType(m))
    .map((m) => Number(m.number) || 0)
    .filter((n) => n > 0);
  return nums.length ? Math.max(...nums) + 1 : 1;
}

function ModulesTab({
  modules,
  patch,
  catalogue,
}: {
  modules: Module[];
  patch: (fn: (p: Project) => Project) => void;
  catalogue: Catalogue;
}) {
  const typeOptions = useMemo(
    () => catalogue.modules.filter((m) => m.categorie !== "accessoire").map((m) => m.type),
    [catalogue.modules],
  );
  const defaultType = typeOptions.includes("8UI6UO") ? "8UI6UO" : typeOptions[0] ?? "8UI6UO";

  function addModule() {
    patch((p) => {
      const num = nextIoModuleNumber(p.modules ?? []);
      return { ...p, modules: [...(p.modules ?? []), buildModule(catalogue, defaultType, num)] };
    });
  }
  function changeType(number: number, type: string) {
    patch((p) => ({
      ...p,
      modules: (p.modules ?? []).map((m) =>
        m.number === number ? buildModule(catalogue, type, number) : m,
      ),
    }));
  }
  function remove(number: number) {
    patch((p) => ({
      ...p,
      modules: (p.modules ?? []).filter((m) => m.number !== number),
    }));
  }

  return (
    <div>
      <div className="mb-3">
        <Button size="sm" onClick={addModule}>
          <Plus className="h-4 w-4" /> Ajouter un module
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
              <th className="px-4 py-2.5 font-medium">Module</th>
              <th className="px-4 py-2.5 font-medium">Type</th>
              <th className="px-4 py-2.5 text-center font-medium">Entrées</th>
              <th className="px-4 py-2.5 text-center font-medium">Sorties</th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {modules.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-subtle">
                  Aucun module. Ajoutez-en un ou importez un fichier .gfx (bientôt).
                </td>
              </tr>
            )}
            {modules.map((m) => {
              // Les modules de communication (MBUS/RS485) sont manipulables ;
              // seuls les automates à E/S intégrées restent verrouillés.
              const editable = !isIntegratedControllerType(m);
              return (
                <tr key={m.number} className="border-b border-border-soft last:border-0">
                  <td className="px-4 py-2 font-medium text-fg">
                    {moduleDisplayTitle(m, modules)}
                  </td>
                  <td className="px-4 py-2">
                    {editable ? (
                      <Select
                        value={m.type}
                        onChange={(v) => changeType(m.number, v)}
                        options={typeOptions}
                      />
                    ) : (
                      <span className="text-muted">{m.type}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center tabular-nums text-muted">
                    {m.inputCount || 0} {m.inputKind}
                  </td>
                  <td className="px-4 py-2 text-center tabular-nums text-muted">
                    {m.outputCount || 0} {m.outputKind}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      aria-label="Supprimer le module"
                      onClick={() => remove(m.number)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-subtle transition-colors hover:bg-danger/12 hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Primitives locales -----------------------------------------------------

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h2 className="mb-4 text-sm font-semibold text-fg">{titre}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

function TextInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg placeholder:text-subtle"
    />
  );
}

function Select({
  value,
  onChange,
  options,
  labels,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  labels?: Record<string, string>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {labels?.[o] ?? o}
        </option>
      ))}
    </select>
  );
}

function SaveState({ state }: { state: "saved" | "saving" | "error" }) {
  if (state === "saving")
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Enregistrement…
      </span>
    );
  if (state === "error")
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-danger">
        <TriangleAlert className="h-4 w-4" /> Erreur d’enregistrement
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-success">
      <Check className="h-4 w-4" /> Enregistré
    </span>
  );
}
