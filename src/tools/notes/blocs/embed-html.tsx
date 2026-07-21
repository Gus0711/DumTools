"use client";

import { useState } from "react";
import { Check, Code2, Pencil, X } from "lucide-react";
import { createReactBlockSpec, type ReactCustomBlockRenderProps } from "@blocknote/react";

/* Bloc « page HTML embarquée » : l'utilisateur colle du HTML (rapport généré,
 * mini-outil, visualisation…), rendu dans une iframe SANDBOXÉE.
 *
 * Sécurité — les notes peuvent être partagées publiquement : l'iframe est en
 * `sandbox="allow-scripts"` SANS `allow-same-origin`. Le HTML embarqué tourne
 * dans une origine opaque : il ne peut ni lire les cookies de session, ni
 * appeler l'API DumTools avec les droits du lecteur, ni toucher au DOM parent. */

const config = {
  type: "embedHtml" as const,
  propSchema: {
    html: { default: "" },
    hauteur: { default: 360 },
  },
  content: "none" as const,
};

function EmbedHtml({ block, editor }: ReactCustomBlockRenderProps<typeof config>) {
  const { html, hauteur } = block.props;
  const editable = editor.isEditable;
  const [edition, setEdition] = useState(editable && !html);
  const [brouillon, setBrouillon] = useState(html);
  const [hauteurBrouillon, setHauteurBrouillon] = useState(hauteur);

  const appliquer = () => {
    editor.updateBlock(block, {
      props: { html: brouillon, hauteur: Number(hauteurBrouillon) || 360 },
    });
    setEdition(false);
  };

  if (edition) {
    return (
      <div className="w-full rounded-lg border border-border bg-surface" contentEditable={false}>
        <div className="flex items-center gap-2 border-b border-border-soft px-3 py-2">
          <Code2 className="h-4 w-4 text-brand" />
          <span className="text-sm font-medium text-fg">Page HTML embarquée</span>
          <span className="ml-auto flex items-center gap-1.5 text-xs text-muted">
            Hauteur
            <input
              type="number"
              min={80}
              max={2000}
              step={20}
              value={hauteurBrouillon}
              onChange={(e) => setHauteurBrouillon(Number(e.target.value))}
              className="w-20 rounded border border-border bg-surface px-1.5 py-0.5 text-xs text-fg outline-none"
            />
            px
          </span>
          <button
            type="button"
            onClick={appliquer}
            className="inline-flex items-center gap-1 rounded-md bg-brand px-2 py-1 text-xs font-medium text-brand-fg hover:bg-brand-strong"
          >
            <Check className="h-3.5 w-3.5" /> Appliquer
          </button>
          {html && (
            <button
              type="button"
              onClick={() => {
                setBrouillon(html);
                setEdition(false);
              }}
              className="inline-flex items-center rounded-md border border-border px-2 py-1 text-xs text-muted hover:bg-surface-2"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <textarea
          autoFocus
          value={brouillon}
          onChange={(e) => setBrouillon(e.target.value)}
          placeholder="<html>… collez ou écrivez votre page HTML ici …</html>"
          spellCheck={false}
          className="h-56 w-full resize-y bg-transparent p-3 font-mono text-xs text-fg outline-none placeholder:text-subtle"
        />
      </div>
    );
  }

  return (
    <div className="group/embed relative w-full" contentEditable={false}>
      <iframe
        title="Contenu HTML embarqué"
        sandbox="allow-scripts"
        srcDoc={html}
        style={{ height: hauteur }}
        className="w-full rounded-lg border border-border bg-white"
      />
      {editable && (
        <button
          type="button"
          onClick={() => {
            setBrouillon(html);
            setHauteurBrouillon(hauteur);
            setEdition(true);
          }}
          className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-border bg-surface/90 px-2 py-1 text-xs font-medium text-muted opacity-0 shadow-sm backdrop-blur transition-opacity hover:text-fg group-hover/embed:opacity-100"
        >
          <Pencil className="h-3.5 w-3.5" /> Éditer le HTML
        </button>
      )}
    </div>
  );
}

export const blocEmbedHtml = createReactBlockSpec(config, {
  render: (props) => <EmbedHtml {...props} />,
});
