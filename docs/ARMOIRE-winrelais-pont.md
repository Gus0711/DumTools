# Piste outil « Armoire électrique » — pont vers WinRelais

> Note d'exploration (2026-07-10). Aucune ligne de code encore. But : cadrer un
> futur outil d'aide à la conception d'armoire, **sans réinventer le schéma élec**
> (l'équipe armoire utilise déjà un logiciel dédié).

## 1. Contexte

Les armoires électriques sont conçues **en interne** par une équipe dédiée (pas par
l'auteur des outils GTB). Décisions issues du cadrage :

- **Ne pas refaire un outil de schéma** : l'équipe utilise **WinRelais**
  (logiciel français de schématique électrique, éditeur TyponRelais / winrelay.com).
- **Point de douleur exact inconnu** côté armoire — mais la **ressaisie
  inter-logiciels est une douleur quasi certaine** : le Projet GTB contient déjà,
  structuré, tout ce que l'équipe recopie à la main (liste E/S, automate, modules,
  affectation aux bornes : module / canal / relais / repère).

**Idée directrice** : un **pont** Projet GTB → WinRelais qui exporte ces données
dans un format que WinRelais sait importer. Rattaché à l'**Affaire** comme les
autres artefacts (patron `PROVIDERS`). Peu de code (la donnée existe déjà dans
`Project.points`), valeur immédiate, gagne quel que soit le détail du workflow.

## 2. Ce que WinRelais sait importer / exporter (recherche)

| Capacité | Détail | Version requise |
|---|---|---|
| **Import de tableaux** | **CSV séparateur `;`** | **Toutes** (dont Standard) |
| Import de tableaux | XLS / XLSX / ODS | Premium / **Expert** |
| **Lien dynamique** champs de symboles ⇄ fichier Excel/ODS | repères, désignations se remplissent depuis le fichier | Premium / **Expert** |
| Génération **borniers** (auto, depuis symboles bornes) | borniers à étages jusqu'à 4 | à étages = Premium / Expert |
| **Nomenclature** auto | depuis données symboles ou base produits | Toutes |
| **WinRelaisBase** = base produits | **Access MDB** ou **MS SQL** (code, classe, constructeur) | — |
| Export tableaux (nomenclature, folios, repères) | CSV (toutes) ; XLS/XLSX/ODS (Premium/Expert) ; MDB | selon format |
| Export schéma | DXF, DWG, PDF, SVG, PNG, EMF, WMF, PLT, CGM | selon format |
| Import graphique | DXF/DWG (fond de folio) ; DXF/DWG schéma complet (**Expert**) ; BMP/JPG/PNG ; SVG | selon |

**Conclusion clé** : le **CSV point-virgule est le dénominateur commun universel**
(marche même en version Standard). C'est la cible sûre pour démarrer.

## 3. Les 3 niveaux de pont possibles

| Niveau | Ce qu'on produit | Marche si… | Effort |
|---|---|---|---|
| **1. Pont CSV** ✅ *(démarrage recommandé)* | CSV `;` : liste bornes / E/S / repères dérivée de `Project.points` → import « tableau » ou « liste de repères » dans WinRelais | **toutes versions** | faible |
| **2. Pont Excel + lien dynamique** | XLSX qui **pilote les champs de symboles** (repères / désignations remplis automatiquement) | Premium / **Expert** | moyen |
| **3. Alimenter WinRelaisBase** | notre base matériel (`AutomateModele` / `ModuleModele`) → base produits Access/SQL, pour nomenclatures avec réfs fabricant | s'ils veulent centraliser le catalogue | plus élevé |

Recommandation : **faire le niveau 1 d'abord** (couvre la douleur n°1 = ressaisie,
zéro dépendance), puis escalader selon l'édition qu'ils possèdent.

## 4. Données déjà disponibles côté DumTools

Tout est dans le `Project` (JSON de `AffectationProjet.data`, voir
[`ARCHITECTURE.md`](ARCHITECTURE.md) §3) :

- `Project.points[]` : `{ uid, direction, active, designation, repere, signal,
  relay, module, channel, ... }` — **l'affectation aux bornes est déjà là**.
- `Project.rows[]` : la saisie liste de points (nom, note, type d'E/S).
- automate + modules choisis + réseaux (IP port 1 / port 2).

⚠️ Rappel : le module intégré porte le numéro **0** (falsy) → tester
`p.module != null` (jamais `p.module &&`).

## 5. Ce qu'il reste à confirmer avant de coder

1. **Édition de WinRelais** possédée : Standard / Premium / **Expert** ?
   → tranche entre niveau 1 (CSV) et niveau 2 (Excel dynamique).
2. **Un exemple réel** du CSV / tableau qu'ils importent aujourd'hui (ou une
   capture de la boîte de dialogue d'import) → fige l'ordre et le nom des colonnes.
3. Court échange (~15 min) avec un collègue armoire : *« que recopies-tu à la main
   depuis nos données quand tu démarres une armoire pour une affaire GTB ? »*

## 6. Piste de repli (sans dépendance externe)

Si le pont s'avère bloqué (formats, licence), la **nomenclature / BOM d'armoire
cumulée par affaire** (déjà notée « brique 3 » dans [`AFFAIRES.md`](AFFAIRES.md) §9)
est l'alternative solide : ne dépend d'aucun logiciel tiers, sert au
chiffrage/appro, et fonde un catalogue matériel armoire réutilisable — et pourra
plus tard **alimenter WinRelaisBase** (niveau 3).

## Sources

- <https://www.winrelay.com/> · <https://www.winrelay.com/versions.htm>
- <https://www.typonrelais.com/index.php?page=winrelais>
- <https://www.typonrelais.com/pages/winrelais_plus.htm> (détail Premium/Expert)
