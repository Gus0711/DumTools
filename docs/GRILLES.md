# Outil « Grilles » — des bases de données à soi, qui parlent aux affaires

> **Cadrage du 2026-09-15 — rien n'est implémenté, rien n'est figé.**
> Les décisions marquées *à valider* (§3) attendent Augustin ; le **plan de
> non-régression (§9) se lit AVANT la première ligne de code**.
> À lire après [`ARCHITECTURE.md`](ARCHITECTURE.md), [`NOTES.md`](NOTES.md) et
> [`AFFAIRES.md`](AFFAIRES.md).

## 1. Pourquoi

Entre « un outil métier dédié » (Magasin, Devis, Maintenance : des semaines de
travail, des invariants) et « rien » (un Excel sur kDrive), il n'y a aujourd'hui
aucune marche. Toutes les listes qui ne justifient pas un outil tombent dans ce
trou : suivi de licences, matériel prêté, relances fournisseurs, plannings
d'atelier… Elles vivent dans des fichiers que personne d'autre ne retrouve, et
qui ne savent rien des affaires qu'ils citent.

L'envie était déjà écrite : [`NOTES.md`](NOTES.md) §12 écartait « le Coda
complet » (formules, relations, vues multiples) de la v1 du bloc `tableDonnees`.

Une grille qui vit six mois et que tout le monde utilise est aussi **la spec
d'un futur outil dédié** : on voit enfin quelles colonnes les gens remplissent
vraiment.

### 1.1 Pourquoi pas Baserow, Teable, Grist ou NocoDB

Évalué le 2026-09-15. Brancher un outil externe à côté prend une demi-journée,
et donne un **silo** :

- **deuxième identifiant** — le SSO de Baserow est payant (plan Advanced), et
  même payé il ne sert à rien : DumTools (Auth.js en `Credentials`) ne fournit
  pas d'OIDC, il faudrait monter un Authentik ou un Keycloak et y basculer
  DumTools aussi ;
- **données isolées** — une affaire se cite en tapant son n° Why en texte : pas
  de clé, pas de resynchro au renommage d'un client, absente de ⌘K, des fiches
  client et affaire, du MCP DumTools ;
- **deuxième appli publique** derrière le tunnel Cloudflare, à mettre à jour ;
- **charte perdue**.

Or ce qui ferait la valeur **ici** — une ligne qui pointe vers une affaire, un
client, un produit, et qui remonte sur leur fiche — est justement ce qu'aucun
outil externe ne sait faire. D'où le choix d'un outil natif (§3, D1).

> Repli assumé : si **aucune** des premières grilles réelles ne pointe vers une
> entité DumTools (§10), Teable en conteneur suffit et tout ce document est
> surdimensionné.

## 2. Ce qu'une grille n'est pas

### 2.1 Pas un outil métier bis

La force de DumTools, ce sont ses invariants : le stock est la somme des
mouvements, la frise des jalons est dérivée, la BOM apparie sur le nom exact,
le devis fige. Une grille libre est l'inverse : une saisie sans règle. Le
risque n'est pas technique, c'est la **donnée fantôme** — la grille « Suivi
affaires » tenue à la main qui contredit la frise, le « Stock atelier » qui
contredit le Magasin.

**Une grille accueille ce qui n'a pas de domicile. Ce qu'un modèle tient déjà,
elle le LIE, elle ne le recopie pas** (§4.1). On ne peut pas l'imposer par le
code ; on le rend naturel : une colonne « Affaire » affiche l'affaire VIVANTE
(nom, n° Why, état), si bien que la recopier à la main n'a plus aucun intérêt.

### 2.2 Pas une table rangée dans une note

C'est ce que fait `tableDonnees` (données dans les props JSON du bloc), et ça
ne passe pas à l'échelle :

- une note est **renvoyée entière** 700 ms après chaque frappe, sous verrou de
  version (`sauverNote`) : quelqu'un écrit du texte pendant que vous éditez une
  cellule → l'un des deux prend un conflit ; et 2 000 lignes renvoyées à chaque
  frappe ;
- une table enfermée dans une note ne peut **apparaître nulle part ailleurs** :
  ni sur la fiche affaire, ni dans une autre note, ni en relation, ni
  interrogeable ligne à ligne par le MCP.

D'où D2 : **la donnée vit à part, la vue vit partout.**

### 2.3 ⚠️ Jamais un « Airtable » posé sur le Postgres de DumTools

NocoDB (et ses cousins) savent se brancher sur une base existante. Ce serait
passer **sous** toutes les gardes : éditer une quantité de stock en place, ou
bousculer un `updatedAt` qui fait passer un arrêt pour « retouché »
(`src/lib/chantiers/arret.ts`). Hors de question, quel que soit l'outil.

## 3. Les décisions

| # | Sujet | Proposé | Statut |
|---|---|---|---|
| D1 | Hébergement | **Natif** dans DumTools | Retenu le 2026-09-15, *non figé* |
| D2 | Où vit la donnée | **Outil Grilles à part + bloc « vue de grille »** dans les documents riches (Notes, Wiki) — le modèle « base liée » de Notion/Coda | Retenu, *non figé* |
| D3 | Composant de grille | **react-data-grid 7** (voir §3.1), repli TanStack Table + Virtual | *À trancher par le spike (§8, étape 0)* |
| D4 | Porte d'entrée | **ToolGus d'abord** (`/perso/gus/grilles`), promotion ensuite (nav, `PROVIDERS`, ⌘K) — patron de la Maintenance | *À valider* |
| D5 | Rattachement | **Affaire OU client OU domaine OU rien**, une voie au plus (patron `resoudreRattachement` des tâches), en `SetNull` | *À valider* |
| D6 | Droits | Tout le monde lit et écrit (pas de cloisonnement, comme Notes et Maintenance) ; **supprimer une grille** = créateur ou ADMIN, en corbeille | *À valider* |
| D7 | Formules | **Pas en V1.** Colonne « calcul guidé » reprise des Formulaires (`calculerValeur`, sans `eval`) | *À valider* |
| D8 | Temps réel | **Non** (écarté pour les Notes, rien n'a changé) : relecture à la reprise de focus + garde par cellule (§4.2) | Retenu |

### 3.1 Le composant de grille — ce que dit `npm`, pas la page d'accueil

Relevé le 2026-09-15 avec `npm view` :

| Bibliothèque | Version `latest` | React 19 ? | Rendu | Verdict |
|---|---|---|---|---|
| `@glideapps/glide-data-grid` | 6.0.3 | ❌ `peerDependencies.react` s'arrête à **18.x** (seule l'alpha `6.0.4-alpha24` accepte 19) | canvas | **Écartée** — `npm ci --ignore-scripts` du `Dockerfile` échouerait en `ERESOLVE` (React 19.2.4 ici) ; et un canvas ne lit ni les tokens de la charte ni ne se capture proprement en PDF |
| `react-data-grid` | 7.0.0-beta.61 (MIT) | ✅ `^19.2` | `div role="grid"`, variables CSS | **Proposée** — virtualisation, édition, clavier, copier-coller, colonnes redimensionnables / déplaçables / figées, lignes de synthèse, regroupement. ⚠️ `latest` pointe sur une **bêta** : épingler la version **exacte** |
| `@tanstack/react-table` 9 + `@tanstack/react-virtual` 3 | 9.2.4 / 3.14.13 (MIT) | ✅ | ce qu'on écrit | **Repli** — stable et sans surprise de style, mais clavier, sélection de plage, copier-coller et édition sont **à écrire** |
| `ag-grid-community` | 36.1.0 (MIT) | ✅ | DOM | Écartée — sélection de plage et presse-papiers relèvent de l'édition Enterprise : on perdrait précisément le geste « tableur » |

Le rendu en `div role="grid"` compte double ici : c'est exactement ce
qu'impose le piège BlockNote déjà payé (jamais de `<table>/<td>` dans un bloc
custom, [`NOTES.md`](NOTES.md) §4).

## 4. Les invariants (proposés)

### 4.1 Une cellule-lien porte un IDENTIFIANT, jamais un libellé

Le libellé (nom d'affaire, de client, de produit) est **lu à l'affichage**.
Conséquence voulue : renommer un client n'a **rien à propager** — `renommerClient`
n'est pas touché, et on n'ajoute pas un énième `clientNom` dénormalisé à
resynchroniser (le piège qui a laissé l'ancien nom sur les devis et les
visites). Une entité supprimée s'affiche « élément supprimé », jamais un plantage.

### 4.2 On écrit une CELLULE, pas la grille — garde « comparer puis poser »

Un verrou de version par ligne mettrait en conflit deux personnes sur deux
cellules **différentes** de la même ligne. On garde plutôt **la cellule
elle-même** : l'écriture ne passe que si la cellule contient encore ce que
l'écran avait lu.

```sql
UPDATE "LigneGrille"
   SET valeurs = jsonb_set(valeurs, ARRAY[$champId], $nouvelle::jsonb, true),
       "updatedAt" = now(), "updatedById" = $userId
 WHERE id = $ligneId
   AND valeurs -> $champId IS NOT DISTINCT FROM $attendue::jsonb
RETURNING valeurs, "updatedAt";
```

Zéro ligne renvoyée = quelqu'un a changé **cette** cellule entre-temps → l'écran
le dit et montre la valeur actuelle. Deux règles pour que la comparaison soit
exacte :

- **une cellule vide est une clé ABSENTE**, jamais un `null` JSON (vider =
  `valeurs - $champId`) — sinon « absent » et « null » se comparent faux ;
- l'`UPDATE` est en SQL brut, donc **`updatedAt` doit être posé à la main**
  (`@updatedAt` est un comportement du client Prisma, pas de la base).

Côté écran, le piège « écriture → écran périmé » (CLAUDE.md, [`DEVIS.md`](DEVIS.md)
§20) s'applique mille fois par jour : **jamais de `useTransition` autour d'une
écriture**, un seul rafraîchissement, et chaque cellule **peint sa valeur sans
attendre** le serveur (patron `entetePeinte`).

### 4.3 Changer le type d'un champ ne détruit AUCUNE valeur

Le type est une **promesse de lecture**, pas une migration : passer une colonne
de « texte » à « nombre » ne réécrit rien en base. La lecture convertit ce
qu'elle peut et **dit** ce qu'elle ne peut pas (cellule marquée « valeur
incompatible », jamais vidée) — même règle que « ce qu'on ne sait pas chiffrer
est dit ». Une conversion explicite des valeurs pourra venir plus tard, en
geste volontaire.

### 4.4 Un identifiant de champ ne se réutilise jamais

Règle déjà tenue par les Formulaires (`ChampDef.id`). Supprimer un champ le
met en corbeille (`supprimeLe`) ; ses valeurs restent dans le JSON des lignes
tant qu'une purge explicite ne passe pas.

### 4.5 Une vue ne modifie jamais les données

Filtre, tri, regroupement, colonnes masquées = état de **vue**. Deux étages,
comme `filtres-url.ts` et `useColonnes` : la **vue enregistrée** (`VueGrille`,
partagée ou personnelle) décrit ce qu'on regarde ; le **réglage de poste**
(largeurs, `localStorage`) ne regarde que soi.

### 4.6 Hors de l'éditeur, une vue est STATIQUE et COMPLÈTE

L'aperçu d'une note part en PDF par capture du DOM (`pdf-note.ts`,
html2canvas). Une grille **virtualisée** ne met dans le DOM que les lignes
visibles : le PDF sortirait **tronqué sans un mot** — la même famille de défaut
que les pages de module 8UI6UO (CLAUDE.md). Donc : en lecture, en aperçu, sur
les pages publiques et dans le PDF, le bloc rend **toutes** les lignes de la vue
en HTML statique ; au-delà d'un plafond, il **dit** « … et N lignes de plus,
non reproduites ». La grille interactive n'existe qu'en édition
(`editor.isEditable`, patron déjà utilisé par `table-donnees`, `embed-html`,
`lien-carte`).

Et ces données sont **résolues côté serveur** par la page qui monte
`NoteLecture` (§7.3) : un « Chargement… » capturé par le moteur de PDF est un
document blanc (règle n°1 de `rendu-serveur.tsx`).

### 4.7 Ce qu'un lien public montre est choisi par la REQUÊTE

Une note partagée (`/n/[jeton]`) ou une page wiki partagée (`/w/[jeton]`) ne
sert **que** les grilles citées dans CE document, **que** les colonnes visibles
de la vue citée, et pour les liens **que** le libellé. Sans la première garde,
un jeton de note deviendrait un passe-partout vers toutes les grilles — le trou
déjà évité sur les annexes du devis ([`DEVIS.md`](DEVIS.md) §25). Test à
**témoin négatif** obligatoire.

## 5. Le modèle (esquisse)

```prisma
model Grille {
  id          String   @id @default(cuid())
  nom         String
  description String?
  /// Rattachement : UNE voie au plus (garde serveur, patron resoudreRattachement).
  /// SetNull partout : supprimer une affaire ne doit pas effacer une grille
  /// qui porte peut-être bien d'autres choses.
  chantierId  String?  // → Chantier, SetNull
  clientId    String?  // → Client, SetNull
  domaineId   String?  // → DomaineTache ? (question D5, §10)
  /// La note où la grille est née, s'il y en a une. SetNull : supprimer la
  /// note ne supprime pas la grille (retirer le bloc non plus, §7.2).
  noteOrigineId String?
  supprimeeLe DateTime? // corbeille (D6)
  createdById / updatedById  // relations nommées GrilleCreee / GrilleModifiee
  createdAt / updatedAt
}

model ChampGrille {
  id        String  @id @default(cuid())
  grilleId  String  // Cascade
  nom       String
  /// ⚠️ String, PAS un enum Prisma : ajouter un type ne demande aucune
  /// migration (une valeur d'enum ne se retire pas en Postgres).
  type      String
  config    Json    @default("{}") // options de choix, unité, calcul guidé…
  ordre     Float   // insertion au point médian, patron des tâches
  supprimeLe DateTime?
}

model LigneGrille {
  id          String @id @default(cuid())
  grilleId    String // Cascade
  /// { [champId]: valeur } — cellule vide = clé ABSENTE (§4.2).
  /// Dates en "AAAA-MM-JJ" (ordre lexical = chronologique, aucun fuseau),
  /// montants en centimes entiers (règle du Devis).
  valeurs     Json   @default("{}")
  ordre       Float
  createdById / updatedById / createdAt / updatedAt
  @@index([grilleId, ordre])
  @@index([valeurs(ops: JsonbPathOps)], type: Gin)
}

/// Les cellules-liens ne vivent PAS dans `valeurs` : une seule vérité, et de
/// vraies clés étrangères → « quelles lignes citent l'affaire X ? » se
/// répond par index (provider de la fiche affaire), et supprimer l'entité
/// nettoie le lien au lieu de laisser un identifiant pendu.
model LienLigne {
  id           String  @id @default(cuid())
  ligneId      String  // Cascade
  champId      String
  chantierId   String? // Cascade
  clientId     String? // Cascade
  produitId    String? // Cascade
  userId       String? // Cascade
  ligneCibleId String? // Cascade (lien vers une autre grille)
  ordre        Float
  // un seul des cinq renseigné : garde serveur
}

model VueGrille {
  id             String  @id @default(cuid())
  grilleId       String  // Cascade
  nom            String
  genre          String  // "grille" | "kanban" | "calendrier" | "galerie" | "formulaire"
  config         Json    // filtres, tris, regroupement, champs visibles et leur ordre
  ordre          Float
  proprietaireId String? // null = vue partagée
}
```

L'index GIN est **déclaré dans le schéma** (`type: Gin`, précédent :
`WikiPage.tagSlugs`), jamais posé en SQL brut : un index que Prisma ne sait pas
décrire, il cherche à le supprimer à la migration suivante — c'est exactement
ce qui arrive à `WikiPage_recherche_idx`.

## 6. Les types de champ de la V1

Vocabulaire repris de `tableDonnees` et des Formulaires, pour qu'un collègue ne
réapprenne rien :

| Famille | Types |
|---|---|
| Saisie | texte, texte long, nombre (unité, décimales), montant (centimes), date, date + heure, case |
| Choix | choix unique, choix multiple (options colorées) |
| Contact | URL, e-mail, téléphone |
| **Liens** | **affaire, client, produit, personne**, ligne d'une autre grille |
| Automatique | calcul guidé (`calculerValeur` des Formulaires : somme, différence, produit, moyenne, min, max, cases cochées, concaténation) ; créé le / modifié le / par (lus des colonnes, jamais saisis) |

Plus tard : pièce jointe / photo (volume média, §9.2), formule, recherche
(lookup) et agrégat (rollup) à travers un lien.

## 7. Le bloc « vue de grille » dans les documents riches

### 7.1 Ce qu'il porte, où il apparaît

- **Props** : `{ grilleId, vueId }` et rien d'autre (BlockNote n'accepte que des
  props scalaires). Éditer une cellule écrit dans `LigneGrille`, **pas dans la
  note** : `sauverNote` ne voit rien passer, le conflit de §2.2 disparaît.
- **Menu « / »** : l'entrée rejoint le tableau `metier` d'`itemsMenuSlash`. Or
  ce tableau est déjà retiré quand `sansBlocsTechniques` est posé → **présente
  dans Notes et Wiki, absente d'office du texte libre des devis et du corps des
  tâches**. C'est voulu : un devis fige, une grille vit.
- **Deux entrées** : « Nouvelle grille » (rattachée d'office à l'affaire de la
  note) et « Vue d'une grille existante ».
- **Chargement paresseux** : le composant de grille est importé dynamiquement
  par le rendu du bloc, pour que ni l'éditeur de devis ni le corps de tâche
  (qui partagent `schemaNotes`) ne chargent la bibliothèque.

### 7.2 Retirer le bloc ≠ supprimer la grille

Même règle que « détacher ≠ supprimer » des fiches techniques. Supprimer une
grille **citée** annonce d'abord « citée par N documents » (calculé à la
demande sur `contenu` — pas de table de citations, qui obligerait à toucher
`sauverNote`) ; le bloc orphelin affiche « grille supprimée », il ne plante pas.

### 7.3 Les quatre rendus

| Contexte | Rendu | Données |
|---|---|---|
| Éditeur (Notes, Wiki) | grille interactive | chargée par le bloc, session requise |
| Lecture interne, aperçu, PDF | HTML statique complet (§4.6) | résolues par la page serveur, passées à `NoteLecture` (`NoteLectureProps` gagne `grilles?`) |
| `/n/[jeton]`, `/w/[jeton]` | idem | résolues par `getNotePublique` / `getPagePublique`, scopées au document (§4.7) — **aucune nouvelle route publique**, `src/proxy.ts` n'est pas touché |
| Devis public (`rendu-serveur.tsx`) | `[ grille « … » — non reproduite sur ce document ]` | aucune |

⚠️ Ce dernier cas n'est pas théorique : un bloc peut être **collé** d'une note
dans un texte de devis (le schéma est entier). Sans case explicite, le `default`
de `rendu-serveur.tsx` rend un bloc sans contenu inline comme… **rien** —
disparition silencieuse, contraire au contrat du fichier.

### 7.4 Clavier et presse-papiers sous ProseMirror

C'est **le premier risque** de l'approche, à éprouver dès le spike. Dans une
note, les flèches, Retour arrière, Ctrl+V d'une plage copiée d'Excel et Ctrl+Z
remontent vers l'éditeur, qui supprimerait le bloc, collerait des paragraphes
ou annulerait une frappe du texte au lieu de la cellule. Parade attendue : le
conteneur `contentEditable={false}` (déjà là dans `table-donnees`) + arrêt de la
propagation de `keydown` / `paste` / `copy` / `cut` ; à **vérifier au harnais
navigateur**, pas à supposer.

### 7.5 Le MCP ne doit pas effacer les vues

`dumtools_update_note` et `dumtools_update_wiki_page` **remplacent le document
entier** par `markdownVersBlocs(markdown)`, qui ne produit que des blocs
standard. Une IA qui relit puis réécrit une note ferait donc disparaître le bloc
(la grille, rangée à part, survivrait — la vue non). Parade :

- `blocsVersMarkdown` rend le bloc en bloc de code marqué, lisible par une IA :

  ````
  ```dumtools-grille
  grille: <id> · vue: <id>
  Licences logicielles — vue « Actives » — 42 lignes (20 premières)
  | Logiciel | Échéance | Affaire |
  | --- | --- | --- |
  | … |
  ```
  ````

- `markdownVersBlocs` reconvertit ce bloc de code en bloc de grille (repéré par
  sa **première ligne** — ne pas compter sur la conservation du nom de langage
  par le parseur, à vérifier) ; identifiants inconnus → on laisse le bloc de
  code tel quel, on n'invente rien.

Test d'aller-retour dans `mcp/smoke.mts`. (Les `tableDonnees` actuels ont déjà
ce défaut — ils reviennent en tableau natif ; hors périmètre, noté ici.)

### 7.6 Les `tableDonnees` existants

**Rien ne change pour eux.** Plus tard, un bouton « Convertir en grille » ; ce
n'est qu'une fois ce bouton livré que l'entrée « Table de données » quitte le
menu « / ». Le schéma, lui, la garde **pour toujours** : un document se rend
avec le schéma qui l'a produit.

## 8. Les étapes

| Étape | Contenu | Livrable visible |
|---|---|---|
| **0. Spike** (branche jetable) | react-data-grid épinglé : `npm ci` propre **sans** `--legacy-peer-deps` ; thème par les tokens, clair et sombre ; clavier + collage Excel **dans un bloc BlockNote** ; poids ajouté aux écrans Notes et **zéro** sur l'éditeur de devis ; seuil de lignes chargeables dans le navigateur. **Relevé des compteurs de tous les tests (§9.3) = état de référence.** | Décision D3 écrite ici |
| **1. Grilles plein écran** (ToolGus) | Modèle §5, types §6, garde par cellule, vues « grille » enregistrées (filtre, tri, regroupement), import CSV/Excel (`exceljs`, déjà là), export CSV, rattachement | `/perso/gus/grilles` |
| **2. Bloc dans Notes et Wiki** | D'abord **lecture** (aperçu, PDF, pages publiques, case `rendu-serveur`, marqueur MCP), **ensuite** édition sur place | `/grille` dans une note |
| **3. Autres vues** | Kanban (sur un choix), calendrier (sur une date), galerie ; formulaire (adaptateur vers le rendu des Formulaires, à évaluer) | |
| **4. Promotion** | Rail et accueil, `PROVIDERS` client et affaire, source ⌘K, fil d'activité, outils MCP (lister, lire, filtrer, écrire des cellules), « Convertir en grille » | fiche affaire |
| **5. Plus tard** | Formules (sous-ensemble), lookup / rollup, historique de ligne, commentaires, pièces jointes | |

Ordre de grandeur, comparé à ce qui est déjà livré : étapes 1 + 2 ≈ le Magasin ;
formules + lookup/rollup ≈ le Devis.

## 9. Ne rien casser — le plan de non-régression

### 9.1 Avant de commencer

1. **Commiter le travail en cours.** Au 2026-09-15 l'arbre porte la Maintenance,
   les visites dans le MCP et la migration non suivie
   `20260911082316_maintenance_contrats_sites_interventions`. Une migration
   Grilles mêlée à ce lot serait impossible à retirer seule.
2. **Branche dédiée** `outil-grilles`, jamais `main`.
3. **Sauvegarde de la base** (`scripts/backup-db.sh`) avant la première migration.
4. **État de référence** : rejouer §9.3 et noter les compteurs dans ce document.

### 9.2 Ce qui est touché, et comment on le protège

| Zone existante | Changement | Si c'est raté | Parade / contrôle |
|---|---|---|---|
| `prisma/schema.prisma` | Tables **nouvelles** ; sur `Chantier`, `Client`, `User`, `Produit`, `Note` seulement des champs de relation inverse (virtuels, aucun SQL sur ces tables) | `migrate dev` détruit `WikiPage_recherche_idx` et échoue à moitié appliqué | `prisma migrate dev --create-only` → **relire le SQL** : aucun `ALTER`/`DROP` sur une table existante, retirer les deux lignes du wiki → `prisma migrate deploy` → vérifier que l'index existe → `npm run db:generate` → redémarrer le serveur |
| `package.json`, `Dockerfile` (`npm ci`) | Nouvelle dépendance | `ERESOLVE` : l'image ne se construit plus | Version **exacte** ; `npm ci` dans un clone propre + `docker build --target builder` avant fusion |
| `schemaNotes` (Notes, Wiki, devis, tâches + trois lectures) | Un bloc de plus | Une exception dans le rendu du bloc fait tomber **tous** les documents qui le contiennent | Ajout pur (aucun document existant ne contient ce type) ; rendu du bloc sous **error boundary** (« [ grille illisible ] ») ; import paresseux |
| `itemsMenuSlash` | Entrée dans `metier` | Le bloc apparaît dans un texte de devis envoyé au client | Contrôle : menus du devis et du corps de tâche **inchangés** |
| `rendu-serveur.tsx` | Case explicite | Disparition silencieuse sur le devis public | Cas ajouté à `devis-restitution-smoke` |
| `getNotePublique`, `getPagePublique` | Résolution des grilles citées | Jeton = passe-partout | Test à **témoin négatif** (grille non citée, colonne masquée) |
| `mcp/notes-markdown.mts` | Marqueur aller-retour | Une IA efface les vues | Aller-retour dans `mcp/smoke.mts` |
| `NoteLecture`, aperçu, `pdf-note.ts` | Rendu statique | PDF tronqué sans erreur | **Regarder** : PDF d'une note portant une grille de 300 lignes |
| `PROVIDERS` client et affaire (étape 4) | Un provider de plus | Ils sont combinés par `Promise.all` **sans `catch`** : un provider qui lève fait tomber **toute** la fiche | Provider qui ne lève jamais (erreur journalisée, liste vide) ; ou passer l'agrégat en `allSettled` dans un commit à part |
| `src/lib/recherche/queries.ts` (étape 4) | Une source de plus | Même `Promise.all` : une source qui lève casse ⌘K entier | Idem |
| `docker-compose.yml` (étape 5 seulement) | Volume des pièces jointes | Fichiers perdus au redéploiement | `GRILLES_MEDIA_DIR` + volume **dans le même commit** que le stockage (règle écrite dans le compose) |
| `src/tools/registry.ts` | Entrée ToolGus | — | Hors nav et hors accueil tant que D4 n'est pas levée |

**Ce qui n'est PAS touché, et doit le rester** (diff vide attendu) :
`sauverNote`, `useSauvegardeDocument`, le bloc `tableDonnees`, `renommerClient`,
`src/proxy.ts`, la purge des médias de notes et de wiki (le bloc ne porte aucune
URL de média, `referencesMedias` n'a rien à y voir).

### 9.3 Les contrôles à rejouer à chaque étape

Tous doivent rester verts, avec les **mêmes compteurs** que l'état de référence :

```bash
npx tsc --noEmit && npm run lint && npm run build

npx tsx --conditions=react-server scripts/notes-wiki-smoke.mts
npx tsx scripts/devis-smoke.mts
npx tsx scripts/devis-restitution-smoke.mts
npx tsx scripts/devis-document-apercu.mts          # REGARDER écran, téléphone, PDF
npx tsx --conditions=react-server scripts/taches-smoke.mts
npx tsx mcp/smoke.mts && npx tsx mcp/test-client.mts

# à écrire avec le code :
npx tsx --conditions=react-server scripts/grilles-smoke.mts   # moteur pur puis vraie base
npx tsx scripts/grilles-regard.mts                            # REGARDER, deux largeurs
```

Le port 3000 sert la **prod locale** (`scripts/serve-prod.sh`) : tester sur un
autre port, et ne reconstruire la prod qu'une fois tout vert.

### 9.4 Le filet de retrait

- Migration **additive** : en cas d'abandon, les tables restent, inertes — aucun
  retour arrière de schéma à jouer.
- Retirer l'outil = retirer l'entrée du registre et l'entrée du menu « / ».
- Le **type de bloc ne quitte jamais le schéma** : s'il faut retirer la
  fonction, son rendu devient « [ grille retirée ] ». Retirer la spec ferait
  planter l'ouverture de toute note qui en contient une.

## 10. Questions ouvertes

1. **Quelles sont les 3 premières grilles** que l'équipe créerait demain ? Elles
   fixent les types de la V1 et disent si les liens vers les entités sont
   centraux (sinon, repli §1.1).
2. **D4** — ToolGus d'abord, ou directement outil métier ?
3. **D5** — le « domaine » d'une grille réutilise-t-il `DomaineTache` (Atelier,
   Administratif…) ? Même notion, mais un nom de modèle qui dirait « tâche »
   ailleurs ; le renommer serait une migration de plus, donc un risque de plus.
4. **D6** — qui supprime une grille, et combien de temps reste-t-elle en corbeille ?
5. **Volume attendu** — combien de lignes au plus par grille ? Décide si la V1
   filtre dans le navigateur (comme le besoin consolidé) ou côté serveur.
6. Une **vue formulaire ouverte à des externes** (patron Baserow) est-elle un
   besoin ? Hors V1 : ce serait une nouvelle route publique, donc un nouveau
   passage dans `src/proxy.ts`.
