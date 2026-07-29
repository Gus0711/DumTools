"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Download,
  FileUp,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { Badge, Button, EnteteSection, Label } from "@/ui";
import { cn } from "@/lib/cn";
import {
  appliquerImport,
  exporterProduitsCsv,
  lireFichier,
  previsualiserImport,
} from "./import";
import { genererModele, nomFichierModele, telechargerCsv } from "./modele-import";
import {
  CHAMPS,
  GENRE_AIDE,
  GENRE_LABEL,
  devinerMapping,
  type GenreImport,
  type GrilleImport,
  type ResultatImport,
} from "./import-model";

/* =============================================================================
 * LA REPRISE DE DONNÉES
 * Trois écrans en un : le fichier, la correspondance des colonnes, l'aperçu.
 * L'aperçu n'est pas une politesse, c'est la règle : rien ne part en base avant
 * d'avoir montré, ligne par ligne, ce qui va être créé, mis à jour ou rejeté.
 *
 * L'import SERT AUSSI À METTRE À JOUR : une référence déjà connue est modifiée,
 * pas dupliquée. Et une cellule vide LAISSE la valeur en place — on peut donc
 * envoyer un fichier « référence + prix » sans effacer le reste. D'où le couple
 * exporter → corriger dans Excel → réimporter.
 * ========================================================================== */

const GENRES: GenreImport[] = ["produits", "stock"];

const selectCls =
  "h-[var(--control-h)] w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg";

export function ImportMagasin() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const inputFichier = useRef<HTMLInputElement>(null);

  const [genre, setGenre] = useState<GenreImport>("produits");
  const [grille, setGrille] = useState<GrilleImport | null>(null);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [apercu, setApercu] = useState<ResultatImport | null>(null);
  const [applique, setApplique] = useState<ResultatImport | null>(null);

  function choisirFichier(fichier: File) {
    setErreur(null);
    setApercu(null);
    setApplique(null);
    const formData = new FormData();
    formData.set("fichier", fichier);
    startTransition(async () => {
      try {
        const g = await lireFichier(formData);
        setGrille(g);
        setMapping(devinerMapping(genre, g.colonnes));
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Fichier illisible");
      }
    });
  }

  function changerGenre(g: GenreImport) {
    setGenre(g);
    setApercu(null);
    setApplique(null);
    if (grille) setMapping(devinerMapping(g, grille.colonnes));
  }

  function lancerApercu() {
    if (!grille) return;
    setErreur(null);
    startTransition(async () => {
      try {
        setApercu(await previsualiserImport({ genre, mapping, lignes: grille.lignes }));
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Erreur inattendue");
      }
    });
  }

  function appliquer() {
    if (!grille) return;
    setErreur(null);
    startTransition(async () => {
      try {
        const r = await appliquerImport({
          genre,
          mapping,
          lignes: grille.lignes,
          nomFichier: grille.nomFichier,
        });
        setApplique(r);
        setApercu(null);
        router.refresh();
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Erreur inattendue");
      }
    });
  }

  function recommencer() {
    setGrille(null);
    setMapping({});
    setApercu(null);
    setApplique(null);
    setErreur(null);
    if (inputFichier.current) inputFichier.current.value = "";
  }

  const champs = CHAMPS[genre];

  return (
    <>
      {erreur && (
        <div className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {erreur}
        </div>
      )}

      {/* 1. Quoi importer --------------------------------------------------- */}
      <section className="mb-6">
        <EnteteSection titre="1 · Ce qu'on importe" />
        <div className="planche grid-cols-1 sm:grid-cols-2">
          {GENRES.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => changerGenre(g)}
              className={cn(
                "bloc px-4 py-3 text-left transition-colors",
                g === genre ? "bg-brand-soft" : "hover:bg-surface-2",
              )}
            >
              <span className={cn("stamp block", g === genre && "text-brand")}>
                {GENRE_LABEL[g]}
              </span>
              <span className="mt-1.5 block text-xs leading-relaxed text-muted">
                {GENRE_AIDE[g]}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* 2. Le fichier ------------------------------------------------------ */}
      <section className="mb-6">
        <EnteteSection
          titre="2 · Le fichier"
          actions={
            grille ? (
              <Button size="sm" variant="ghost" onClick={recommencer}>
                <RotateCcw className="h-4 w-4" /> Changer
              </Button>
            ) : null
          }
        />
        {!grille ? (
          <div className="bloc flex flex-col items-center gap-3 px-4 py-8 text-center">
            <FileUp className="h-8 w-8 text-subtle" />
            <p className="text-sm text-muted">
              CSV (séparateur <span className="ref">;</span> ou <span className="ref">,</span>) ou
              Excel <span className="ref">.xlsx</span> — la première ligne doit porter les titres
              de colonnes.
            </p>

            {/* De quoi partir : un modèle vierge, ou l'existant à corriger. */}
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => telechargerCsv(nomFichierModele(genre), genererModele(genre))}
              >
                <Download className="h-4 w-4" />
                Modèle d&apos;exemple
              </Button>
              {genre === "produits" && (
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      try {
                        const { nomFichier, contenu } = await exporterProduitsCsv();
                        telechargerCsv(nomFichier, contenu);
                      } catch (e) {
                        setErreur(e instanceof Error ? e.message : "Export impossible");
                      }
                    })
                  }
                >
                  <Download className="h-4 w-4" />
                  Exporter l&apos;existant
                </Button>
              )}
            </div>
            <p className="max-w-lg text-xs text-muted">
              Pour <strong>modifier en masse</strong> (prix, seuils, emplacements) : exportez
              l&apos;existant, corrigez dans Excel, réimportez. Une référence déjà connue est mise
              à jour, et <strong>une cellule vide ne touche à rien</strong> — un fichier
              « référence + prix » suffit.
            </p>
            <input
              ref={inputFichier}
              type="file"
              accept=".csv,.txt,.xlsx,.xls"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) choisirFichier(f);
              }}
              className="text-sm text-muted file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-fg"
            />
            {pending && <Loader2 className="h-5 w-5 animate-spin text-muted" />}
          </div>
        ) : (
          <div className="bloc px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-sm text-fg">{grille.nomFichier}</span>
              <span className="text-sm text-muted">
                {grille.total} ligne{grille.total > 1 ? "s" : ""} · {grille.colonnes.length}{" "}
                colonnes
              </span>
              {grille.tronquee && (
                <Badge tone="warning">
                  Tronqué à {grille.lignes.length} lignes
                </Badge>
              )}
            </div>
          </div>
        )}
      </section>

      {/* 3. Correspondance des colonnes ------------------------------------- */}
      {grille && !applique && (
        <section className="mb-6">
          <EnteteSection titre="3 · À quoi correspondent les colonnes" />
          <div className="bloc px-4 py-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {champs.map((c) => (
                <div key={c.cle}>
                  <Label>
                    {c.libelle}
                    {c.requis && <span className="ml-1 text-danger">*</span>}
                  </Label>
                  <select
                    value={mapping[c.cle] ?? -1}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setMapping((m) => {
                        const suivant = { ...m };
                        if (v < 0) delete suivant[c.cle];
                        else suivant[c.cle] = v;
                        return suivant;
                      });
                      setApercu(null);
                    }}
                    className={cn("mt-1", selectCls)}
                  >
                    <option value={-1}>— Ignorer —</option>
                    {grille.colonnes.map((col, i) => (
                      <option key={i} value={i}>
                        {col}
                      </option>
                    ))}
                  </select>
                  {c.aide && <p className="mt-1 text-xs text-muted">{c.aide}</p>}
                </div>
              ))}
            </div>

            {/* Trois lignes d'exemple : on vérifie d'un coup d'œil qu'on ne
                s'est pas trompé de colonne. */}
            <div className="mt-4 overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    {champs
                      .filter((c) => mapping[c.cle] !== undefined)
                      .map((c) => (
                        <th key={c.cle}>{c.libelle}</th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {grille.lignes.slice(0, 3).map((ligne, i) => (
                    <tr key={i}>
                      {champs
                        .filter((c) => mapping[c.cle] !== undefined)
                        .map((c) => (
                          <td key={c.cle} className="whitespace-nowrap">
                            {ligne[mapping[c.cle]] || <span className="text-subtle">—</span>}
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-end">
              <Button onClick={lancerApercu} disabled={pending}>
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                Voir ce que ça donnerait
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* 4. Aperçu ---------------------------------------------------------- */}
      {apercu && (
        <section className="mb-6">
          <EnteteSection titre="4 · Aperçu — rien n'est encore écrit" />
          <Bilan resultat={apercu} />
          <TableauLignes resultat={apercu} />
          <div className="mt-4 flex items-center justify-end gap-3">
            {apercu.nbRejetees > 0 && (
              <span className="text-sm text-muted">
                Les lignes rejetées seront simplement ignorées.
              </span>
            )}
            <Button onClick={appliquer} disabled={pending || apercu.nbCreees + apercu.nbMajs === 0}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Écrire en base
            </Button>
          </div>
        </section>
      )}

      {/* 5. Résultat -------------------------------------------------------- */}
      {applique && (
        <section className="mb-6">
          <EnteteSection titre="Import terminé" />
          <div className="mb-3 flex items-center gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
            <Check className="h-4 w-4" />
            {applique.nbCreees} création{applique.nbCreees > 1 ? "s" : ""} ·{" "}
            {applique.nbMajs} mise{applique.nbMajs > 1 ? "s" : ""} à jour ·{" "}
            {applique.nbRejetees} rejet{applique.nbRejetees > 1 ? "s" : ""}
          </div>
          <TableauLignes resultat={applique} />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={recommencer}>
              Importer autre chose
            </Button>
            <Button onClick={() => router.push("/outils/magasin")}>Voir le rayon</Button>
          </div>
        </section>
      )}
    </>
  );
}

function Bilan({ resultat }: { resultat: ResultatImport }) {
  return (
    <div className="planche mb-3 grid-cols-3">
      <div className="bloc px-4 py-3">
        <span className="stamp block">À créer</span>
        <span className="chiffre chiffre-sm mt-1.5 block text-success">{resultat.nbCreees}</span>
      </div>
      <div className="bloc px-4 py-3">
        <span className="stamp block">À mettre à jour</span>
        <span className="chiffre chiffre-sm mt-1.5 block text-brand">{resultat.nbMajs}</span>
      </div>
      <div className="bloc px-4 py-3">
        <span className="stamp block">Rejetées</span>
        <span
          className={cn(
            "chiffre chiffre-sm mt-1.5 block",
            resultat.nbRejetees > 0 ? "text-danger" : "text-fg",
          )}
        >
          {resultat.nbRejetees}
        </span>
      </div>
    </div>
  );
}

function TableauLignes({ resultat }: { resultat: ResultatImport }) {
  // Les rejets d'abord : c'est ce qu'il faut regarder.
  const lignes = [...resultat.lignes].sort((a, b) => {
    if (a.action === "rejet" && b.action !== "rejet") return -1;
    if (b.action === "rejet" && a.action !== "rejet") return 1;
    return a.index - b.index;
  });

  return (
    <div className="data-card max-h-[28rem] overflow-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th>Ligne</th>
            <th>Action</th>
            <th>Référence</th>
            <th>Détail</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={`${l.index}-${l.action}`}>
              <td className="tabular-nums text-subtle">{l.index + 2}</td>
              <td>
                {l.action === "rejet" ? (
                  <Badge tone="danger">
                    <AlertTriangle className="h-3 w-3" /> Rejet
                  </Badge>
                ) : l.action === "creation" ? (
                  <Badge tone="success">Création</Badge>
                ) : (
                  <Badge tone="brand">Mise à jour</Badge>
                )}
              </td>
              <td className="ref">{l.libelle}</td>
              <td className={cn(l.motif ? "text-danger" : "text-muted")}>{l.motif ?? l.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
