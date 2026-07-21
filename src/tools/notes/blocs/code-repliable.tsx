"use client";

import { createCodeBlockSpec } from "@blocknote/core";

/* Bloc de CODE REPLIABLE.
 *
 * On enveloppe le bloc de code natif de BlockNote (`createCodeBlockSpec`) sans
 * le réécrire : la coloration Shiki et le sélecteur de langage restent gérés
 * par le cœur. On lui ajoute seulement :
 *   - un prop `collapsed` PERSISTANT (rétro-compatible, défaut `false` — les
 *     anciens documents s'ouvrent dépliés) ;
 *   - une barre d'en-tête avec un chevron qui plie/déplie le `<pre>`, pour
 *     qu'un long extrait ne monopolise plus la page (comme dans un IDE).
 *
 * Le sélecteur de langage natif (créé par le cœur) est simplement DÉPLACÉ dans
 * notre en-tête pour cohabiter avec le chevron.
 *
 * Impression / PDF / page publique : le repli est une commodité d'édition et de
 * lecture à l'écran ; l'aperçu imprimable force le déplié (voir `notes.css`,
 * scope `.note-print`) pour ne jamais produire un PDF au code tronqué. */

type CodeBlockOptions = Parameters<typeof createCodeBlockSpec>[0];
type SpecCode = ReturnType<typeof createCodeBlockSpec>;
type RenderCode = NonNullable<SpecCode["implementation"]["render"]>;
type BlocRendu = Parameters<RenderCode>[0];
type EditeurRendu = Parameters<RenderCode>[1];
type ResultatRendu = ReturnType<RenderCode>;

/** Chevron (lucide « chevron-right ») pivoté en CSS selon l'état. */
const CHEVRON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"' +
  ' stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<polyline points="9 18 15 12 9 6"></polyline></svg>';

/** Texte brut du bloc (contenu inline) → nombre de lignes affiché replié. */
function texteDuBloc(block: { content?: unknown }): string {
  const c = block.content;
  if (!Array.isArray(c)) return "";
  return c
    .map((n) =>
      n && typeof n === "object" && "text" in n ? String((n as { text?: unknown }).text ?? "") : "",
    )
    .join("");
}

export function blocCodeRepliable(options: CodeBlockOptions): SpecCode {
  const base = createCodeBlockSpec(options);
  // Le `render` du cœur lit son contexte (`this.blockContentDOMAttributes`,
  // `this.renderType`…) : on le rappelle en RÉ-ACHEMINANT `this` (d'où une
  // fonction normale, pas une fonction fléchée).
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
    // Après `wrapInBlockStructure`, `res.dom` est le <div.bn-block-content> ; le
    // <code> (contentDOM) est dans le <pre>, tous deux enfants de ce div.
    const contentEl = res.dom as HTMLElement;
    const code = res.contentDOM as HTMLElement | undefined;
    const pre = code?.parentElement ?? null;
    // Garde-fou : structure inattendue → on rend le bloc tel quel.
    if (!(contentEl instanceof HTMLElement) || !pre) return res;

    const selectWrapper = contentEl.querySelector("select")?.parentElement ?? null;
    const nbLignes = Math.max(1, texteDuBloc(block).split("\n").length);
    const initReplie = Boolean((block.props as { collapsed?: boolean }).collapsed);

    const header = document.createElement("div");
    header.className = "code-repliable-header";
    header.contentEditable = "false";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "code-repliable-btn";
    btn.innerHTML =
      `<span class="code-repliable-chevron">${CHEVRON}</span>` +
      `<span class="code-repliable-info"></span>`;
    const info = btn.querySelector(".code-repliable-info") as HTMLElement;

    header.appendChild(btn);
    if (selectWrapper) header.appendChild(selectWrapper); // langage natif, à côté du chevron
    contentEl.insertBefore(header, pre);

    const appliquer = (replie: boolean) => {
      header.dataset.collapsed = String(replie);
      pre.dataset.collapsed = String(replie);
      btn.setAttribute("aria-expanded", String(!replie));
      btn.setAttribute("aria-label", replie ? "Déplier le code" : "Replier le code");
      info.textContent = replie ? `${nbLignes} ligne${nbLignes > 1 ? "s" : ""}` : "";
    };
    appliquer(initReplie);

    const onMouseDown = (e: MouseEvent) => e.preventDefault(); // ne pas voler la sélection texte
    const onClick = (e: MouseEvent) => {
      e.preventDefault();
      const suivant = header.dataset.collapsed !== "true";
      if (editor.isEditable) {
        // Persiste l'état : le bloc se re-render (pas de `update()` → NodeView
        // recréée), l'en-tête est reconstruit à jour.
        (editor.updateBlock as (id: string, u: unknown) => void)(block.id, {
          props: { collapsed: suivant },
        });
      } else {
        appliquer(suivant); // lecture seule : repli local, non persistant
      }
    };
    btn.addEventListener("mousedown", onMouseDown);
    btn.addEventListener("click", onClick);

    return {
      ...res,
      destroy: () => {
        btn.removeEventListener("mousedown", onMouseDown);
        btn.removeEventListener("click", onClick);
        res.destroy?.();
      },
    };
  };

  return {
    ...base,
    config: {
      ...base.config,
      propSchema: {
        ...base.config.propSchema,
        collapsed: { default: false },
      },
    },
    implementation: {
      ...base.implementation,
      render,
    },
  } as SpecCode;
}
