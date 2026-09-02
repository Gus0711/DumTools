"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, FileText, Link2, Paperclip, Trash2, Unlink, Upload } from "lucide-react";
import { Badge, Button, EtatVide, Input, Label } from "@/ui";
import {
  CATEGORIES_DOC,
  TAILLE_MAX_DOCUMENTATION,
  formatTaille,
  libelleCategorieDoc,
  lienDocumentation,
  type DocumentationVue,
} from "./model";
import {
  detacherDocumentation,
  enregistrerDocumentation,
  rattacherDocumentation,
  supprimerDocumentation,
} from "./actions";

/* =============================================================================
 * LA DOCUMENTATION D'UN PRODUIT
 *
 * Elle vit ICI, sur la fiche article, et plus dans un dossier de PDF rangé à
 * côté de l'application : c'est ce qui permet de la retrouver depuis la base
 * matériel et de l'annexer à un devis sans aller la chercher.
 *
 * Trois gestes, et le deuxième est celui qui compte :
 *   TÉLÉVERSER  le PDF arrive sur le disque de la VM (plus de commit, plus de
 *               reconstruction d'image pour ajouter une fiche) ;
 *   RATTACHER   une fiche DÉJÀ dans la bibliothèque — « ECY IO Modules » sert
 *               les six modules d'extension, et ne doit exister qu'une fois ;
 *   METTRE EN LIEN  ce qui vit chez le constructeur y reste, et reste à jour.
 *
 * Détacher n'est pas supprimer : la fiche sert peut-être cinq autres produits.
 * ========================================================================== */

const selectCls =
  "mt-1 h-[var(--control-h)] w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg";

type Mode = null | "televerser" | "lien" | "rattacher";

export function DocumentationProduit({
  produitId,
  documentations,
  bibliotheque,
  peutGerer,
}: {
  produitId: string;
  documentations: DocumentationVue[];
  /** Tout le référentiel, pour rattacher sans quitter l'écran. La bibliothèque
   *  se compte en dizaines : on la filtre ici plutôt que d'ouvrir une route. */
  bibliotheque: DocumentationVue[];
  peutGerer: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  // Un booléen plutôt qu'un `useTransition` : React se réserve le droit de
  // rejouer un rendu de transition, et la réponse de l'écriture s'y perd
  // (docs/DEVIS.md §20).
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const [titre, setTitre] = useState("");
  const [url, setUrl] = useState("");
  const [categorie, setCategorie] = useState("fiche");
  const [filtre, setFiltre] = useState("");
  const champFichier = useRef<HTMLInputElement>(null);

  const dejaLa = new Set(documentations.map((d) => d.id));
  const terme = filtre.trim().toLowerCase();
  const candidates = bibliotheque
    .filter((d) => !dejaLa.has(d.id))
    .filter((d) => !terme || d.titre.toLowerCase().includes(terme));

  function fermer() {
    setMode(null);
    setTitre("");
    setUrl("");
    setFiltre("");
    setErreur(null);
  }

  async function agir(fn: () => Promise<unknown>) {
    setErreur(null);
    setEnCours(true);
    try {
      await fn();
      fermer();
      router.refresh();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Opération impossible");
    } finally {
      setEnCours(false);
    }
  }

  /** Le binaire ne passe PAS par une server action : il monte en multipart sur
   *  la route de téléversement, qui porte la garde Achats en clair. */
  async function televerser(file: File) {
    if (file.size > TAILLE_MAX_DOCUMENTATION) {
      setErreur(`Fichier trop volumineux (max ${Math.round(TAILLE_MAX_DOCUMENTATION / 1048576)} Mo)`);
      return;
    }
    const fd = new FormData();
    fd.set("file", file);
    fd.set("produitId", produitId);
    fd.set("categorie", categorie);
    if (titre.trim()) fd.set("titre", titre.trim());

    await agir(async () => {
      const r = await fetch("/api/magasin/documentation", { method: "POST", body: fd });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        throw new Error(j?.error ?? "Téléversement refusé");
      }
    });
  }

  return (
    <section className="mb-6">
      <div className="bloc">
        <header className="bloc-entete flex flex-wrap items-center gap-3">
          <FileText className="h-4 w-4 shrink-0 text-signal" />
          <h2 className="min-w-0 flex-1 font-display text-sm font-semibold text-fg">
            Documentation
            {documentations.length > 0 && (
              <span className="ml-2 text-xs font-normal text-subtle">
                {documentations.length}
              </span>
            )}
          </h2>
          {peutGerer && !mode && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => setMode("rattacher")}>
                <Link2 className="h-3.5 w-3.5" /> Rattacher
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMode("lien")}>
                <ExternalLink className="h-3.5 w-3.5" /> Lien
              </Button>
              <Button size="sm" onClick={() => setMode("televerser")}>
                <Upload className="h-3.5 w-3.5" /> Téléverser
              </Button>
            </div>
          )}
        </header>

        {erreur && (
          <p className="border-b border-hairline bg-danger-soft px-4 py-2 text-sm text-danger">
            {erreur}
          </p>
        )}

        {/* --- Les fiches rattachées --------------------------------------- */}
        {documentations.length === 0 && !mode ? (
          <EtatVide
            dessin="pochette"
            titre="Aucune documentation"
            texte={
              peutGerer
                ? "Déposez la fiche technique du constructeur : elle suivra ce produit partout — base matériel, et annexes des devis qui le chiffrent."
                : "Aucune fiche n'est rattachée à ce produit."
            }
          />
        ) : (
          <ul className="divide-y divide-hairline">
            {documentations.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <a
                  href={lienDocumentation(d)}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-sm font-medium text-fg hover:text-brand hover:underline"
                >
                  {d.titre}
                </a>
                <Badge tone="neutral">{libelleCategorieDoc(d.categorie)}</Badge>
                <span className="shrink-0 text-xs text-subtle">
                  {d.url ? "lien constructeur" : formatTaille(d.taille)}
                  {/* Le compte rend la mutualisation visible — et prévient
                      avant de supprimer ce qui sert ailleurs. */}
                  {d.nbProduits > 1 && ` · ${d.nbProduits} produits`}
                </span>
                {peutGerer && (
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      disabled={enCours}
                      onClick={() => agir(() => detacherDocumentation(produitId, d.id))}
                      title="Détacher de ce produit (la fiche reste dans la bibliothèque)"
                      aria-label="Détacher"
                      className="text-subtle transition-colors hover:text-fg"
                    >
                      <Unlink className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={enCours}
                      onClick={() => {
                        const autres = d.nbProduits - 1;
                        const avertissement =
                          autres > 0
                            ? `Cette fiche sert encore ${autres} autre${autres > 1 ? "s" : ""} produit${autres > 1 ? "s" : ""}. La supprimer la retire partout. Continuer ?`
                            : "Supprimer définitivement cette documentation ?";
                        if (confirm(avertissement)) agir(() => supprimerDocumentation(d.id));
                      }}
                      title="Supprimer la fiche partout"
                      aria-label="Supprimer"
                      className="text-subtle transition-colors hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* --- Téléverser --------------------------------------------------- */}
        {mode === "televerser" && (
          <div className="space-y-3 border-t border-hairline p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Titre (facultatif)</Label>
                <Input
                  value={titre}
                  onChange={(e) => setTitre(e.target.value)}
                  placeholder="À défaut, le nom du fichier"
                />
              </div>
              <div>
                <Label>Nature</Label>
                <select
                  value={categorie}
                  onChange={(e) => setCategorie(e.target.value)}
                  className={selectCls}
                >
                  {CATEGORIES_DOC.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.libelle}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <input
              ref={champFichier}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.zip"
              className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border file:border-border file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:text-fg"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) televerser(f);
              }}
            />
            <p className="text-xs text-subtle">
              PDF, image ou document bureautique, {Math.round(TAILLE_MAX_DOCUMENTATION / 1048576)}{" "}
              Mo maximum. Le fichier est déposé sur le serveur, pas dans le code : plus besoin de
              reconstruire l&apos;application pour ajouter une fiche.
            </p>
            <Button size="sm" variant="ghost" onClick={fermer} disabled={enCours}>
              Annuler
            </Button>
          </div>
        )}

        {/* --- Mettre en lien ----------------------------------------------- */}
        {mode === "lien" && (
          <div className="space-y-3 border-t border-hairline p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Titre</Label>
                <Input
                  value={titre}
                  onChange={(e) => setTitre(e.target.value)}
                  placeholder="Fiche technique ECY-303"
                />
              </div>
              <div>
                <Label>Nature</Label>
                <select
                  value={categorie}
                  onChange={(e) => setCategorie(e.target.value)}
                  className={selectCls}
                >
                  {CATEGORIES_DOC.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.libelle}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label>Adresse</Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.distech-controls.com/…"
              />
              <p className="mt-1 text-xs text-subtle">
                Ce qui vit chez le constructeur y reste : le lien montrera toujours la version à
                jour, sans qu&apos;on ait à la reprendre.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                disabled={enCours || !titre.trim() || !url.trim()}
                onClick={() =>
                  agir(() =>
                    enregistrerDocumentation({ titre, url, categorie, produitId }),
                  )
                }
              >
                Ajouter
              </Button>
              <Button size="sm" variant="ghost" onClick={fermer} disabled={enCours}>
                Annuler
              </Button>
            </div>
          </div>
        )}

        {/* --- Rattacher une fiche existante -------------------------------- */}
        {mode === "rattacher" && (
          <div className="space-y-3 border-t border-hairline p-4">
            <div>
              <Label>Chercher dans la bibliothèque</Label>
              <Input
                value={filtre}
                onChange={(e) => setFiltre(e.target.value)}
                placeholder="ECY IO Modules…"
                autoFocus
              />
            </div>
            {candidates.length === 0 ? (
              <p className="text-sm text-subtle">
                {bibliotheque.length === 0
                  ? "La bibliothèque est vide : téléversez une première fiche."
                  : "Aucune fiche ne correspond — ou elles sont toutes déjà rattachées."}
              </p>
            ) : (
              <ul className="max-h-64 divide-y divide-hairline overflow-y-auto border border-hairline">
                {candidates.slice(0, 40).map((d) => (
                  <li key={d.id} className="flex items-center gap-2 px-3 py-2">
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-subtle" />
                    <span className="min-w-0 flex-1 truncate text-sm text-fg">{d.titre}</span>
                    <span className="shrink-0 text-xs text-subtle">
                      {libelleCategorieDoc(d.categorie)}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={enCours}
                      onClick={() => agir(() => rattacherDocumentation(produitId, d.id))}
                    >
                      Rattacher
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <Button size="sm" variant="ghost" onClick={fermer} disabled={enCours}>
              Fermer
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
