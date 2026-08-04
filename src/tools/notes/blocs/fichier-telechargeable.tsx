"use client";

import { defaultBlockSpecs } from "@blocknote/core";

/* Bloc FICHIER TÉLÉCHARGEABLE.
 *
 * BlockNote rend une pièce jointe comme un simple <div> « icône + nom » : ni
 * lien, ni gestionnaire de clic. Le téléchargement vit dans la barre d'outils
 * flottante du bloc — que les vues LECTURE SEULE éteignent (aperçu avant
 * impression, page publique /n/[jeton]). Sur un partage client, le nom du
 * fichier était donc du texte mort.
 *
 * On enveloppe le bloc natif sans le réécrire (même patron que
 * `code-repliable.tsx`) et on glisse le « icône + nom » dans un vrai <a> :
 *   - vrai lien, donc clic droit « enregistrer sous », clic milieu, clavier ;
 *   - `download` + `?dl=1` (Content-Disposition: attachment, voir
 *     `stockage.ts`) pour qu'un PDF se TÉLÉCHARGE au lieu de s'ouvrir dans
 *     l'onglet ;
 *   - en ÉDITION le clic est neutralisé : il doit continuer de sélectionner le
 *     bloc, l'éditeur ayant déjà son bouton de téléchargement.
 *
 * ⚠️ Aucun prop n'est ajouté au bloc natif — c'est ce qui déclenche le
 * `Cannot read properties of undefined (reading 'default')` de
 * `wrapInBlockStructure` (voir l'en-tête de `code-repliable.tsx`).
 */

type SpecFichier = (typeof defaultBlockSpecs)["file"];
type RenderFichier = NonNullable<SpecFichier["implementation"]["render"]>;
type BlocRendu = Parameters<RenderFichier>[0];
type EditeurRendu = Parameters<RenderFichier>[1];
type ResultatRendu = ReturnType<RenderFichier>;

/**
 * URL de téléchargement d'une pièce jointe. Le drapeau n'est posé que sur NOS
 * routes média : une URL externe collée dans la note ne connaît pas `dl`, et
 * l'attribut `download` y serait de toute façon ignoré (autre origine).
 */
export function urlTelechargement(url: string): string {
  if (!url.startsWith("/api/")) return url;
  return url.includes("?") ? `${url}&dl=1` : `${url}?dl=1`;
}

export function blocFichierTelechargeable(): SpecFichier {
  const base = defaultBlockSpecs.file;
  // Le `render` du cœur lit son contexte (`this.blockContentDOMAttributes`…) :
  // on le rappelle en RÉ-ACHEMINANT `this` (fonction normale, pas fléchée).
  const renderBase = base.implementation.render as unknown as (
    this: unknown,
    block: BlocRendu,
    editor: EditeurRendu,
  ) => ResultatRendu;

  const render = function (
    this: unknown,
    block: BlocRendu,
    editor: EditeurRendu,
  ): ResultatRendu {
    const res = renderBase.call(this, block, editor);
    const props = block.props as { url?: string; name?: string };
    const url = String(props.url ?? "");
    // Bloc encore vide (bouton « Ajouter un fichier ») : rien à télécharger.
    if (!url) return res;

    const contentEl = res.dom as HTMLElement;
    const nomEl = contentEl?.querySelector?.(".bn-file-name-with-icon");
    // Garde-fou : si BlockNote change sa structure, on rend le bloc tel quel
    // plutôt que de casser le document.
    if (!(contentEl instanceof HTMLElement) || !(nomEl instanceof HTMLElement)) return res;
    const parent = nomEl.parentElement;
    if (!parent) return res;

    const nom = String(props.name ?? "");
    const lien = document.createElement("a");
    lien.className = "note-fichier-lien";
    lien.href = urlTelechargement(url);
    if (nom) lien.download = nom;
    lien.title = nom ? `Télécharger ${nom}` : "Télécharger le fichier";
    lien.setAttribute("contenteditable", "false");
    // Une pièce jointe d'une note partagée ne doit pas fuiter l'URL du partage.
    lien.rel = "noopener noreferrer";
    // Un <a> est draggable par défaut : sans ça, glisser une pièce jointe dans
    // l'éditeur déplacerait le LIEN au lieu du bloc.
    lien.draggable = false;

    parent.insertBefore(lien, nomEl);
    lien.appendChild(nomEl);

    // `isEditable` est décidé AU CLIC, pas au rendu : au premier rendu d'une vue
    // lecture seule, BlockNoteView n'a pas encore appliqué `editable={false}`.
    const onClick = (e: MouseEvent) => {
      if (editor.isEditable) e.preventDefault();
    };
    lien.addEventListener("click", onClick);

    return {
      ...res,
      destroy: () => {
        lien.removeEventListener("click", onClick);
        res.destroy?.();
      },
    };
  };

  return {
    ...base,
    implementation: { ...base.implementation, render },
  } as SpecFichier;
}
