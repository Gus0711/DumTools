# Offline / PWA — Mise en service : ce qui a été réalisé

> Compte-rendu d'implémentation (session du 2026-07-13).
> **Statut : socle codé et vérifié (tsc / eslint / next build OK), à tester sur device.**
> Doc de suivi/plan : [`A_FAIRE-mise-en-service-offline.md`](A_FAIRE-mise-en-service-offline.md).
> Réutilisable pour le futur outil [`VISITES.md`](VISITES.md).

---

## 1. Objectif de la session

Rendre l'onglet **Mise en service** utilisable **hors-ligne** (chaufferie / armoire
sans réseau), avec **synchronisation différée** au retour du signal. Premier pas
concret vers le local-first dans DumTools.

## 2. Décisions cadrées avec Augustin

- **Device de dev = Android** (test rapide). Des collègues sont sur **iPhone** →
  on **code pour le plancher iOS** (pas de Background Sync, quotas, permissions).
- **V1 = mise en service seule.** L'**affectation reste en ligne** ; un changement
  constaté sur le terrain se **note en commentaire**, la ré-affectation se fait au
  bureau. (Offline de l'affectation = piège écarté : projet JSON entier + dérivation.)
- **Approche « îlot local-first »**, pas « toute l'app offline » : un écran client
  pur, sans dépendance serveur au runtime, avec son stockage local et sa file.

## 3. Architecture retenue

```
Écran Mise en service (client pur, mobile)
        │  écrit TOUJOURS en local d'abord (optimiste)
        ▼
IndexedDB  (base « dumtools-offline »)
  ├─ mes-projects : snapshot des points à tester (rendu hors-ligne)
  └─ mes-queue    : file de mutations { projetId, uid, testStatus?, testComment?, ts }
        │  au retour réseau (event online) → rejeu groupé
        ▼
Server action FINE  enregistrerTestsPoints(projetId, updates[])
  applique testStatus/testComment par uid sur data.points (JSON) — idempotente
```

- **Rien n'est retiré de la file avant confirmation serveur** → aucune perte terrain.
- **Conflits** : « dernier gagne » par point (uid + horodatage). Suffisant (mono-tech).
- **À l'hydratation, le local gagne** sur le snapshot serveur (une saisie non encore
  confirmée ne doit pas être écrasée par une valeur périmée).

## 4. Fichiers créés / modifiés

### Server (Brique 0 — le vrai prérequis)
- **`src/tools/affectation-es/actions.ts`** — ajout de `enregistrerTestsPoints(projetId, updates[])` :
  granulaire, idempotente, ne modifie que `testStatus`/`testComment` par `uid`.
  Remplace le clobber du projet entier de l'autosave (`sauverProjet`).

### Kit offline réutilisable — `src/lib/offline/` (aucune dépendance ajoutée)
- **`idb.ts`** — wrapper IndexedDB minimal (open + get/getAll/put/add/delete), base
  `dumtools-offline`, stores déclarés dans `STORES`.
- **`mise-en-service.ts`** — store métier : `hydrate`, `writeLocal`, `syncPending`
  (rejeu groupé par projet, réduction « dernier gagne » par uid), compteurs.
- **`use-online.ts`** — état réseau réactif via `useSyncExternalStore` (SSR-safe).
- **`use-mise-en-service.ts`** — hook de l'écran : hydratation, écriture optimiste,
  synchro auto (event `online`) + debounce, compteur en attente, `syncNow`.

### UI
- **`src/components/offline/sync-indicator.tsx`** — bandeau d'état :
  « Hors-ligne / N en attente ⏳ / Synchronisation… / À jour / Échec » + bouton **Synchroniser**.
- **`src/tools/affectation-es/mise-en-service-offline.tsx`** — écran mobile (gros
  boutons OK/Défaut, commentaire, une carte par module), branché sur le hook.
- **`src/app/(app)/outils/affectation-es/[id]/mise-en-service/page.tsx`** — route
  serveur qui construit le snapshot léger (points affectés + libellés de modules).
- **`src/tools/affectation-es/tests-tab.tsx`** + **`editeur.tsx`** — bouton
  **« Mode terrain (hors-ligne) »** depuis l'onglet Mise en service en ligne.

### PWA installable
- **`src/app/manifest.ts`** → sert `/manifest.webmanifest` (nom, `display: standalone`,
  thème `#2b3a8f`, icône).
- **`public/icon.svg`** — icône provisoire (monogramme DT). *À finaliser en PNG 192/512.*
- **`public/sw.js`** — service worker **hand-rolled** (pas de Serwist) : navigations
  en **network-first** (jamais de périmé en ligne), assets hashés en cache-first,
  **jamais** d'auth / `/api` / POST en cache.
- **`src/components/pwa/register-sw.tsx`** — enregistrement **UNIQUEMENT en
  production**. En dev il **désenregistre** tout SW + **purge les caches** (avec
  rechargement unique auto-réparant). Monté dans `src/app/layout.tsx`.
  > ⚠️ **Régression corrigée** : la 1ʳᵉ version enregistrait le SW aussi en dev
  > (localhost = contexte sécurisé). Le SW servait des chunks Turbopack périmés →
  > `ChunkLoadError` → hydratation cassée → **hamburger + onglets morts** en mobile.
  > Un SW en dev est un piège : ne jamais activer hors production.
- **`src/proxy.ts`** — exclusions ajoutées : `manifest.webmanifest`, `sw.js`, `icon.svg`.

## 5. Vérifications faites

- `npx tsc --noEmit` ✓ · `npx eslint` ✓ · `npx next build` ✓ (route
  `/outils/affectation-es/[id]/mise-en-service` + `/manifest.webmanifest` générées).
- Smoke-test HTTP : `/manifest.webmanifest`, `/sw.js`, `/icon.svg` → **200 sans auth** ;
  route mise en service → **307 → /login** (protection intacte).

## 6. Piège majeur à connaître

**Le service worker exige un contexte sécurisé (HTTPS ou localhost).** Il ne
s'enregistre **pas** en `http://192.168.x` (LAN). Conséquence :
- **Testable en dev (LAN http)** : tout le **cœur IndexedDB** (écrire hors-ligne,
  persister, resynchroniser depuis un onglet ouvert) via le toggle *Offline* des DevTools.
- **Nécessite Caddy/HTTPS** : l'**installation PWA** et le scénario « app fermée puis
  rouverte hors-ligne » (c'est le SW qui recharge la page).

## 7. Reste à faire

- Tester **section A** (dev) puis **section B** (HTTPS) — procédures détaillées dans
  [`A_FAIRE-mise-en-service-offline.md`](A_FAIRE-mise-en-service-offline.md#-procédure-de-test-à-dérouler-avec-augustin).
- **Icônes PNG** 192/512 + `apple-touch-icon` (SVG insuffisant pour iOS).
- **Sessions JWT plus longues** pour l'usage terrain.
- Test réel sur un **iPhone/Safari** de collègue.
- Puis : **réutiliser `src/lib/offline/`** pour l'outil Visites de chantier.

## 8. Ce qui n'a PAS été fait (volontairement)

- Aucun commit (à faire sur une branche quand tu valides).
- Offline de l'affectation (hors V1).
- Icônes PNG et tests device (nécessitent ta présence).
