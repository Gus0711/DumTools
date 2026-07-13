# Le pivot « Affaire » & le multi-automate

> Doc de référence de la couche **Affaire** ajoutée au-dessus des outils.
> À lire après [`ARCHITECTURE.md`](ARCHITECTURE.md).

## 1. L'idée en une phrase

Une **Affaire** (= le modèle Prisma `Chantier`, présenté « Affaire » dans l'UI) est
le **pivot** de la plateforme : **1 affaire = 1 numéro Why**, rattachée à un client,
qui **regroupe toutes les réalisations** produites pour elle à travers tous les
outils (aujourd'hui les Projets GTB ; demain une GED, etc.).

C'est le même patron que la **fiche client** (`src/lib/clients/`), dupliqué pour
l'affaire (`src/lib/chantiers/`). Principe directeur : **outils découplés, données
couplées** — les outils ne s'appellent jamais entre eux, ils partagent des
entités (Client, Affaire) et se rejoignent sur des **vues d'agrégation**.

```
Client
  └── Affaire (= Chantier, clé = numéro Why)     ← LE pivot
        ├── état : Devis / Commande / En cours / Livrée / Clôturée / Corbeille
        ├── identification : client + n° Why  (source de vérité)
        ├── plan réseau : Réseau 1 + Réseau 2 (partagé)
        │
        ├── [outil Affectation E/S] → Projet GTB (1 automate)   ← multi-automate
        ├── [outil Affectation E/S] → Projet GTB (1 automate)
        └── [futur outil …]        → ses réalisations
```

## 2. Modèle de données

### `Chantier` (= Affaire) — `prisma/schema.prisma`

| Champ | Rôle |
|---|---|
| `numeroWhy String? @unique` | **clé de résolution** : 1 n° Why = 1 affaire |
| `etat EtatAffaire` | `DEVIS · COMMANDE · EN_COURS · LIVRE · CLOTURE · CORBEILLE` (défaut `DEVIS`) |
| `clientId` | rattachement client (une affaire appartient à un client) |
| `affectations` | relation inverse → les automates rattachés |

L'enum **`EtatAffaire`** ne porte **que le workflow** — le **financier (prix, coûts)
reste dans WhySoft** (référencé via le n° Why). **`CORBEILLE`** = affaire mise de côté
(perdue / erreur / doublon) : **masquée par défaut** du tableau de bord mais retrouvable,
jamais supprimée (on l'y remet en changeant d'état).

### `AffectationProjet` (= un automate) — champ ajouté

| Champ | Rôle |
|---|---|
| `chantierId String?` | rattachement à l'Affaire (`onDelete: SetNull`) |

Les champs `clientNom` / `clientId` / `numeroWhy` restent **dénormalisés** sur le
projet (pour les listes/agrégations client) mais sont désormais **pilotés par
l'affaire** (synchronisés, voir §4).

## 3. Résolution & agrégation (le patron réutilisable)

- **Résolution au save** — `resoudreChantierId(numeroWhy, clientId, nom)`
  (`src/lib/chantiers/queries.ts`) : upsert par `numeroWhy`, crée l'affaire au
  besoin. Miroir de `resoudreClientId`.
- **Agrégation** — `listerRealisationsAffaire(chantierId)`
  (`src/lib/chantiers/providers.ts`) : compose les providers de chaque outil.
  Miroir de `listerRealisationsClient`.
- Chaque outil expose **`listerPourChantier(chantierId): Promise<ClientArtefact[]>`**
  (jumeau de son `listerPourClient`) et l'enregistre dans `PROVIDERS`.

> **Ajouter un outil à la fiche Affaire** : (a) `chantierId` sur son entité ;
> (b) résoudre le `chantierId` au save ; (c) exporter `listerPourChantier` ;
> (d) une ligne dans `PROVIDERS` de `chantiers/providers.ts`. Rien d'autre.

## 4. L'identification vit sur l'Affaire

Le **client** et le **n° Why** ne se saisissent **plus dans l'éditeur d'automate** :
ils sont **portés par l'affaire**, et les automates en héritent.

- **Fiche Affaire** (`affaire-fiche-header.tsx`) : nom + client + n° Why + état
  éditables → action `modifierAffaire`.
- **Synchro descendante** : `modifierAffaire` fait un `updateMany` sur les
  automates rattachés (`clientId` / `clientNom` / `numeroWhy`).
- **Éditeur d'automate** (`editeur.tsx` → `ProjetTab`) : plus de champs client/Why ;
  à la place une **référence lecture seule** vers l'affaire. L'automate ne garde
  que **son nom (rôle)** + les champs document (titre, version, date, en-tête).
- **`sauverProjet`** ne persiste plus que `nom` + `data` (contenu technique).

**Affaire d'abord (strict)** — on **ne crée plus d'automate orphelin** :
- Index Projet GTB : le bouton **« Nouveau projet »** ouvre un **sélecteur d'affaire**
  (`selecteur-affaire.tsx` / `boutons-affaire.tsx`) → `creerProjetPourAffaire` (déjà
  rattaché). L'ancienne action orpheline `creerProjet` a été supprimée.
- **MCP** `dumtools_create_project` : `clientNom` + `numeroWhy` **requis** ; il **échoue**
  si l'affaire ne peut être résolue (plus d'orphelin par API non plus).
- **Orphelins hérités** : l'éditeur (`ProjetTab`) d'un automate non rattaché affiche un
  bouton **« Rattacher à une affaire »** → `rattacherProjetAffaire` (pose client / n° Why
  / `chantierId` sans toucher au contenu technique).

## 5. Multi-automate = approche « B »

Un bâtiment à N automates = **1 Affaire + N Projets GTB** (un par automate). On
**ne touche pas** au cœur fragile (dérivation, aperçu, import GFX/PDF) : un `.gfx`
= 1 contrôleur = 1 Projet GTB.

- **« + Ajouter un automate »** sur la fiche Affaire → `creerProjetPourAffaire`
  crée un Projet GTB déjà rattaché (hérite client + n° Why + plan réseau).
- La fiche Affaire liste tous les automates dans **« Réalisations »**.

## 6. Réseau : tout reste sur l'automate (2 ports)

Les ECLYPSE ont **2 ports Ethernet séparables**. Le réseau est géré **par
automate** (pas partagé au niveau affaire — un « plan réseau » sur l'affaire a été
essayé puis retiré, jugé inutile) :

- Éditeur d'automate → **Réseau 1 (port 1)** + **Réseau 2 (port 2)** éditables,
  et **IP port 1** + **IP port 2** (`controller_ip` / `controller_ip_2`).
- L'aperçu affiche les deux IP (port 1 et port 2).

Seul apport conservé côté modèle : `Project.controller_ip_2` (l'IP unique
historique devient l'IP du port 1, la 2e IP est ajoutée).

## 7. Écrans & routes

- `/affaires` — **tableau de bord** : les affaires (client, n° Why, état, nb
  réalisations). **Filtre par défaut = Devis + Commande + En cours** (actives) ; Livrée,
  Clôturée et Corbeille sont masquées par défaut, retrouvables en cliquant leur puce
  (puces aux couleurs des états). Bouton **« Nouvelle affaire »** (`nouvelle-affaire.tsx`).
  L'entrée **« Affaires »** est aussi mise en avant sur l'**accueil**, au-dessus des outils.
- `/affaires/[id]` — **fiche** : identité éditable + plan réseau + réalisations
  agrégées + « + Ajouter un automate ».
- Entrée **« Affaires »** dans la sidebar (hub, à côté d'Accueil).

## 8. Fichiers clés

```
src/lib/chantiers/
  queries.ts            resoudreChantierId, listerAffaires, getAffaire, ETATS_AFFAIRE
  actions.ts            creerAffaire, modifierAffaire, modifierReseauAffaire, changerEtatAffaire
  providers.ts          listerRealisationsAffaire (registre PROVIDERS)
  etats.ts              ETATS_AFFAIRE + etatLabel (client-safe)
  etat-badge.tsx        badge d'état coloré
  affaire-fiche-header.tsx   identité éditable (nom/client/Why/état)
  nouvelle-affaire.tsx  formulaire de création
src/app/(app)/affaires/page.tsx          tableau de bord
src/app/(app)/affaires/[id]/page.tsx     fiche
src/tools/affectation-es/
  queries.ts            listerPourChantier, getProjet (chantierId + affaireNom)
  actions.ts            creerProjetPourAffaire, sauverProjet (n'écrit plus l'identité)
scripts/backfill-chantier-links.ts       rattache les projets existants via n° Why
prisma/migrations/20260710150000_affaire_pivot        chantierId + Chantier enrichi
prisma/migrations/20260710160000_etats_affaire        liste d'états finale
prisma/migrations/…_affaire_reseau + …_drop_affaire_reseau   (essai réseau partagé, annulé)
```

## 9. Reste à faire (brique 3)

- **Livrables consolidés** au niveau affaire : **dossier unique** multi-automate
  (page de garde + 1 section par automate, réutilise l'aperçu mono-automate) et
  **nomenclature / BOM cumulée** (somme du matériel de tous les automates).
- **Outil GED « Documents »** (backup `.gfx`, plans, schémas élec) = 1er nouveau
  satellite rattaché à l'Affaire — le socle est prêt (§3).
- Éventuelle **synchro WhySoft** (tirer l'état/le financier via le n° Why).
- Rattacher aussi la **Liste de points** (legacy) à l'affaire (même recette).
