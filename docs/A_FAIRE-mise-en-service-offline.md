# À FAIRE — Mise en service hors-ligne (PWA + synchro différée)

> Statut : **plan validé, non implémenté.** Objectif : pouvoir remplir l'onglet
> **Mise en service** sans réseau (chaufferie en sous-sol) puis **synchroniser**
> automatiquement au retour du signal.

## Contexte & contrainte

- L'app sera **en ligne**, remplie surtout sur **PC / tablette**.
- Sur site (chaufferie), le réseau peut **couper** (sous-sol, pas de couverture).
- Besoin réel : **travailler hors-ligne sur place**, **rattraper au retour** — pas
  de synchro temps réel obligatoire.
- Approche retenue : **Option A — PWA offline-first + file d'attente locale**
  (voir la discussion ; l'alternative « fiche exportable » a été écartée au profit
  d'une UX transparente).

## Principe

1. **Au bureau (en ligne)** : le technicien ouvre le projet → l'onglet Mise en
   service et ses données sont **mis en cache** (Service Worker + IndexedDB).
2. **En chaufferie (hors-ligne)** : il coche `OK`/`Défaut` + commentaires → écrit
   **d'abord en local** (IndexedDB), instantané. Bandeau « X modifications en attente ⏳ ».
3. **Retour réseau** : la file est **rejouée automatiquement** vers le serveur →
   bandeau « ✓ Synchronisé ». Bouton « Synchroniser » manuel en secours.

## Périmètre V1

**Limiter l'offline à l'onglet Mise en service** (le besoin terrain concret).
L'édition liste / affectation reste en ligne. Extension au reste de l'éditeur =
phase ultérieure optionnelle.

> Décision ouverte : confirmer V1 = Mise en service seule (recommandé) vs éditeur
> complet hors-ligne.

## Briques techniques

### 1. PWA installable
- `manifest` (nom « DumTools », icônes, `display: standalone`, thème) — via
  l'API `metadata`/`manifest` de Next 16 ou un `app/manifest.ts`.
- Icônes PWA (192/512) dans `public/`.

### 2. Service Worker (cache offline)
- **Serwist** (`@serwist/next`) — successeur de `next-pwa`, compatible App Router.
  ⚠️ **Vérifier la compat Next 16** avant de s'engager ; sinon SW hand-rolled.
- Stratégies : app shell + assets en cache ; pages projet déjà visitées en
  `StaleWhileRevalidate` → la page **se charge hors-ligne**.
- Ne pas casser l'auth : le SW ne doit pas mettre en cache les réponses d'auth.

### 3. Store local + file de synchro (le cœur)
- **IndexedDB** (via `idb` ou `Dexie`) : table des modifications de test par projet.
- À l'ouverture (en ligne) : hydrater le store depuis les `points` du projet
  (uid → { testStatus, testComment }).
- Écriture : l'onglet Mise en service écrit **en local d'abord** (optimiste) et
  **enfile** une mutation `{ projetId, pointUid, testStatus, testComment, ts }`.
- Synchro : au retour réseau (`navigator.onLine` + event `online`, idéalement
  **Background Sync API**), rejouer la file → appeler l'action serveur.
- **Indicateur** global online/offline + compteur « en attente » + « Synchroniser ».

### 4. Action serveur dédiée (granulaire)
- Aujourd'hui l'autosave enregistre **tout** le projet (`sauverProjet`).
- Créer une action **fine** : `enregistrerTestsPoints(projetId, updates[])` qui
  applique seulement `testStatus`/`testComment` par `uid` sur `data.points` (JSON).
  → synchro robuste, granulaire, moins de conflits, rejouable/idempotente.

### 5. Auth hors-ligne
- Session **JWT en cookie** : valide hors-ligne pour l'affichage (lecture cache).
- Écritures = enfilées, rejouées **au retour** avec le cookie valide.
- Si la session a **expiré** pendant l'offline → la synchro échoue proprement :
  message clair + re-login, la file **reste conservée** (pas de perte). Envisager
  des sessions plus longues pour les usages terrain.

### 6. Conflits
- Un point = un statut/commentaire, quasi toujours **un seul technicien**.
- Résolution : **dernier gagne par point** (`uid` + horodatage `ts`). Simple et
  suffisant. (Option future : fusion si deux techs sur le même projet.)

## Plan d'exécution (tranches livrables)

- **Phase 1 — PWA + cache offline** : manifest + icônes + Service Worker
  (Serwist), indicateur online/offline. L'app se lance et les projets déjà
  ouverts s'affichent hors-ligne.
- **Phase 2 — Mise en service offline + synchro** : store IndexedDB, écriture
  optimiste, file + rejeu auto au retour réseau, action serveur dédiée,
  compteur « en attente » + bouton « Synchroniser ». **Le vrai livrable terrain.**
- **Phase 3 (optionnel)** — étendre l'offline à l'édition liste/affectation.

## Points d'attention

- **Pré-chargement obligatoire** : le projet doit avoir été **ouvert une fois en
  ligne** pour être disponible hors-ligne (le communiquer aux utilisateurs, ou
  ajouter un bouton « Rendre dispo hors-ligne »).
- **Ne rien perdre** : la file locale survit aux rechargements et échecs de
  synchro ; ne vider une entrée qu'après confirmation serveur.
- **Tests** : simuler offline (DevTools) + expiration de session + rechargement
  avec file non vide.
- **Docker/prod** : servir le SW et le manifest correctement (headers, scope),
  vérifier avec Caddy.

## Repères code (existants à réutiliser / adapter)

- `src/tools/affectation-es/tests-tab.tsx` — onglet Mise en service (écritures de
  `testStatus`/`testComment` via `patch` → à router vers le store local).
- `src/tools/affectation-es/actions.ts` — `sauverProjet` (autosave) → ajouter
  l'action fine `enregistrerTestsPoints`.
- `src/tools/affectation-es/model.ts` — `Point.testStatus` / `Point.testComment`.
- `src/proxy.ts` — matcher auth (vérifier l'exclusion SW/manifest).
