# À FAIRE — Câbler l'import GFX/PDF sur la base matériel

## Contexte
La **base matériel** (automates + modules Distech) est désormais éditable en BDD
et partagée : modèles Prisma `AutomateModele` / `ModuleModele`, écran
`/configuration/materiel`, chargée via `getCatalogue()` et injectée dans
l'éditeur. Les **surfaces de décision** la consomment déjà :

- sélecteur d'automate + sélecteur de type de module (`editeur.tsx`) ;
- moteur de recommandation d'automate (`reco-automate.ts`) — respecte
  `extensible` et `modulesCompat` ;
- aperçu / impression (`apercu.tsx`) — images, alimentation, E/S intégrées.

## Ce qui reste en dur (phase 2)
L'**import** `.gfx` et **PDF** continue d'utiliser les constantes de code, PAS la
base éditable :

- `catalog.ts` : `CONTROLLER_CATALOG`, `MODULE_TYPE_DEFS`, `CONTROLLER_OPTIONS`,
  `MODULE_TYPE_OPTIONS`, `powerSupplyInfo`.
- `model.ts` : `controllerInfo`, `detectModuleDefinition`,
  `normalizeControllerReference`, `isIntegratedControllerType`,
  `controllerHasIntegratedPower`, `controllerHasIntegratedIo`.
- Consommé par `gfx-import.ts` et `pdf-import.ts` (détection modèle contrôleur,
  E/S intégrées, modules d'extension, heuristiques géométriques PDF).

Conséquence : un **nouveau modèle** ajouté uniquement via `/configuration/materiel`
sera proposé/affiché correctement, mais **non reconnu à l'import** tant que la
détection n'est pas, elle aussi, pilotée par la base.

## Piste d'implémentation
1. Étendre `AutomateModele` / `ModuleModele` avec les infos de détection :
   - alias / motifs de reconnaissance (`referenceGfx`, ids GFX, regex de nom) ;
   - `moduleId` GFX (aujourd'hui en dur dans `detectModuleDefinition` :
     `1→8UI6UO, 2→16DI, 3→8DOR, 4→4UI4UO, 5→8UI, 6→MBUS, 7→RS485, 50→SCREEN`).
2. Faire prendre au pipeline d'import un `Catalogue` en paramètre (les imports
   tournent côté client dans l'éditeur, qui a déjà la prop `catalogue`) et
   remplacer les lookups constants par des lookups catalogue, avec **repli** sur
   les constantes actuelles.
3. Rendre `normalizeControllerReference` / `detectModuleDefinition` data-driven
   (table d'alias éditable) plutôt que `if/else` en dur.

## Attention
Les heuristiques PDF (`pdf-import.ts`, ~1500 lignes, très positionnelles) sont la
partie la plus fragile : ajouter un modèle réellement nouveau demandera
probablement quand même du réglage de code. Prioriser d'abord le pilotage de la
détection GFX (plus déterministe).
