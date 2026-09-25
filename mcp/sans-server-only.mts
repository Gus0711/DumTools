// Neutralise le paquet « server-only » pour LE PROCESSUS MCP.
//
// « server-only » est un garde-fou de bundler : importé hors d'un rendu serveur
// Next, son entrée par défaut LÈVE une exception à l'import. Le serveur MCP
// réutilise la couche métier de l'app (src/…) et en traverse forcément —
// getCatalogue passe par magasin/documentation depuis que les fiches
// constructeur vivent sur les produits (2026-08-12), et c'est ce qui a mis le
// serveur MCP à terre : il ne démarrait plus du tout (« Connection closed »).
//
// ⚠️ Pourquoi pas `--conditions=react-server`, qui résout « server-only » vers
// le module vide (c'est ce que font les scripts de scripts/) : cette condition
// donne aussi le build react-server de React, dépourvu de useLayoutEffect, et
// @blocknote/server-util (conversion markdown ⇄ blocs des notes) s'effondre
// dessus. Les deux modes cassaient, chacun d'un côté ; on garde donc tsx normal
// et on remplace ce seul module.
//
// À importer EN PREMIER, avant toute entrée de la couche métier (l'ordre des
// imports ESM est l'ordre d'évaluation).
import * as nodeModule from "node:module";

/** `registerHooks` (Node ≥ 22.15) existe à l'exécution mais n'est pas encore
 *  déclaré par la version de @types/node du dépôt. */
type CrochetsResolution = {
  resolve(
    specifier: string,
    context: unknown,
    next: (specifier: string, context: unknown) => unknown,
  ): unknown;
};
const registerHooks = (
  nodeModule as unknown as { registerHooks?: (hooks: CrochetsResolution) => void }
).registerHooks;

if (!registerHooks) {
  throw new Error(
    `node:module.registerHooks est requis (Node >= 22.15) pour neutraliser « server-only ». Node courant : ${process.version}`,
  );
}

const VIDE = new URL("server-only-vide.cjs", import.meta.url).href;

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") return { url: VIDE, shortCircuit: true };
    return next(specifier, context);
  },
});
