# Recherche du Wiki — conception « v2 » (tags structurés + facettes)

> **But du document** : cadrer l'évolution de la recherche du Wiki quand la base
> grossit (centaines → milliers de pages). L'outil Wiki et sa **v1** de recherche
> sont **implémentés** (voir plus bas « État actuel »). Ce document décrit ce qui
> casse à l'échelle et le plan **incrémental** pour y répondre — **sans moteur
> externe**, tout tient sur Postgres.
> Rédigé : **2026-07-16**.
>
> ✅ **Étape 1 IMPLÉMENTÉE le 2026-07-16** (tags = facette structurée : ET/OU/SANS +
> page de recherche à facettes + MCP étendu). Détails : §5 « Étape 1 » ci-dessous.
> Reste : Étape 2 (syntaxe « power ») et Étape 3 (unaccent/fuzzy/alias).

---

## 1. État actuel (v1, implémenté)

- Recherche plein-texte Postgres : colonne générée `WikiPage.recherche` (`tsvector`),
  pondérée `titre [A] + texte [B]`, index **GIN**. Voir la migration `outil_wiki`.
- `WikiPage.texte` (recalculé à chaque save) = **résumé + contenu brut + noms de tags
  collés comme des mots**. C'est ce qui rend les tags « cherchables »… mais comme du
  **texte libre**, pas comme une dimension structurée.
- Requête : `websearch_to_tsquery('french', q)` + `ts_rank`, extraits surlignés
  `ts_headline`. Voir `rechercherPages` dans `src/tools/wiki/queries.ts` et l'action
  `rechercherWiki` dans `src/tools/wiki/actions.ts` (barre globale `src/tools/wiki/recherche.tsx`).
- Filtre par tag : **uniquement** au sein d'une rubrique, **côté client** (chips dans
  `src/tools/wiki/liste-pages.tsx`) — pas de filtre de tag global ni combinable.
- MCP : `dumtools_search_wiki` (plein-texte, même moteur).

**Ça marche très bien à petite échelle. Le modèle « tag = mot dans le texte » est ce
qui devient faux en grandissant.**

---

## 2. Le problème : ce qui casse à l'échelle

### 2.1 Pièges concrets (avec le moteur actuel)

- **« N4 script »** → `n4 & script` (ET implicite). Une page *taguée* N4 qui contient
  « script » matche, mais **une page qui écrit juste « N4 » dans une phrase matche
  pareil** qu'une page réellement taguée N4. Impossible de distinguer *taguée* de *mentionne*.
- **« N4 OU script »** → piège : `websearch_to_tsquery` ne connaît que l'opérateur
  **anglais `or`**, pas `OU`. « OU » devient un mot (stopword ignoré) → on obtient
  `n4 & script`, c'est-à-dire **un ET au lieu d'un OU**. L'utilisateur récupère l'inverse
  de ce qu'il demande.
- **100 pages taguées N4** → `ts_rank` sur un mot-tag est **plat** : mur de résultats
  quasi ex-æquo, non triables utilement.

### 2.2 Familles de recherche difficiles

| Type | Pourquoi ça casse aujourd'hui |
|---|---|
| **Booléen sur tags** (N4 ET script, N4 OU script, N4 SANS brouillon) | tags = texte libre → pas de vraies opérations d'ensemble ; « OU » français non reconnu |
| **Tag exact vs mention** | « taguée N4 » indistinguable de « contient N4 » |
| **Tags multi-mots / spéciaux** (`M-Bus`, `loi d'eau`, `KNX/IP`) | le tokenizer FR casse tirets/apostrophes/slashes → le tag n'est plus matchable atomiquement |
| **Facettes** (« les N4 », puis affiner par armoire, par auteur) | pas de navigation à facettes globale ; les chips sont locaux à une rubrique, côté client |
| **Fuzzy / fautes / synonymes** (`Niagara4` = `N4` = `niagara 4`, `supervison`) | aucun rapprochement ; fragmentation du vocabulaire |
| **Accents** (`câblage` vs `cablage`) | la config `french` ne dé-accentue pas |
| **Ranking sous filtre de tag** | le mot-tag gonfle le score au lieu de laisser le texte trancher |
| **Comptages de facettes** (nb de pages par tag, filtré) | agrégations naïves coûteuses si mal indexées |

---

## 3. Principe directeur

**Séparer deux mondes que la v1 a fusionnés :**

1. **Tags = facette structurée** → opérations d'ensemble (ET/OU/SANS), *pas* du texte libre.
2. **Titre / résumé / contenu = pertinence** → le `tsvector` actuel.
3. Requête cible = `filtre structuré (WHERE) ∩ match plein-texte (WHERE) ORDER BY ts_rank`.

On **filtre d'abord** par la dimension sélective (tags/rubrique/auteur), **puis** on
classe le reste par pertinence textuelle. Le tag ne pollue plus le score.

---

## 4. Conception cible (Postgres natif)

### 4.1 Tags structurés

- Colonne dénormalisée **`WikiPage.tags text[]`** (synchronisée depuis `WikiPageTag` au
  save, à côté du calcul de `texte`) + **index GIN**. Le booléen devient trivial et rapide :
  - **ET** : `tags @> ARRAY['n4','script']`
  - **OU** : `tags && ARRAY['n4','script']` (chevauchement)
  - **SANS** : `NOT (tags && ARRAY['brouillon'])`
  - **mixte tag + phrase** : `tags @> ARRAY['n4'] AND recherche @@ phraseto_tsquery('french','loi d''eau')`
- **Normalisation** des jetons de tag (minuscule + dé-accentué + slug canonique) pour que
  `N4` / `n4` / `N4 ` matchent. On stocke le **slug** dans `tags[]` et on garde le libellé
  d'affichage sur `WikiTag`.
- **Alias / synonymes** (`niagara4 → n4`, `niagara 4 → n4`) : petite table ou colonne
  `WikiTag.alias text[]` résolue au filtre. **C'est le vrai tueur silencieux d'une KB** —
  la fragmentation du vocabulaire fait plus de dégâts que n'importe quelle limite technique.

### 4.2 Interface de recherche

- **UI à facettes** (barre latérale : tags avec **compteurs**, rubrique, auteur, date) +
  case texte libre. L'utilisateur exprime ET/OU par des cases à cocher, **sans apprendre de
  syntaxe** — modèle Notion / Linear / GitHub. C'est le **bon défaut** pour des collègues
  non techniques.
- **Syntaxe « power »** en surcouche pour les initiés : `tag:N4 -tag:brouillon "loi d'eau"`,
  parsée en (filtre tags structuré) + (requête FTS). Optionnelle.

### 4.3 Ranking & polish (au fil des besoins réels)

- Ranking : filtrer par tag (sélectif) **puis** `ts_rank` sur le texte ; bonus possible
  tag-exact > titre > corps.
- **`unaccent`** (+ config `french_unaccent` *immutable*) → insensibilité aux accents,
  appliquée **de façon cohérente** au `tsvector` **et** à la normalisation des tags.
- **`pg_trgm`** (index trigramme sur libellés de tags et titres) → « à peu près » /
  « vouliez-vous dire » / recherche de sous-chaîne dans une longue liste de tags.

---

## 5. Plan incrémental (sans rien casser)

> Chaque étape est livrable indépendamment. On peut s'arrêter après l'étape 1 :
> elle règle ~80 % du problème (ET/OU/SANS propres, plus de faux positifs, plus de
> piège « OU »).

### Étape 1 — Sortir les tags du texte libre (le cœur) — ✅ FAIT (2026-07-16)
- **Schéma** : `WikiPage.tagSlugs text[] @default([])` + `@@index([tagSlugs], type: Gin)`
  (nommé `tagSlugs` et non `tags` : `tags` est déjà la relation `WikiPageTag[]`). Migration
  `20260716204001_wiki_tags_facette` : colonne + index GIN + **backfill** depuis les tags
  existants (mêmes slugs que `slugTag`, dé-accentuation par `translate`). ⚠️ la migration ne
  touche PAS à `recherche` (fausse dérive Prisma sur la colonne générée, comme `wiki_page_resume`).
- **Backend** : `slugTag` / `slugsTags` dans `model.ts` (minuscule + dé-accentué NFD + slug
  canonique, idempotent). Au save (`sauverPage`, et côté MCP `createWikiPage`/`updateWikiPage`),
  `tagSlugs` est resynchronisé. Les noms restent dans `texte` (confort du plein-texte) ; la
  **facette autoritaire** est `tagSlugs`.
- **Requête** : `rechercherPages(q, { tagsEt?, tagsOu?, tagsSauf?, rubriqueSlug?, auteurId? })`
  dans `queries.ts` — `@>` (tout) / `&&` (au moins un) / `NOT &&` (aucun) sur `tagSlugs`, +
  match FTS optionnel, `ORDER BY ts_rank` (ou date si pas de texte). Sélection en SQL puis
  réhydratation Prisma (tags/auteur). `optionsRecherche()` = catalogue des facettes (compteurs
  **globaux**). Filtres re-slugifiés côté serveur → un libellé ou un slug sont acceptés.
- **UI** : page dédiée `/outils/wiki/recherche` (`recherche-avancee.tsx`) — barre latérale de
  facettes (chips de tags **tri-état** neutre → inclure → exclure, bascule ET/OU, rubrique et
  auteur en mono-sélection) + barre plein-texte + résultats surlignés. Lien « Recherche avancée »
  depuis l'accueil ; la barre rapide (`recherche.tsx`) reste inchangée.
- **MCP** : `dumtools_search_wiki` étendu — `query?`, `tagsEt` / `tagsOu` / `tagsSauf`,
  `rubrique` (slug/id). Tags en clair, normalisés côté serveur.
- **Compteurs contextuels** (nb de résultats par facette **sous** les filtres courants) : NON
  faits — compteurs globaux pour l'instant (suffisant, cf. « ne pas sur-ingénier »). Candidat
  naturel si le besoin se confirme.

### Étape 2 — Syntaxe « power »
- Parseur `tag:` / `-tag:` / `OR` / `"phrase"` → (expression de tags) + (requête FTS).
- Réutilise l'étape 1 côté exécution.

### Étape 3 — Robustesse vocabulaire & fuzzy
- `unaccent` + config `french_unaccent` (dé-accentuation).
- `pg_trgm` (fuzzy tags/titres, « vouliez-vous dire »).
- **Alias / synonymes** de tags + **fusion de tags** (ADMIN) — hygiène du vocabulaire.

---

## 6. Faut-il un moteur de recherche dédié ?

**Non, pas à l'échelle de DumTools.** Pour une KB interne (centaines → quelques milliers de
pages), `tsvector` + `text[]`/GIN + `pg_trgm` + `unaccent` couvrent tout, avec une seule
base à sauvegarder et zéro service en plus. Un moteur externe (Meilisearch / Elastic) ne se
justifie qu'au-delà de **~10 000 documents** avec du fuzzy multilingue lourd ou du
typo-tolérant temps réel exigeant. **Ne pas sur-ingénier.**

---

## 7. Fichiers concernés (repères)

- Schéma / recherche : `prisma/schema.prisma` (`WikiPage`), migration dédiée (tags `text[]` +
  GIN ; plus tard `unaccent` / `pg_trgm`).
- Backend outil : `src/tools/wiki/queries.ts` (`rechercherPages`), `src/tools/wiki/actions.ts`
  (`sauverPage` / `synchroniserTags` → maintien de `tags[]`).
- UI : `src/tools/wiki/recherche.tsx` (facettes + barre), `src/tools/wiki/liste-pages.tsx`.
- MCP : `mcp/server.mts` (`dumtools_search_wiki`), `mcp/data.mts` (`searchWiki`, `synchroniserTagsWiki`).
