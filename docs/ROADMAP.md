# DumTools — Feuille de route « une affaire de A à Z »

> **Le document de pilotage** : il consolide tous les « reste à faire » éparpillés
> dans `docs/` et les ordonne sur le **cycle de vie réel d'une affaire chez
> Dumortier**. À lire avant de choisir le prochain chantier de dev.
> Mis à jour : **2026-07-21**.
>
> Dumortier fait **tout de A à Z** : visite de relevé → étude/chiffrage →
> fabrication de l'armoire → programmation → mise en service → mise à
> disposition sur supervision → exploitation/SAV. DumTools doit accompagner
> **chaque étape** de ce cycle — c'est la grille de lecture de toute la
> feuille de route.

---

## 1. Le cycle de vie d'une affaire et la couverture DumTools

```
 1. VISITE      2. ÉTUDE &      3. ARMOIRE      4. PROGRAM-    5. MISE EN     6. LIVRAISON &     7. EXPLOITATION
    DE RELEVÉ      CHIFFRAGE       ÉLECTRIQUE      MATION         SERVICE        SUPERVISION        & SAV
    (terrain)      (bureau)        (atelier)       (bureau)       (terrain)      (bureau+client)    (terrain)
```

| # | Étape métier | Ce que DumTools couvre **aujourd'hui** | Ce qui **manque** | Doc de référence |
|---|---|---|---|---|
| 1 | **Visite de relevé** (avant chiffrage) | rien | Outil **Visites** — type `RELEVE` : checklist repérage, photos, notes vocales, offline | [`VISITES.md`](VISITES.md) |
| 2 | **Étude & chiffrage** | Liste de points, catalogue & modèles, **reco automate**, base matériel (financier = WhySoft) | BOM matériel chiffrable au niveau affaire (cumul multi-automate) | [`AFFAIRES.md`](AFFAIRES.md) §9 |
| 3 | **Fabrication armoire** | les données existent (`Project.points` : bornes, repères, modules) mais rien n'est exporté | **Pont WinRelais** (CSV `;` niveau 1) + BOM armoire | [`ARMOIRE-winrelais-pont.md`](ARMOIRE-winrelais-pont.md) |
| 4 | **Programmation** | **Générer GFX** (squelette), GED Documents (backup `.gfx` sur l'affaire, miroir kDrive) | valider l'ouverture du squelette dans EC-gfxProgram ; import GFX/PDF piloté par la base matériel | [`A_FAIRE-base-materiel.md`](A_FAIRE-base-materiel.md) |
| 5 | **Mise en service** | onglet Mise en service + rapport imprimable + **mode terrain offline (socle codé)** | **validation sur device** (HTTPS, Android, iPhone) — voir P0 | [`A_FAIRE-mise-en-service-offline.md`](A_FAIRE-mise-en-service-offline.md) |
| 6 | **Mise à disposition supervision** | **rien — le trou complet du cycle** | dossier de livraison d'affaire, export des points pour la supervision, PV de réception signé | §4 ci-dessous (nouveau) |
| 7 | **Exploitation / SAV** | rien | Visites — type `MAINTENANCE`, **réserves persistantes** inter-visites | [`VISITES.md`](VISITES.md) |

Lecture : les étapes **bureau** (2, 4) sont bien couvertes — c'est l'historique de
DumTools. Les étapes **terrain** (1, 5, 7) sont le chantier en cours (offline).
Les étapes **interfaces avec les autres équipes / le client** (3, 6) sont les
trous à ouvrir ensuite : peu de code (les données existent déjà), beaucoup de valeur.

> 🆕 **Outil transverse « Notes » (implémenté 2026-07-15)** — notes riches type
> Notion rattachées aux affaires, utiles à **toutes** les étapes (CR de réunion,
> mémo d'étude, consignes de mise en service, doc de livraison) : tables de
> données typées, images/fichiers, code, HTML embarqué, impression A4,
> export PDF/kDrive/Markdown, **partage public par lien** (ex. consignes au
> client). Voir [`NOTES.md`](NOTES.md).

> 🆕 **Outil transverse « Wiki » (implémenté 2026-07-16)** — base de connaissances
> **interne d'entreprise** (savoir durable, non rattaché à une affaire) : rubriques
> thématiques (Administration / Commerce / Dev-Automatisme / Chantier / Armoire),
> tags gérés, **recherche plein-texte Postgres** (tsvector + GIN, résultats classés
> et surlignés), champ résumé, éditeur BlockNote réutilisé des Notes, 100 % interne,
> exposé via le **MCP** (7 outils `dumtools_*_wiki_*`).
> 🔎 **Évolution « v2 » de la recherche** (tags structurés + facettes, pour quand la
> base grossit) : [`RECHERCHE-WIKI.md`](RECHERCHE-WIKI.md) — chantier incrémental,
> reste sur Postgres. **Étape 1 faite (2026-07-16)** : les tags sont une facette
> structurée (ET/OU/SANS sur `WikiPage.tagSlugs`, index GIN), page de recherche à
> facettes `/outils/wiki/recherche`, MCP étendu. Reste Étapes 2 (syntaxe « power »)
> et 3 (unaccent/fuzzy/alias).
> 🌳 **Arborescence de pages (façon Notion) faite + déployée (2026-07-17)** :
> `WikiPage.parentId`/`ordre` (self-relation), dossiers, glisser-déposer, fil d'Ariane,
> sélecteur « Déplacer », MCP `create_wiki_page` accepte `parentId`. Les 32 pages Dev
> pré-rangées sous 3 dossiers (`scripts/wiki-prerangement.mts`).
> **À améliorer plus tard** : *suppression en cascade* — aujourd'hui supprimer une
> page-dossier remonte ses enfants d'un cran (jamais de perte) ; ajouter l'option
> « supprimer le dossier ET tout son sous-arbre » (confirmation avec nb de pages).

---

## 2. Les priorités

### P0 — Valider le socle offline sur device ⭐ (en cours, bloquant, quasi zéro code)

Le socle offline/PWA de la mise en service est **codé et vérifié** (build), mais
**pas testé sur téléphone**. Tant que ce n'est pas fait, on ne construit rien
d'autre dessus — c'est la fondation commune de **toutes** les étapes terrain
(5 aujourd'hui, 1 et 7 demain avec les visites).

- [ ] Icônes **PNG 192/512** + `apple-touch-icon` (le SVG ne suffit pas à iOS).
- [ ] **Sessions JWT allongées** pour l'usage terrain (pas d'expiration en chaufferie).
- [ ] Dérouler la **procédure A** (cœur IndexedDB, dev LAN, DevTools offline).
- [ ] Dérouler la **procédure B** (PWA + HTTPS via Caddy, Android : installer,
      mode avion, fermer/rouvrir, resynchroniser).
- [ ] Refaire le tour sur un **iPhone de collègue** (plancher iOS : quotas, permissions).

→ Procédures pas à pas : [`A_FAIRE-mise-en-service-offline.md`](A_FAIRE-mise-en-service-offline.md#-procédure-de-test-à-dérouler-avec-augustin).
**Ces tests valent aussi Phase 0a de l'outil Visites** — un seul cycle de
validation pour les deux outils.

### P1 — Outil « Visites de chantier » (étapes 1 et 7)

> ✅ **IMPLÉMENTÉ le 2026-07-14** (build OK, **pas encore testé sur device**) —
> état réel, écarts et **procédure de test guidée** dans
> [`VISITES.md`](VISITES.md) **§11**. Livré d'un coup : les **4 types** avec
> leurs checklists guides GTB + armoire électrique, photos live compressées,
> notes vocales (fichiers audio, transcription plus tard), **réserves
> inter-visites**, création 100 % offline (UUID client), médias sur disque VM
> (`VISITES_MEDIA_DIR`) — pas via le spool kDrive.

Reste du plan [`VISITES.md`](VISITES.md) :

- **Tests device (Phase 0a + §11.3)** : dérouler la procédure guidée A→F
  (PC, Android PWA, mode avion, iPhone).
- **Fin de Phase 2 — métier** : compte-rendu PDF + **signature client**, dépôt
  automatique en GED/kDrive.
- **Phase 3 — confort** : transcription Whisper (Proxmox), annotation photo,
  modèles de checklist éditables en base.

### P2 — Livraison & supervision (étape 6, le trou du cycle) 🆕

L'affaire se termine par une **remise au client** : aujourd'hui rien dans
DumTools ne matérialise cette étape. Trois livrables, du moins cher au plus cadré :

1. **Dossier de livraison d'affaire** (élargit la « brique 3 » de
   [`AFFAIRES.md`](AFFAIRES.md) §9) — un PDF unique par affaire, généré depuis
   la fiche Affaire, **composé de données qui existent déjà** :
   page de garde (client, n° Why) · 1 section par automate (réutilise l'aperçu
   mono-automate) · plan d'adressage réseau (IP port 1/2 de chaque automate) ·
   rapport(s) de mise en service · nomenclature matériel cumulée.
   → déposé automatiquement dans la **GED Documents** de l'affaire (le DOE de la GTB).
2. **Export « points supervision »** — CSV des points par affaire (désignation,
   type, signal/protocole, automate, module/canal, IP) pour intégrer le site
   dans la supervision sans ressaisie. Les données sont déjà toutes dans
   `Project.points` + réseaux.
   ⚠️ **Cadrage requis avant de coder** (voir §5) : quelle supervision
   (EC-Net / Niagara ? Builder ? autre ?), quel format d'import de points,
   faut-il des noms d'objets BACnet normalisés ?
3. **PV de réception signé** — c'est la visite type `RECEPTION` de P1 Phase 2 :
   checklist de réception + levée des réserves + **signature client au doigt** →
   PDF en GED. Rien à développer en plus, juste le bon modèle de checklist.

### P3 — Armoire électrique (étape 3)

Pont **Projet GTB → WinRelais** — plan dans
[`ARMOIRE-winrelais-pont.md`](ARMOIRE-winrelais-pont.md). Niveau 1 (CSV `;`,
toutes versions) d'abord ; **bloqué par le cadrage** (voir §5) : édition
WinRelais possédée + un exemple réel de tableau importé + 15 min avec un
collègue armoire. La **BOM cumulée par affaire** (P2.1) sert aussi de repli.

### Fond de roulement (dette, à glisser entre deux chantiers)

- **Phase 5.2** — retrait de l'outil liste-points autonome + drop `PointsList`
  (**destructif**, à valider après vérif prod) — [`ARCHITECTURE.md`](ARCHITECTURE.md) §10.
- **Import GFX/PDF piloté par la base matériel** (aujourd'hui constantes en dur) —
  [`A_FAIRE-base-materiel.md`](A_FAIRE-base-materiel.md).
- **Esthétique de l'impression A4** de la liste de points (signalée moins jolie).
- **Spike kDrive avec les vrais identifiants** (le miroir GED tourne en spool
  tant que l'API n'est pas branchée).
- Validation de l'**ouverture du squelette GFX** dans EC-gfxProgram (échantillons réels).

---

## 3. Transverse — les jalons du cycle sur la fiche Affaire 🆕

> ✅ **FAIT le 2026-07-21** — `src/lib/chantiers/jalons.ts` (calcul) +
> `frise-cycle.tsx` (affichage), en tête de `/affaires/[id]`. Les jalons sont
> **entièrement dérivés**, rien à cocher. Deux d'entre eux tournent sur un
> signal de repli en attendant leur vrai livrable : **Armoire** s'appuie sur le
> schéma déposé en GED (l'export WinRelais de P3 prendra le relais) et
> **Livraison** sur la visite `RECEPTION` (le dossier de livraison P2.1
> viendra s'y ajouter).
> À la même occasion : l'axe **commercial** `EtatAffaire` est devenu un fil
> d'étapes cliquable dans l'en-tête de la fiche (Devis → … → Clôturée, Corbeille
> à part).

Le « ne rien oublier » ne vaut pas que pendant une visite : il vaut au niveau de
**l'affaire entière**. `/affaires/[id]` affiche une **frise des 7 étapes** avec
jalons **dérivés automatiquement** — pas de saisie manuelle, même esprit que
`PROVIDERS` :

| Jalon | Signal (existant ou apporté par P1/P2) |
|---|---|
| Relevé fait | ≥ 1 visite `RELEVE` synchronisée ✅ |
| Étude faite | ≥ 1 Projet GTB avec automate choisi ✅ |
| Armoire | *repli* : schéma déposé dans le dossier « Armoire » si `besoinArmoire = NOUVELLE` ✅ — export WinRelais (P3) à terme |
| Programmé | `.gfx` ou fichier du dossier « Prog » déposé en GED ✅ |
| Mis en service | points testés / total, cumulé sur tous les automates ✅ |
| Livré | *repli* : ≥ 1 visite `RECEPTION` ✅ — + dossier de livraison (P2.1) à terme |
| SAV | compteur de **réserves ouvertes** (toutes visites) + passages `MAINTENANCE` ✅ |

L'enum `EtatAffaire` (Devis/Commande/En cours/Livrée/Clôturée) reste le
**workflow commercial** ; la frise est l'**avancement technique**. Deux axes
complémentaires, pas un remplacement.

---

## 4. Ordre proposé des prochaines sessions

1. **P0** — tests device du socle offline (séance guidée avec Augustin,
   checklist pas à pas — c'est du test, pas du code).
2. **P1 Phase 0b** — spike médias offline (photo → blob local → spool kDrive).
3. **P1 Phase 1** — socle Visites, type `RELEVE` → **test guidé sur une vraie
   visite** (ou simulée dans le garage 🙂).
4. **P1 Phase 2** — réserves + CR PDF + signature + GED → test guidé.
5. **P2.1** — dossier de livraison d'affaire (indépendant du terrain, faisable
   en parallèle si un cadrage bloque).
6. **P2.2 / P3** — export supervision et pont WinRelais, **dès que les cadrages
   (§5) sont revenus**.

> ⚠️ Rappel d'encadrement ([`VISITES.md`](VISITES.md) §10) : chaque étape
> terrain se termine par une **procédure de test manuelle déroulée avec
> Augustin** (installation PWA, mode avion, permissions, synchro…) — jamais du
> code livré seul.

---

## 5. Questions à poser (cadrage — en parallèle du dev, ne bloquent que P2.2/P3)

À poser aux collègues / à trancher, consolidées ici pour ne pas les perdre :

1. **Supervision** : quelle(s) plateforme(s) utilisez-vous pour la mise à
   disposition (EC-Net/Niagara, Builder, autre) ? Que remet-on concrètement au
   client à la livraison (accès, doc, formation) ? Existe-t-il un format
   d'import de points ?
2. **WinRelais** : quelle édition (Standard / Premium / Expert) ? Récupérer un
   exemple réel du tableau CSV importé aujourd'hui + 15 min avec un collègue
   armoire (« que recopies-tu à la main depuis nos données ? »).
3. **Visites** : confirmer la cible n°1 = `RELEVE` avant chiffrage (recommandé)
   plutôt que réception/punch-list.
4. **iPhone de test** : quel collègue prête son iPhone pour la validation iOS (P0) ?
