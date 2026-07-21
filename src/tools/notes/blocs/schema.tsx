"use client";

import {
  BlockNoteSchema,
  defaultBlockSpecs,
  insertOrUpdateBlockForSlashMenu,
  withPageBreak,
} from "@blocknote/core";
import { fr } from "@blocknote/core/locales";
import { codeBlockOptions } from "@blocknote/code-block";
import {
  getDefaultReactSlashMenuItems,
  getPageBreakReactSlashMenuItems,
} from "@blocknote/react";
import type { DefaultReactSuggestionItem } from "@blocknote/react";
import { Code2, Link2, Table2 } from "lucide-react";
import { tableVide } from "../model";
import { blocCodeRepliable } from "./code-repliable";
import { blocEmbedHtml } from "./embed-html";
import { blocLienCarte } from "./lien-carte";
import { blocTableDonnees } from "./table-donnees";

/* Schéma BlockNote des notes : blocs standard (titres, listes, todo, tableaux
 * riches, images, fichiers…), bloc de code avec coloration syntaxique, saut de
 * page (opt-in BlockNote via withPageBreak — utile pour l'impression A4), et
 * nos trois blocs métier (table de données typée, HTML embarqué, carte lien).
 * Partagé par l'éditeur ET les vues lecture seule (aperçu, page publique) —
 * un document ne se rend qu'avec le schéma qui l'a produit. */

export const schemaNotes = withPageBreak(
  BlockNoteSchema.create({
    blockSpecs: {
      ...defaultBlockSpecs,
      codeBlock: blocCodeRepliable(codeBlockOptions),
      tableDonnees: blocTableDonnees(),
      embedHtml: blocEmbedHtml(),
      lienCarte: blocLienCarte(),
    },
  }),
);

/** Alias supplémentaires pour les blocs REPLIABLES natifs : le vocabulaire
 *  courant (« plier », « fold », « collapse »…) n'est pas dans la locale fr
 *  d'origine, donc ces blocs restaient introuvables au « / ». */
const ALIAS_REPLI = ["plier", "déplier", "deplier", "replier", "fold", "collapse", "cacher"];

/** Locale française ajustée :
 *  - le trait horizontal s'appelle « Séparateur » (BlockNote le nomme
 *    « Diviseur », que personne ne cherche — et ses alias d'origine ne
 *    comprennent même pas « séparateur ») ;
 *  - la locale fr d'origine scinde les médias en deux groupes « Médias »
 *    (image) et « Média » (vidéo/audio/fichier) → un seul groupe ;
 *  - les blocs repliables (titres & liste) gagnent des alias « plier / fold /
 *    collapse » pour être trouvables au « / ». */
export const dictionnaireNotes = {
  ...fr,
  slash_menu: {
    ...fr.slash_menu,
    divider: {
      ...fr.slash_menu.divider,
      title: "Séparateur",
      subtext: "Trait horizontal entre deux blocs",
      aliases: ["séparateur", "separateur", "diviseur", "ligne", "trait", "hr", "divider"],
    },
    video: { ...fr.slash_menu.video, group: fr.slash_menu.image.group },
    audio: { ...fr.slash_menu.audio, group: fr.slash_menu.image.group },
    file: { ...fr.slash_menu.file, group: fr.slash_menu.image.group },
    toggle_heading: {
      ...fr.slash_menu.toggle_heading,
      aliases: [...fr.slash_menu.toggle_heading.aliases, ...ALIAS_REPLI],
    },
    toggle_heading_2: {
      ...fr.slash_menu.toggle_heading_2,
      aliases: [...fr.slash_menu.toggle_heading_2.aliases, ...ALIAS_REPLI],
    },
    toggle_heading_3: {
      ...fr.slash_menu.toggle_heading_3,
      aliases: [...fr.slash_menu.toggle_heading_3.aliases, ...ALIAS_REPLI],
    },
    toggle_list: {
      ...fr.slash_menu.toggle_list,
      aliases: [...fr.slash_menu.toggle_list.aliases, ...ALIAS_REPLI],
    },
  },
};

export type EditeurNotes = typeof schemaNotes.BlockNoteEditor;

/** Items du menu « / » : les blocs standard (libellés français via la locale),
 *  le saut de page inséré DANS le groupe « Blocs de base » (ajouté en fin de
 *  liste, il créerait un second en-tête de groupe), puis nos blocs métier,
 *  groupés « DumTools ». */
export function itemsMenuSlash(editor: EditeurNotes): DefaultReactSuggestionItem[] {
  const defauts = getDefaultReactSlashMenuItems(editor);
  const sautDePage = getPageBreakReactSlashMenuItems(editor);
  const groupeBase = dictionnaireNotes.slash_menu.divider.group;
  let finGroupeBase = -1;
  for (let i = 0; i < defauts.length; i++) {
    if (defauts[i].group === groupeBase) finGroupeBase = i;
  }
  const standards =
    finGroupeBase === -1
      ? [...defauts, ...sautDePage]
      : [
          ...defauts.slice(0, finGroupeBase + 1),
          ...sautDePage,
          ...defauts.slice(finGroupeBase + 1),
        ];
  return [
    ...standards,
    {
      title: "Table de données",
      subtext: "Colonnes typées (texte, nombre, date, choix…), tri et filtre",
      aliases: ["table", "donnees", "données", "bdd", "base", "coda"],
      group: "DumTools",
      icon: <Table2 size={18} />,
      onItemClick: () =>
        insertOrUpdateBlockForSlashMenu(editor, {
          type: "tableDonnees",
          props: { data: JSON.stringify(tableVide()) },
        }),
    },
    {
      title: "Page HTML embarquée",
      subtext: "Colle du HTML, rendu en direct dans un cadre isolé",
      aliases: ["html", "embed", "iframe", "code html"],
      group: "DumTools",
      icon: <Code2 size={18} />,
      onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "embedHtml" }),
    },
    {
      title: "Carte lien / document",
      subtext: "URL externe ou document GED de l'affaire, en carte cliquable",
      aliases: ["lien", "url", "document", "ged", "fichier"],
      group: "DumTools",
      icon: <Link2 size={18} />,
      onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "lienCarte" }),
    },
  ];
}
