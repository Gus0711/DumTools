# Le fil du devis — conception & plan

> **État : IMPLÉMENTÉ le 2026-08-10** — voir §11 pour ce qui a réellement été
> livré, et les trois écarts au plan. Le corps du document reste le CADRAGE.
>
> **État initial : plan validé, rien n'est écrit.** Cadré le 2026-08-10 en partant du
> *chatter* d'Odoo, puis ramené à ce que la plateforme sait réellement faire.
> **Révisé le 2026-08-10 après relecture** : quatre décisions ont changé — la
> place (§3), l'ordre des lots (§9), le sort de `Devis.note` (§4.3) et la
> cascade des messages (§4.2). Elles sont marquées ✅ dans le texte.
>
> Doc de l'outil : [`DEVIS.md`](DEVIS.md) · défauts connus :
> [`amelioration_devis.md`](amelioration_devis.md) · socle médias :
> `src/lib/medias-document/`.

---

## 1. L'idée en une phrase

**Une colonne de temps à côté du chiffrage** : ce que les gens écrivent au sujet
de ce devis, et les fichiers qui vont avec, au même endroit que le prix.

Aujourd'hui tout ce qui entoure un devis — « le client demande 3 % », « l'automate
est en huit semaines », le bon de commande signé renvoyé par mail — vit dans une
boîte mail, un fil Teams ou une tête. Le devis, lui, ne porte qu'un champ `note`
libre, écrasé à chaque fois que quelqu'un le modifie.

---

## 2. Ce que la plateforme a déjà, et ce qui manque

Le *chatter* d'Odoo, démonté, c'est six briques. Trois existent ici.

| Brique Odoo | Dans DumTools |
|---|---|
| Pièces jointes | ✅ `DevisMedia` — parent = **le devis**, disque VM, route gardée `/api/devis/media/[id]`, upload idempotent par UUID |
| Tracking (« état passé à Émis ») | 🟡 les faits sont en base (`etat`, `publieLe`, `emisLe`, `DevisConsultation`, chaîne `parentId`) — rien ne les met en fil |
| Messages | ❌ aucun modèle de commentaire dans tout le dépôt |
| Followers / abonnés | ❌ |
| Notification / e-mail | ❌ **et rien pour l'envoyer** : ni nodemailer, ni SMTP, ni service mail dans le projet |
| Planifier une activité | 🟡 `TacheAffaire` existe, mais sur l'**Affaire**, pas sur le devis |

**La conséquence à assumer** : ce fil sera **consulté quand on ouvre le devis**,
jamais un fil qui vient te chercher. Dessiner une boîte de réception qui ne
sonnera pas serait la première erreur.

---

## 3. Les décisions

| | Décision | Ce que ça coûte / évite |
|---|---|---|
| **Qui** | ADMIN + ACHATS — exactement `peutVoirDevis` | Aucune règle d'accès nouvelle |
| **Où** ✅ | Un **4ᵉ onglet « Fil »** dans le panneau de droite | Aucune mise en page nouvelle, et c'est réversible |
| **Quoi** | Messages texte + pièces jointes | Ni événements automatiques, ni mentions |
| **Portée** | La **chaîne de révisions** : v1 et v2 partagent le fil | Une duplication repart vierge |
| **En plus** | Compteur de **non-lus** · **versement d'une pièce vers la GED** | |

### 3.1 Réservé aux Achats — ce que ça fait tomber

L'ouverture à tous les collègues a été envisagée puis écartée. Elle imposait
trois chantiers d'un coup, et les trois disparaissent :

1. **Une seconde route média.** `/api/devis/media/[id]` est gardée
   `peutVoirDevis`, et son commentaire dit pourquoi : *« une photo de tarif
   fournisseur n'a rien à faire hors du périmètre Achats »*. Ouvrir le fil aurait
   exigé une route distincte pour les pièces de messages, avec sa propre garde.
   **La route existante convient telle quelle.**
2. **Une vue « devis sans chiffres »** pour qu'un `MEMBRE` lise un devis dont il
   ne doit pas voir le déboursé.
3. **Une porte d'entrée.** L'outil est `proprietaire: "gus"` : hors sidebar, hors
   accueil, hors ⌘K, hors `PROVIDERS`. Pour un `MEMBRE`, l'outil Devis n'existe
   nulle part dans l'interface — écrire un fil qu'il ne peut pas atteindre
   n'aurait servi à rien.

La question se rouvrira le jour où l'outil sortira de l'espace perso.

### 3.2 Texte brut, pas BlockNote

Le socle document riche est là, et le devis en est déjà le 3ᵉ consommateur (les
lignes `TEXTE`). Il ne servira pas ici. `texte-riche.tsx` porte l'argument mot
pour mot : *« un devis porte dix commentaires, pas un document »*. Un message de
fil est une phrase — un `<textarea>` qui grandit suffit, et trois ProseMirror
dans une colonne de discussion sont du poids pour rien.

### 3.3 Ce qui reste dehors, et pourquoi

- ~~Les événements automatiques~~ — ✅ **rapatriés en lot 1** (voir §9). Ils
  n'avaient rien à faire ici : la valeur de ce chantier est la MÉMOIRE du devis,
  pas la conversation. À deux personnes sur l'outil, un fil de messages est un
  bloc-notes ; une frise « émis le · publié le · ouvert par le client · v2 issue
  de v1 » est une trace qu'on ne peut obtenir autrement. Et elle ne coûte
  **aucune écriture nouvelle** : les faits sont déjà en base.
- **Les mentions `@`** — sans e-mail, une mention n'est qu'un surlignage.
- **L'e-mail** — pas un morceau de chatter mais un chantier entier (SMTP, file
  d'envoi, rebonds).
- **La réponse du client sur `/d/{jeton}`** — la page publique est exclue du
  matcher de `src/proxy.ts` et exposée par le tunnel Cloudflare : ce serait un
  point d'écriture **non authentifié ouvert au monde**, avec limitation de débit
  et modération à la clé.
- **Les followers** — à trois personnes qui voient tout, de la mécanique pour rien.

---

## 4. Le modèle

```prisma
model Devis {
  // …
  /// La CHAÎNE de révisions, dénormalisée. Posé à sa propre valeur d'id à la
  /// création, RECOPIÉ par une révision, NEUF par une duplication.
  filId String
}

/// Un message du fil. `evenement`/`donnees` restent vides en v1 : deux colonnes
/// nullables coûtent zéro et évitent une seconde migration le jour où les
/// événements automatiques arrivent.
model MessageDevis {
  id        String @id @default(cuid())
  /// La conversation — c'est LUI qu'on interroge, jamais une remontée de parentId.
  filId     String
  /// La version d'où le message a été écrit (pastille « v1 »). ⚠️ SetNull et
  /// non Cascade : supprimer la v1 ne doit pas effacer la négociation qui a
  /// mené à la v2 — c'est exactement la mémoire qu'on cherche à garder (§4.1 bis).
  devisId   String?
  devis     Devis? @relation(fields: [devisId], references: [id], onDelete: SetNull)
  corps     String
  auteurId  String?
  auteur    User?   @relation(fields: [auteurId], references: [id], onDelete: SetNull)
  epingle   Boolean @default(false)
  evenement String?
  donnees   Json?
  createdAt DateTime  @default(now())
  modifieLe DateTime?

  pieces DevisMedia[]

  @@index([filId, createdAt])
}

model DevisMedia {
  // …
  /// Pièce jointe d'un message (null = image d'un texte libre de ligne).
  /// ⚠️ C'est ce champ qui décide de la purge ET de la copie en révision.
  messageId String?
  message   MessageDevis? @relation(fields: [messageId], references: [id], onDelete: Cascade)
}

/// « Qu'est-ce qui est arrivé depuis ma dernière visite ? » — écrite à
/// l'OUVERTURE DU TIROIR, pas au chargement de la page.
model LectureFilDevis {
  userId String
  filId  String
  vuLe   DateTime @default(now())
  @@id([userId, filId])
}
```

### 4.1 Pourquoi `filId` dénormalisé plutôt que remonter `parentId`

`Devis.parentId` est en `onDelete: SetNull` : supprimer la v1 **casse la chaîne**,
et la v2 se retrouverait orpheline de son propre fil. Une colonne dénormalisée
survit à cette rupture, et transforme la lecture du fil en une requête sur un
index — au lieu d'une remontée récursive à chaque ouverture.

⚠️ La contrepartie envisagée ici (cascade sur `devisId`) a été **écartée** —
voir §4.1 bis.

**Reprise des devis existants** : un script calcule la racine de chaque chaîne
une fois (`scripts/devis-fil-backfill.mts`).

### 4.1 bis ✅ La cascade des messages — `SetNull`, pas `Cascade`

Le §4.1 assumait que supprimer la v1 efface ce qui y a été écrit. **C'est contre
le but** : tout l'intérêt du fil est la mémoire de la négociation, et c'est
justement sur la v1 qu'elle s'est jouée.

`MessageDevis.devisId` passe donc en **`onDelete: SetNull`** (nullable). `filId`
n'est pas une clé étrangère : la conversation survit intacte, et un message dont
la version a disparu s'affiche « écrit sur une version supprimée » au lieu de sa
pastille « v1 ». Coût : un nullable et un libellé de repli.

### 4.3 ✅ Le sort de `Devis.note` — et ce qu'on a trouvé à côté

En vérifiant, **trois** champs `note` cohabitent dans le devis, et aucun n'est
atteignable depuis l'interface alors que les trois server actions les acceptent :

| Champ | Ce que c'est | Verdict |
|---|---|---|
| `Devis.note` | note **interne** du devis entier ; `getDevisPublic` la force à `""`, elle ne part jamais chez le client | **Remplacée par le fil.** La reprise en fait le premier message (auteur inconnu, daté de `createdAt`), puis la colonne part |
| `LotDevis.note` | un paragraphe sous le titre d'un lot — **imprimé sur le document client** (`.lot-note` dans `document-devis.tsx`) | **À garder et à EXPOSER** : ce n'est pas du déchet, c'est un manque. Il lui faut un champ dans l'entête de lot |
| `LigneDevis.note` | la note d'une ligne | À garder ; hors périmètre de ce chantier |

Autrement dit : une seule des trois est morte. Les deux autres sont câblées
jusqu'au serveur et n'attendent qu'un champ de saisie — dont un qui **sort déjà
sur le devis du client**.

### 4.2 Modifier, supprimer

Chacun modifie et supprime **les siens** (mention « modifié » à côté de l'heure) ;
un `ADMIN` peut supprimer n'importe lequel. La suppression est **franche** — pas
de « message supprimé » en pierre tombale : à trois personnes, la bureaucratie du
tombstone coûte plus qu'elle ne rapporte. Les pièces jointes du message partent
avec lui (`Cascade`).

---

## 5. ⚠️ Les deux corrections obligatoires dans l'existant

Elles ne sont pas optionnelles : **sans elles, la fonction perd des données en
silence.**

1. **`purgerMediasDevis`** (`src/tools/devis/actions.ts`) supprime tout
   `DevisMedia` de plus de 5 minutes qu'**aucune ligne** ne cite — disque compris.
   Une pièce jointe de message n'est citée par aucune ligne : elle serait donc
   effacée à la prochaine frappe dans un texte libre. **Parade** : ajouter
   `messageId: null` au `where` des candidats.
2. **`copierMedias` / `nouvelleRevision`** recopie les binaires du devis parent.
   Le fil est partagé par toute la chaîne : recopier ses pièces à chaque révision
   les dupliquerait sur le disque **et** dans le tiroir. **Parade** : ne recopier
   que les médias `messageId: null`.

---

## 6. Le tiroir

### 6.1 Comportement

✅ **Un onglet, pas un tiroir.** Trois options ont été pesées :

| | Coût |
|---|---|
| Couper le panneau en deux | Le fil hérite de ~300 × 312 px **à vie**, et reprend en permanence la place qu'on vient de dégager dans Composition / Négocier / Publier |
| Tiroir latéral de 400 px | Il reprend au tableau bien plus que ce que le repli du rail vient de lui rendre (160 px), et ajoute un troisième état de mise en page à tenir |
| **4ᵉ onglet** ✅ | Zéro mise en page nouvelle · la pastille de non-lus se pose **sur l'onglet** · **réversible** : si c'est trop étroit à l'usage, on le promeut en tiroir |

C'est aussi le modèle d'**Odoo 17**, où le chatter est passé du bas du
formulaire au panneau de droite — précisément parce qu'en bas il ne servait pas.
Ce que l'onglet retire : voir le fil *pendant* qu'on tape des prix. On lit un fil
avant ou après un chiffrage, pas pendant.

- **La pastille de la barre de devis** porte le nombre de messages, **en gras
  avec un point quand il y a des non-lus** ; l'onglet lui-même porte le compte.
- Ordre **antéchronologique inversé** (le plus récent en bas, comme une
  messagerie), composeur collé en bas, la zone des messages est le seul
  défilement du tiroir.
- **Le composeur** : `<textarea>` qui grandit, **Entrée = envoyer**, **Maj+Entrée
  = nouvelle ligne**, collage d'image depuis le presse-papier, dépôt de fichier
  par glisser sur n'importe quel point du panneau.
- **Une pièce jointe** s'affiche en vignette (image) ou en ligne fichier (icône,
  nom, taille). Le téléchargement passe par le `?dl=1` qui existe déjà
  (`dispositionMedia`). Plafond inchangé : `TAILLE_MAX_MEDIA_DEVIS` = 25 Mo.
- **Un message peut être épinglé** — « le client veut la livraison en octobre »
  remonte en tête et ne se perd pas dans le défilement.

### 6.2 ⚠️ Le piège de structure

La coquille est `data-plein-page` avec `lg:overflow-hidden`, et **un seul**
défilement est autorisé dans tout l'écran. Le volet du fil doit porter `min-h-0`
et son propre `overflow-y-auto`, sinon il pousse la barre de totaux hors de
l'écran — exactement le piège n°1 du [§22.4 de `DEVIS.md`](DEVIS.md). Le panneau
à onglets a déjà ce qu'il faut (`min-h-0 flex-1 lg:overflow-y-auto`) : le fil
doit s'y **substituer**, pas s'y ajouter, car le composeur est collé en bas et le
défilement porte sur la liste seule.

### 6.3 ⚠️ L'écriture

**Aucun `revalidatePath`.** Le fil tient son propre état et pose le message
localement, comme `sauverTexteLigne` et `TexteRiche` : aucun total ne dépend d'un
message. C'est aussi ce qui évite les trois pièges mesurés au [§20](DEVIS.md) —
pas de `useTransition` autour d'une écriture, pas de double rafraîchissement, pas
de `setState` pendant le rendu.

Corollaire de la règle du §14.3 : **qui n'invalide pas doit afficher son propre
état.** Le fil garde la liste qu'il a obtenue et y ajoute ce qu'il vient
d'écrire ; le serveur ne reprend la main qu'au prochain chargement de page.

---

## 7. Les non-lus

`LectureFilDevis(userId, filId, vuLe)` est écrite **à l'ouverture de l'onglet** —
pas au chargement de la page : ouvrir un devis pour corriger un prix ne vaut pas
« j'ai lu ».

Trois endroits l'affichent : l'**onglet** lui-même, la **pastille de la barre de
devis**, et une colonne discrète sur **l'index des devis** — c'est là qu'on balaie ses affaires en cours.

---

## 8. Le versement vers la GED

### 8.1 ⚠️ La condition d'existence : une affaire

`Devis.chantierId` est **nullable**, `Document.chantierId` est **obligatoire**
(`Cascade`). Le bouton de versement **n'existe pas** quand le devis n'est
rattaché à aucune affaire : à la place, une ligne grise « rattacher le devis à
une affaire pour verser dans la GED », qui pointe vers la pastille Affaire de la
barre. Pas de bouton mort qui explique son échec après le clic.

### 8.2 Ponctuel, jamais une synchro

Une action serveur relit le binaire sur le disque, crée une ligne `Document`, écrit
le spool, et laisse le worker kDrive faire son travail. **La pièce reste dans le
fil** : le versement copie, il ne déplace pas.

- **Catégorie** : liste fermée (`Achat`, `Administratif`, `Armoire`,
  `Documentation`, `Prog`, `Public`, `Vente`) — défaut **« Vente »**, modifiable
  au moment du versement.
- **Doublon** : `trouverDoublon(chantierId, categorie, nom)` répond déjà, avec le
  couple *écraser* / *renommer* de l'outil Documents. Le fil pose la même
  question.
- **Statut** : affiché en clair sur la pièce (« versé · en attente de kDrive »),
  jamais un succès annoncé avant que le fichier soit parti.

---

## 9. Phasage

✅ **Ordre inversé par rapport à la première version du plan** : la trace
d'abord, la conversation ensuite. On voit la valeur en quelques heures au lieu de
deux jours — et si les messages ne servent jamais, on ne les aura pas payés.

| Lot | Contenu | Migration ? | Utilisable à la fin ? |
|---|---|---|---|
| **1** | **La frise d'événements, en LECTURE SEULE** : émis le, publié le, consultations client (`DevisConsultation`), chaîne des révisions. Onglet « Fil », rendu depuis les colonnes **existantes** | **aucune** | **oui**, immédiatement |
| **2** | Schéma + migration + reprise `filId` · messages · poster / modifier / supprimer · reprise de `Devis.note` en premier message | oui | oui |
| **3** | Pièces jointes (collage, glisser, vignettes, téléchargement) + **les deux corrections du §5** | non | oui |
| **4** | Non-lus (table, pastille d'onglet, pastille de barre, colonne d'index) | oui | oui |
| **5** | Versement GED, conditionné à l'affaire | non | oui |

Le **lot 1 est le meilleur rapport valeur/ligne du chantier** : il répond au
défaut n°1 d'`amelioration_devis.md` (« un devis émis se modifie sans rien
dire ») en donnant la trace qui manque, sans poser le verrou, et sans toucher au
schéma.

### 9.1 Les fichiers touchés

- `prisma/schema.prisma` — `MessageDevis`, `LectureFilDevis`, `Devis.filId`,
  `DevisMedia.messageId`.
  ⚠️ **Ne jamais lancer `prisma migrate dev` tout court sur ce dépôt** (index GIN
  du wiki détruit, migration à moitié appliquée) : `--create-only`, retirer les
  deux lignes sur la colonne `recherche`, puis `migrate deploy`.
- `scripts/devis-fil-backfill.mts` — reprise de `filId`.
- `src/tools/devis/model.ts` — types de vue, helpers de droit.
  ⚠️ Les constantes vont **ici**, jamais dans `actions.ts` : un module
  `"use server"` ne peut exporter que des fonctions async.
- `src/tools/devis/queries.ts` — `listerFil`, comptage des non-lus.
- `src/tools/devis/actions.ts` — `posterMessage`, `modifierMessage`,
  `supprimerMessage`, `marquerFilLu`, `verserPieceAuGed` (toutes derrière
  `acteur()`), **plus les deux corrections du §5**, `filId` dans
  `nouvelleRevision` / `dupliquerDevis`.
- `src/tools/devis/fil-devis.tsx` — le volet du fil (client).
- `src/tools/devis/editeur-devis.tsx` / `.css` — le 4ᵉ onglet et sa pastille.
- `src/app/(app)/perso/[qui]/devis/[id]/page.tsx` — chargement du fil.
- `src/tools/devis/index-devis.tsx` — la pastille de non-lus.

### 9.2 Vérification

- `scripts/devis-fil-smoke.mts` (vraie base) : étanchéité entre deux fils · fil
  partagé v1/v2 · duplication vierge · **purge qui épargne les pièces** ·
  **révision qui ne les recopie pas** · garde de chaque action · versement refusé
  sans affaire.
- Le smoke du moteur (`scripts/devis-smoke.mts`) doit rester au vert : ce chantier
  ne touche pas au calcul.
- **Regarder** en prod locale à **1440 / 1280 / 390 px**, onglet Fil ouvert et fermé.
  Les trois pièges du §22.4 n'ont été trouvés que là.

---

## 10. ~~Ce que ce chantier tranche au passage~~ — déjà tranché

Cette section demandait si poser le fil sur la seule nouvelle mise en page
revenait à enterrer l'éditeur historique. **La question ne se pose plus** : la
mise en page a été validée à l'usage le 2026-08-10 et l'éditeur historique a été
supprimé ([`DEVIS.md` §22.7](DEVIS.md)). Il n'y a plus qu'un écran de chiffrage —
donc un seul endroit où poser le fil.


---

## 11. Ce qui a été livré (2026-08-10)

Les cinq lots sont passés, dans l'ordre révisé du §9. Deux migrations écrites à
la main (le diff de Prisma régénère à chaque fois le `DROP INDEX` du tsvector
wiki — vérifié après coup : **l'index GIN est intact**).

| Ce qui existe | Où |
|---|---|
| `Devis.filId`, `MessageDevis`, `LectureFilDevis`, `DevisMedia.messageId` + `verseeLe` | `prisma/schema.prisma`, migrations `…_devis_fil` et `…_devis_fil_versement` |
| Reprise : racine de chaque chaîne par CTE récursive, anciennes notes en premier message | dans la migration, pas un script à part |
| `listerFil`, `compterNonLusFils` | `queries.ts` |
| `posterMessage` · `modifierMessage` · `supprimerMessage` · `epinglerMessage` · `marquerFilLu` · `verserPieceAuGed` | `actions.ts`, toutes derrière `acteur()` |
| Les deux correctifs obligatoires du §5 | `actions.ts` (purge + copie de révision) |
| Le volet : faits + messages, épinglés en tête, pièces jointes, composeur | `fil-devis.tsx` |
| Le 4ᵉ onglet et sa pastille | `editeur-devis.tsx` |
| 19 contrôles sur vraie base | `scripts/devis-fil-smoke.mts` |

### 11.1 Les trois écarts au plan

1. **La reprise est DANS la migration**, pas dans `scripts/devis-fil-backfill.mts`.
   Un script à lancer à la main est un script qu'on oublie sur la machine
   suivante ; une CTE récursive dans le SQL est atomique avec la colonne
   qu'elle remplit. ⚠️ Un `DISTINCT ON (filId, note)` était nécessaire :
   `nouvelleRevision` recopiait la note du parent, donc v1 et v2 portaient le
   même texte — sans dédoublonnage, le fil se serait ouvert sur le même
   paragraphe écrit deux fois.
2. **`Devis.note` a été SUPPRIMÉE**, pas seulement désaffectée. Son texte est
   sauvé dans le même `BEGIN` que le `DROP COLUMN`. Un champ qui existe mais
   qu'il ne faut jamais lire est un piège pour le suivant.
3. **Les faits déduits couvrent plus que prévu** : créé, révision (« depuis la
   v1 »), émis, publié, et chaque consultation client — regroupées au-delà de
   douze, sinon un devis relancé trois fois enterre la conversation. Seuls
   *accepté*, *refusé* et *remis en chiffrage* sont **enregistrés** : ce sont
   les seuls que le modèle ne datait pas.

### 11.2 Deux pièges trouvés à l'écran, pas aux tests

- **L'onglet ne peut pas défiler ET contenir un composeur collé.** Le conteneur
  d'onglets porte `lg:overflow-y-auto` ; le fil lui **prend la main**
  (`overflow-hidden` + flex) et gère son propre défilement. Sans ça la barre de
  totaux était poussée hors de l'écran — le piège n°1 du §22.4 de `DEVIS.md`,
  exactement comme annoncé au §6.2.
- **« Émis au client » s'affichait AVANT « Devis créé ».** `emisLe` est posé
  dans la même seconde que la création sur un devis émis d'un geste :
  l'horloge ne suffit pas à raconter l'ordre. Un rang par genre la départage.
- (Et une régression de mise en page : à 390 px le cycle d'état et les
  pastilles se partageaient une rangée de 390 px — le cycle prend maintenant la
  sienne.)

### 11.3 Vérifié, et comment

- `npx tsx --conditions=react-server scripts/devis-fil-smoke.mts` — **19/19** :
  étanchéité entre deux fils · fil partagé v1/v2 · ordre chronologique ·
  **la purge épargne les pièces de message, binaire compris** · **la copie de
  révision les exclut** · supprimer la v2 n'efface pas la conversation
  (`SetNull`) · non-lus (jamais ouvert / après lecture / ses propres messages).
- `npx tsx scripts/devis-smoke.mts` — **169/169**, le moteur n'a pas bougé.
- **Regardé** en prod locale à 1440 et 390 px : onglet présent, faits déduits
  affichés sans rien avoir écrit, message peint sans rechargement puis retrouvé
  après rechargement, pastille de l'onglet à jour, barre de totaux toujours
  visible, aucun débordement horizontal, aucune erreur console.

### 11.3 bis ⚠️ « Téléversement refusé » — l'id du média se tire CÔTÉ CLIENT

Signalé à la première pièce jointe. La route média n'est pas un simple POST de
fichier : elle est **idempotente par UUID**, et c'est le CLIENT qui fournit cet
UUID (`mediaId` dans le formulaire) — c'est justement ce qui permet de re-tenter
un envoi interrompu sans jamais dupliquer. Elle répond `{ ok: true }`, **pas
l'id** : le connaître d'avance est le principe.

Le composeur, lui, envoyait `file` + `devisId` et attendait un `{ id }` en
retour. Il recevait donc un **400 « Identifiants invalides »**, affiché
« Téléversement refusé ».

Le geste juste est celui de `texte-riche-impl.tsx`, qui consomme la même route
depuis le début : `crypto.randomUUID()` avant l'envoi, l'id posé dans le
formulaire, et il sert ensuite de clé pour rattacher la pièce au message. Le
message d'erreur remonte maintenant celui de la route au lieu d'un libellé
maison — un « refusé » sans motif ne se diagnostique pas.

Vérifié en navigateur, de bout en bout : pièce acceptée · message et pièce
retrouvés après rechargement · **le binaire se sert vraiment**
(`naturalWidth > 0`, donc pas un 404 déguisé) · `messageId` renseigné en base,
donc la pièce est bien épargnée par la purge.

### 11.4 Ce qui n'a pas été fait

- **La colonne de non-lus sur l'index** (`compterNonLusFils` existe et est
  testée ; l'index ne l'appelle pas encore). L'onglet, lui, porte sa pastille.
- **Le choix de la catégorie au versement** : c'est « Vente » d'office. La
  question *écraser / renommer* d'un doublon, elle, est bien posée — par une
  `window.confirm`, à remplacer par la boîte de dialogue de la maison.
- **Les mentions, l'e-mail, la réponse du client** : hors périmètre, §3.3.
