# Notes de frais — spécification

> Outil perso **ToolGus** (`proprietaire: "gus"`), route `/perso/gus/notes-de-frais`.
> Statut : **implémenté et vérifié côté serveur** (2026-07-21). Reste le test
> en navigateur et sur téléphone réel — voir §12.

## 1. Le problème

Aujourd'hui : on garde ses tickets dans une poche / la boîte à gants, et en fin de mois on
remplit à la main un des deux classeurs Excel de `docs/ndf/`, on agrafe les justificatifs
derrière, on signe, on remet le 5 pour paiement le 10.

Ce qui coince : les tickets se perdent ou se décolorent, la saisie de fin de mois est un
moment pénible et approximatif, et personne ne sait où il en est avant d'avoir tout ressaisi.

## 2. Le principe : deux temps

C'est **la** décision de conception, tout en découle.

```
   ┌─ TEMPS 1 ──────────────┐        ┌─ TEMPS 2 ─────────────────────┐
   │  Dépense               │        │  Note du mois                 │
   │  saisie au fil de      │  ───▶  │  récap agrégé (utilisateur,   │
   │  l'eau, sur téléphone  │        │  mois) → Excel + PDF          │
   └────────────────────────┘        └───────────────────────────────┘
              │
              └─ sans justificatif ─▶  zone « en attente »
                                        (hors récap, rattrapable)
```

**Règle centrale — une dépense sans justificatif n'entre pas dans le récap mensuel.**
Elle reste visible dans une zone « en attente de justificatif », elle n'est pas perdue,
et elle rejoint le récap dès que la photo est ajoutée. C'est ce qui remplace la contrainte
bloquante : on n'empêche jamais de saisir, mais on ne transmet que du complet.

## 3. Décisions de cadrage

| Sujet | Décision |
|---|---|
| **Rangement** | Outil perso ToolGus, `/perso/gus/notes-de-frais` — hors accueil et sidebar |
| **Extraction auto (OCR)** | **Repoussée.** v1 = saisie manuelle assistée. Le schéma prévoit les champs pour la brancher plus tard sans migration destructive |
| **Validation** | **Aucun circuit.** Dépôt simple, l'outil produit les fichiers, la validation reste papier/signature comme aujourd'hui |
| **Sortie** | Excel (modèle existant rempli à l'identique) **+** PDF unique des justificatifs numérotés |
| **Saisie** | Mobile au fil de l'eau, **en ligne** (pas de couche offline en v1) |
| **Cloisonnement** | **Total.** Chacun ne voit que ses propres dépenses et ses propres mois. Aucune vue globale n'existe dans l'outil, pas même pour un ADMIN |
| **Modèle Excel** | Déterminé par un **profil NDF fixé par utilisateur** (`TECHNICIEN` \| `DIRECTION_RA`), réglé par un admin. Le salarié ne choisit rien |
| **Rattachement affaire** | Combobox alimentée par les affaires de la plateforme, **saisie libre autorisée**, **jamais obligatoire**. Pas de remontée sur les fiches Affaire/Client en v1 (toutes les affaires ne sont pas dans l'outil) |
| **Cycle du mois** | La note est marquée « transmise le … » (horodaté) mais reste rouvrable et régénérable |
| **N° de pièce** | Numérotation **automatique et chronologique** des justificatifs. Le même numéro est imprimé sur chaque justificatif du PDF. Au-delà de 31 lignes → seconde feuille |
| **Suivi** | Historique perso 12 mois (montant, nb de justificatifs, transmis ou non) + alertes de cohérence avant génération |
| **ACT / CA** (modèle technicien) | **Colonnes mortes** — plus remplies en pratique. Laissées vides dans l'Excel, absentes de la saisie |
| **Ticket resto à déduire** | **Sans objet** — pas de titres-restaurant dans l'entreprise. Colonne reportée vide |
| **TVA** | **Saisie à la main** depuis le ticket, champ optionnel. Aucun calcul automatique (les tickets mélangent les taux) |
| **Indemnités kilométriques** | Hors périmètre — véhicules de société, on rembourse le carburant réel |
| **Rattrapage tardif** | Un justificatif ajouté après transmission du mois → la dépense est **reportée sur le mois suivant**, en gardant sa date réelle et avec la mention d'origine dans le descriptif. Un fichier déjà remis n'est jamais invalidé |
| **Société** | **`DUMORTIER`** pour tout le monde → case pré-remplie depuis une constante, jamais saisie |
| **Volumétrie** | ~15 personnes, toutes n'ont pas de note chaque mois. Plafond estimé : ~40 notes et ~100 justificatifs par mois → **de l'ordre de 250 Mo/an** en photos compressées. Aucune politique de purge nécessaire |

## 4. Les deux modèles Excel

Fichiers sources : `docs/ndf/Note de frais TECHNICIENS.xls` et `docs/ndf/Note de frais  Dir & RA.xls`
(format BIFF de 2000/2023, logo embarqué, formules de sous-totaux, zone d'impression réglée).

### 4.1 Modèle `TECHNICIEN` — portrait, lignes 6 → 36 (31 lignes)

| Col | En-tête | Alimenté par |
|---|---|---|
| A | N° pièce | numérotation auto (1…n) |
| B | AFF. | n° d'affaire (libre ou choisi) |
| C | ACT | *(vide — colonne morte)* |
| D | CA | *(vide — colonne morte)* |
| E | Transport Péage Parking | catégorie `TRANSPORT` |
| F | Hôtel ou restaurant — SEUL | catégorie `REPAS_HOTEL_SEUL` |
| G | Hôtel ou restaurant — ACCOMPAGNÉ | catégorie `REPAS_HOTEL_ACCOMPAGNE` |
| H | Essence Gazole | catégorie `CARBURANT` |
| I | Entretien véhicules | catégorie `ENTRETIEN_VEHICULE` |
| J | Achats divers | catégorie `ACHATS_DIVERS` |
| K | TOTAL | **formule existante** `=E+F+G+H+I+J` — on n'écrit pas dedans |
| L | Descriptif | descriptif libre |

En-tête : `E1` mois, `E2` nom, `H2` prénom, `K2` société. Sous-totaux ligne 37 (formules `SUM`).
Signature du demandeur ligne 38.

### 4.2 Modèle `DIRECTION_RA` — paysage, lignes 8 → 38 (31 lignes)

| Col | En-tête | Alimenté par |
|---|---|---|
| A | N° pièce | numérotation auto |
| B | Date | date de la dépense |
| C:E | Descriptif | descriptif libre (cellules fusionnées) |
| F | Somme dépenses | **formule existante** `=G+H+I+L+N` |
| G | Transports Péage Parking | catégorie `TRANSPORT` |
| H | Gasoil Essence | catégorie `CARBURANT` |
| I | Achats divers | catégorie `ACHATS_DIVERS` |
| J | N° Affaire | n° d'affaire |
| K | Nbre invités Fareneït | nb d'invités (repas d'affaires) |
| L | Coûts | catégorie `REPAS_AFFAIRES` |
| M | Ticket resto à déduire O/N | *(vide — sans objet)* |
| N | Consommations | catégorie `CONSOMMATIONS` |
| O | Total TVA | TVA saisie à la main |
| P:Q | Noms des sociétés ET des invités | liste des invités |

En-tête : `A5` mois, `F5` nom, `P5` société. Totaux ligne 39 (`SUM`), `I41 = F39` (montant à régler).
Double signature ligne 40 (intéressé / directeur).

### 4.3 Catégories par profil

Chaque profil ne voit **que** ses propres catégories à la saisie — pas de liste commune
avec des entrées inapplicables.

| `TECHNICIEN` | `DIRECTION_RA` |
|---|---|
| Transport / péage / parking | Transports / péage / parking |
| Restaurant ou hôtel — seul | Gasoil / essence |
| Restaurant ou hôtel — accompagné | Achats divers |
| Essence / gazole | Repas d'affaires (avec invités) |
| Entretien véhicule | Consommations |
| Achats divers | |

Les catégories `REPAS_AFFAIRES` déclenchent seules les champs *nb d'invités* et *noms des
sociétés et invités* (colonnes K et P:Q).

Le modèle `DIRECTION_RA` n'a pas de colonne hôtel : une nuit d'hôtel s'impute en
**`ACHATS_DIVERS`** avec un descriptif explicite (« Hôtel Ibis Reims, nuit du 12/03 »).
Le gabarit Excel n'est pas modifié.

## 5. Écrans

### 5.1 `/perso/gus/notes-de-frais` — accueil perso

- Un bouton **« Ajouter une dépense »** dominant (cible pouce, sticky sur mobile).
- **Mois en cours** : total, nombre de lignes, liste compacte.
- **En attente de justificatif** : bloc distinct, en orange, avec un bouton photo direct sur
  chaque ligne. C'est la zone qu'on veut vider.
- **Historique 12 mois** : une ligne par mois — total, nb de justificatifs, badge
  *transmise le …* ou *à transmettre*. Table en mode cartes sous 640 px (`.table-cards`).

### 5.2 Saisie d'une dépense — un seul écran, mobile-first

Ordre pensé pour le terrain, au moment de payer :

1. **Photo** (`<input capture="environment" multiple>`, compression client) — plusieurs
   clichés possibles sur une même dépense (recto/verso, facture longue).
2. **Montant TTC** — clavier numérique, gros champ.
3. **Catégorie** — boutons larges, pas un `<select>`, restreints au profil.
4. **Date** — pré-remplie à aujourd'hui.
5. **Descriptif** — libre, mémorise les saisies récentes.
6. **Affaire** — optionnelle, combobox + saisie libre.
7. *(si repas d'affaires)* nb d'invités + noms des sociétés/invités.
8. *(optionnel)* TVA.

Enregistrer → retour à l'accueil, la ligne apparaît dans le mois en cours.

### 5.3 `/perso/gus/notes-de-frais/[annee]/[mois]` — la note du mois

Tableau des lignes retenues (celles qui ont un justificatif), sous-totaux par catégorie,
bloc **alertes** (§7), et trois actions : *Télécharger l'Excel*, *Télécharger le PDF des
justificatifs*, *Marquer comme transmise*.

## 6. Cloisonnement — règles serveur

Non négociable, appliqué **côté serveur** et pas seulement dans l'affichage :

- Toute lecture est filtrée par `createdById = session.user.id`. Il n'existe **aucune**
  requête renvoyant les dépenses d'autrui, donc aucune vue globale à sécuriser.
- La route de service des justificatifs (`GET /api/ndf/media/[id]`) **joint la dépense et
  vérifie la propriété** — contrairement aux routes média existantes qui se contentent de
  vérifier la session (voir le piège relevé sur `/api/formulaires/media/[id]`).
- Un ADMIN n'a **pas** d'accès élargi. S'il en faut un plus tard (compta), ce sera un profil
  NDF dédié explicite, pas un effet de bord du rôle technique.

## 7. Alertes de cohérence (avant génération)

Signalées, jamais bloquantes :

- dépense sans justificatif (→ exclue du récap, c'est la règle centrale) ;
- même montant + même date saisis deux fois (doublon probable) ;
- montant anormalement élevé pour la catégorie ;
- ligne sans imputation affaire ;
- mois précédent jamais marqué comme transmis.

## 8. Génération des fichiers

- **Excel** : les deux `.xls` sont convertis **une fois** en `.xlsx` et versionnés comme
  gabarits dans `src/tools/notes-de-frais/modeles/`. On charge le gabarit, on écrit
  **uniquement dans les cellules de données** (jamais dans les cellules de formule : les
  totaux se recalculent seuls), on force le recalcul à l'ouverture, on renvoie le binaire.
  Au-delà de 31 lignes, la feuille est dupliquée.
- **PDF** : un document unique reprenant les justificatifs dans l'ordre des n° de pièce,
  chaque page tamponnée de son numéro pour correspondre à la colonne A/A du tableur.

**Bibliothèque retenue : ExcelJS** (`exceljs` ^4.4). Choix validé par un essai
sur les vrais gabarits, pas sur un comparatif : chargement du classeur, écriture
des cellules, réécriture — logo, styles (103 formats de cellule), formules,
cellules fusionnées et zone d'impression ressortent intacts.

⚠️ **Le piège, et sa parade.** Les cellules de total sont des formules dont la
valeur en cache vaut `0` dans le gabarit. Excel recalcule à l'ouverture, mais
**LibreOffice ne recalcule pas par défaut** : le fichier s'ouvrait avec des
totaux à « 0,00 € » sous des lignes correctement remplies. La parade est
d'écrire la formule **et** son résultat (`{ formula, result }`) : tout lecteur
affiche le bon montant immédiatement, et la formule reste vivante si la compta
retouche une ligne. `fullCalcOnLoad` est posé en plus, par sécurité.

Le PDF est assemblé avec **pdf-lib** : une page A4 par photo (en-tête n° de
pièce / date / rubrique / montant), et les PDF de facture déposés depuis un PC
sont **recopiés page à page** puis tamponnés, jamais ré-imagés.

## 9. Repoussé (mais prévu dans le schéma)

- **OCR / extraction auto** — champs `ocrBrut Json?`, `ocrConfiance`, `saisieSource` posés dès
  la v1 pour brancher l'extraction sans migration douloureuse.
- **Circuit de validation** — `statut` porte déjà les valeurs futures.
- **Dépôt kDrive automatique** et **remontée sur les fiches Affaire/Client**.
- **Indemnités kilométriques** (barème fiscal) — sans objet tant que tout le monde roule en
  véhicule de société.

## 10. Points ouverts

*(Les quatre points ouverts de la première rédaction ont été tranchés — voir §3 et §4.3.)*

Plus aucun point bloquant : le cadrage est complet, la spec est prête à être développée.

## 11. Mise en œuvre — lots

1. **Fondation** : entrée de registre, schéma Prisma (`DepenseFrais`, `NoteFraisMois`,
   `JustificatifFrais`, enum `ProfilNdf`), migration, `NDF_MEDIA_DIR` **+ volume Docker dans
   le même commit**, profil NDF dans `/configuration/utilisateurs`.
2. **Saisie** : écran de saisie mobile + upload/compression photo + route média avec contrôle
   de propriété.
3. **Récap** : accueil perso, zone « en attente », note du mois, alertes.
4. **Export** : remplissage du gabarit Excel + PDF des justificatifs + marquage « transmise ».
5. *(plus tard)* OCR, kDrive, validation.

## 12. État de la livraison (2026-07-21)

### Vérifié
- **Gabarits Excel** — les deux modèles remplis et relus cellule par cellule
  (`npx tsx --conditions=react-server scripts/ndf-smoke.mts`) : montants dans les
  bonnes colonnes, n° de pièce, sous-totaux, TOTAL général, montant à régler,
  logo conservé, orientation d'impression conservée, formules toujours en place,
  colonnes mortes vides.
- **PDF des justificatifs** — sommaire + une page par pièce, photos réellement
  embarquées, `€` et tirets cadratins corrects (WinAnsi).
- **Cloisonnement, en HTTP réel** avec une vraie session :
  | Cas | Attendu | Obtenu |
  |---|---|---|
  | Déposer un justificatif sur SA dépense | 200 | ✅ 200 |
  | Déposer sur la dépense d'autrui | refus | ✅ 409, sans révéler qu'elle existe |
  | Lire SON justificatif | 200 | ✅ 200 `image/jpeg` |
  | Lire celui d'autrui **en connaissant son UUID** | 404 | ✅ 404 |
  | Export Excel / PDF du mois | 200 | ✅ 200, bons en-têtes |
- **Règle de rattrapage** — ticket du 20/07 dont le mois est déjà transmis :
  imputé sur `2026-08` avec `periodeOrigine = 2026-07`, API répondant
  `reportee: true`.
- Toutes les routes répondent et sont protégées (307 → `/login` sans session).
- `tsc --noEmit`, `eslint` (aucun problème dans le nouveau code) et `next build`
  passent.

### Pas encore vérifié
- **Le navigateur.** Aucun écran n'a été ouvert pour de vrai : la saisie, la
  capture photo, l'affichage des vignettes et le rendu mobile restent à
  éprouver. C'est le prochain pas, et il demande un téléphone.
- **La caméra sur appareil réel** (`capture="environment"`), et le comportement
  d'iOS qui produit parfois du HEIC — la compression canvas le convertit en
  JPEG, mais ça n'a pas été observé sur un vrai iPhone.
- **Le débordement au-delà de 31 lignes** (duplication de feuille) : codé, mais
  jamais atteint par le jeu d'essai.

### Décision assumée
L'outil n'est **pas** branché sur la recherche globale ⌘K ni sur les fiches
Affaire/Client. Ce serait contradictoire avec le cloisonnement : une note de
frais n'a pas à apparaître dans un index transverse consultable par un collègue.
