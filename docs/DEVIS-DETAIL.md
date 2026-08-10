# Devis — le détail d'une ligne, et l'ensemble qu'on ne détaille pas

> **État : plan validé, rien n'est écrit.** Cadré le 2026-08-10 à partir de deux
> usages réels signalés par leurs auteurs.
>
> Doc de l'outil : [`DEVIS.md`](DEVIS.md) · défauts connus :
> [`amelioration_devis.md`](amelioration_devis.md).

---

## 1. Les deux besoins

**A. « Fabrication armoire électrique ».** Celui qui chiffre l'armoire ajoute
toujours un détail sous sa ligne — *2× départ pour pompe, 4× pilotage V3V, 1×
pompe de relevage*. Ce détail **n'est pas exhaustif** et **ne correspond pas à du
matériel** : ce sont des unités fonctionnelles, pas des articles. Il part chez le
client : c'est lui qui justifie le prix.

**B. « Ensemble de matériel Distech ».** Celui qui chiffre la fourniture ne veut
**pas montrer le détail au client**. Mais quand l'affaire passe en commande,
**le détail est exactement ce dont on a besoin**.

C'est la même question vue des deux côtés — *une ligne qui a un dedans, et à qui
on le montre* — mais le « dedans » n'est pas de même nature : d'un côté une
**description** qu'aucun référentiel ne connaît, de l'autre du **matériel réel**
que le Magasin connaît par cœur. D'où deux réponses.

---

## 2. Ce que le code fait aujourd'hui — vérifié

### 2.1 Pour le détail (A)

Une **ligne `TEXTE`** posée sous la prestation fait le travail : document riche,
liste à puces, rendue pleine largeur sous la ligne. Coût nul.

Trois limites : elle **flotte** (un glisser-déposer la sépare de sa prestation),
elle **ne revient jamais toute seule** au devis suivant, et surtout —

⚠️ **`LigneDevis.note` n'est imprimé nulle part.** Le champ qui semblerait fait
pour ça n'est affiché ni dans le document client (`document-devis.tsx` ne rend
que `l.designation` et `lot.note`), ni dans le nouvel éditeur. Il est pourtant
**renvoyé par `getDevisPublic`** — non rendu, donc sans fuite réelle aujourd'hui,
mais contre la doctrine du §21.3 (*un champ absent de la réponse ne peut pas
fuir*).

### 2.2 Pour l'ensemble (B) — le contournement actuel abîme la marge

Une ligne `LIBRE` « Ensemble de matériel Distech » à 12 400 € tapés à la main
n'a **aucun déboursé** : `ajouterLigneLibre` force `debourseCents: null`.

Conséquence mesurable dans `calculerDevis` : ce montant sort **du déboursé et du
vendu-fourniture à la fois** — la marge affichée ne parle plus de cette partie du
devis. Et **rien ne le signale** : `nbSansPrix` ne compte que les lignes de genre
`PRODUIT`.

On peut sauver la marge en tapant le déboursé à la main (`majLigne` l'accepte sur
n'importe quel genre). Mais c'est un nombre recopié, qui ne saura jamais qu'un
prix a bougé, et le détail n'existe alors **nulle part** pour la commande.

---

## 3. Réponse A — `LigneDevis.detail`, un champ texte

```prisma
model LigneDevis {
  // …
  /// Le détail imprimé SOUS la désignation, chez le client : une ligne de
  /// saisie = une puce. Volontairement du TEXTE — ce qu'il décrit n'est ni
  /// exhaustif ni modélisable (« 2× départ pour pompe » n'est pas un article).
  detail String @default("")
}

model Prestation {
  // …
  /// Le détail TYPE de cette prestation, recopié à l'ajout d'une ligne puis
  /// libre d'être corrigé. Le référentiel PROPOSE, il ne pilote pas (§2.1).
  detailModele String @default("")
}
```

### 3.1 Pourquoi du texte et pas des sous-lignes structurées

Les deux mots de l'énoncé commandent la réponse : **non exhaustif** et **pas
forcément du matériel**. Tout ce qui est structuré appelle un total — et un total
sur un détail non exhaustif est un **total faux**, affiché avec l'autorité d'un
calcul. La doctrine de l'outil dit exactement l'inverse (§2.3) : *ce qu'on ne
sait pas chiffrer est dit à voix haute, pas compté*.

Le jour où l'on voudrait vraiment compter les départs de pompe d'un devis, ce
sera un modèle de sous-lignes — mais ce sera un autre besoin, avec sa raison.

### 3.2 La symétrie qui évite un interrupteur

| Champ | Pour qui | État |
|---|---|---|
| `LigneDevis.note` | **interne** | existe, jamais imprimé |
| `LigneDevis.detail` | **client** | à ajouter |

Un champ par destinataire, **aucun drapeau de visibilité à se tromper**. Au
passage, `note` mérite d'être enfin affiché dans l'éditeur v2 (sous la
désignation, en petit) : c'est le pendant interne du détail, et il ne sert à rien
tant qu'on ne le voit pas.

### 3.3 Le référentiel

`ajouterLignePrestation` recopie `Prestation.detailModele` dans
`LigneDevis.detail`. Ensuite, plus aucun lien : corriger le modèle ne touche pas
les devis déjà faits, corriger un devis ne touche pas le modèle. C'est le
principe n°1 appliqué tel quel — **le devis fige, le référentiel vit**.

L'écran des référentiels (`referentiels-devis.tsx`) gagne une zone de texte par
prestation.

### 3.4 Le rendu

- **Éditeur** : une zone de texte sous la désignation, dans la même cellule
  (colonne `designation`, déjà `souple` et `retourLigne`). Repliée tant qu'elle
  est vide, ouverte par « + détail ».
- **Document client** : une `<ul>` en petit corps sous la désignation, dans la
  cellule `.des`. ⚠️ `.des` n'a pas de `white-space: pre-wrap` — un texte
  multiligne s'y écraserait en un seul paragraphe : c'est bien une liste de
  `<li>` qu'il faut produire, pas un `\n` laissé au CSS.
- La règle `break-inside: avoid` sur la rangée existe déjà : le détail ne sera
  jamais coupé de sa ligne par un saut de page.

---

## 4. Réponse B — le **lot condensé**

```prisma
model LotDevis {
  // …
  /// Ce que le CLIENT voit de ce lot : "DETAILLE" (défaut) ou "CONDENSE".
  /// Une chaîne validée dans l'action et non un enum Postgres — même choix que
  /// CoefVente.portee : la migration reste triviale et le vocabulaire peut
  /// grandir (un « détaillé sans prix unitaires » viendra peut-être un jour).
  rendu        String @default("DETAILLE")
  /// Le libellé imprimé quand le lot est condensé. Vide = le titre du lot.
  /// « Matériel Distech » en interne, « Ensemble de matériel Distech » chez le
  /// client : ce n'est pas la même phrase, et ce n'est pas le même public.
  libelleClient String @default("")
}
```

### 4.1 Ce que ça préserve — c'est tout l'argument

En interne, le lot garde ses **vraies lignes de devis** : vrais produits, vrai
déboursé, vraie cascade de coefficient, vraie alerte de fraîcheur contre le
magasin, vraies remises, vraies options, vraie marge. **Le moteur ne change
pas** — `calculerDevis` n'est pas touché, et son smoke reste vert.

Une ligne « kit » à sous-composants aurait dû ré-implémenter, un par un, tout ce
qu'une ligne sait déjà faire : le coefficient en cascade, la fraîcheur, les
associations de produits, le rafraîchissement, la duplication, l'option, la
remise, la reprise de BOM. Le lot, lui, **existe déjà** — il a un titre, une
note, un ordre, et un sous-total que le moteur calcule.

**Le coût réel : un champ et une fonction pure.**

### 4.2 La condensation, une seule fonction

`condenserLots()` dans `model.ts` (pure, testable) remplace les lignes d'un lot
`CONDENSE` par **une ligne de synthèse** :

| Champ | Valeur |
|---|---|
| `designation` | `libelleClient` ou, à défaut, le titre du lot |
| `quantiteMillieme` | `1000` |
| `unite` | `"ens"` |
| `pvUnitaireCents` | le **sous-total du lot** |
| `remisePourMille` | `0` — les remises de ligne sont déjà dans le sous-total |
| `genre` | `LIBRE` (donc « chiffrée » : `documentVide()` continue de dire vrai) |

**Deux appelants, deux rôles différents** :

1. **`getDevisPublic`** l'applique **dans la requête** et ne renvoie jamais les
   lignes réelles. C'est la garde (§21.3) : *un détail absent de la réponse ne
   peut pas fuir par distraction.*
2. **L'aperçu interne** l'applique **au rendu**, parce qu'il travaille sur le
   devis complet et doit pouvoir montrer les deux versions.

### 4.3 La note du lot devient la description de l'ensemble

`lot.note` est déjà imprimée sous le titre du lot. Sur un lot condensé, c'est
**exactement le pendant du détail d'une ligne** : « Ensemble comprenant
l'automate, ses modules d'extension et les sondes de gaine ». Elle mérite donc le
même rendu à puces, une ligne de saisie = une puce — **une seule mécanique
d'affichage pour les deux besoins de ce document**.

---

## 5. Où ça se règle : « Sur le document », et nulle part ailleurs

Le pavé **« Sur le document »** de l'onglet *Publier* porte déjà les trois
interrupteurs qui décident de ce que le client lit :

- Prix unitaires par ligne
- Sous-totaux par lot
- Options en fin de document

**C'est là que le pliage des lots se règle aussi.** Une quatrième entrée, dans le
même pavé : la **liste des lots et leur rendu**, avec le libellé client à côté.

```
Sur le document
  ☑ Prix unitaires par ligne
  ☑ Sous-totaux par lot
  ☑ Options en fin de document
  ─────────────────────────────────────────
  Détail des lots
    Matériel Distech      ○ détaillé  ● condensé
      → « Ensemble de matériel Distech »
    Prestations           ● détaillé  ○ condensé
```

Trois raisons de ne pas le mettre ailleurs :

1. **Une seule question, une seule page.** « Qu'est-ce que le client voit ? » se
   pose une fois, avant d'envoyer. Un réglage caché dans l'entête de chaque lot
   obligerait à faire le tour du devis pour répondre.
2. **On voit d'un coup ce qui est plié.** Un lot condensé oublié est
   exactement le genre de chose qui ne se remarque qu'après l'envoi.
3. **C'est déjà le vocabulaire du pavé** — ces interrupteurs disent tous ce qu'on
   montre et ce qu'on retient.

Un **badge « condensé »** reste posé sur l'entête du lot et dans le rail des lots
— pas un réglage, un rappel : on compose une ligne dans un lot dont le client ne
verra pas le détail, il faut le savoir sans changer d'onglet. ⚠️ Ce n'est pas un
second interrupteur : un réglage à deux endroits finit toujours par diverger.

### 5.1 Le bordereau interne : le même document, deux tirages

Pas de second document. `/perso/{qui}/devis/{id}/apercu` gagne un interrupteur
**« Voir le détail des lots condensés »** (`?detail=1`, lu côté serveur — aucun
état client à tenir). Le bouton « Imprimer / PDF » existant tire ce qui est à
l'écran : **le bordereau, c'est l'aperçu avec l'interrupteur allumé.**

⚠️ **Celui-là n'est pas dans « Sur le document », et c'est délibéré.** Les trois
interrupteurs du pavé sont **persistés sur le devis** : ils décrivent le document
du client. Un quatrième réglage persisté « montrer le détail » serait à un clic
de tout dévoiler au client, sans que rien ne le rattrape — le lien public sert le
devis vivant. L'interrupteur de l'aperçu, lui, **ne vit que le temps d'une URL**
et ne peut rien laisser derrière lui.

Trois règles, dans cet ordre :

1. **Le défaut reste l'aperçu CLIENT** (interrupteur éteint). Cet écran s'appelle
   « Aperçu client » et sert à relire avant d'envoyer : s'il montrait le détail
   par défaut, on croirait que le client le voit.
2. **La vue interne le DIT, et la mention s'imprime.** Un bandeau « Vue interne —
   le client ne voit pas le détail des lots condensés » en tête du document.
   ⚠️ Il doit être **à l'intérieur** de `.print-root`, sinon le patron
   d'impression global le masque (§21.6) et le papier ne se distingue plus de
   celui du client.
3. **La page publique n'a pas cet interrupteur, et ne pourrait pas l'avoir** :
   `getDevisPublic` ne renvoie pas le détail. Un `?detail=1` sur `/d/{jeton}` ne
   change rien — il n'y a rien à révéler.

Ce que ça ne fait pas : verser le matériel dans l'affaire, réserver du stock,
exporter en CSV. Ces trois-là restent au chaud dans
[`amelioration_devis.md`](amelioration_devis.md) §3.

---

## 6. Les pièges — tous silencieux

1. ⚠️ **Un lot condensé doit toujours montrer son montant.** Deux cas : si les
   prix de ligne sont affichés, la ligne de synthèse le porte ; si
   `montrerPrixUnitaires` est décoché, **il faut le sous-total** — sinon le
   client reçoit « Ensemble de matériel Distech » sans un chiffre. Et
   `avecSousTotaux` exige aujourd'hui en plus `lots.length > 1`.
2. ⚠️ **Ne pas imprimer les deux.** Quand la ligne de synthèse porte déjà le
   montant, une ligne de sous-total sous elle répète le même nombre à deux
   centimètres d'écart.
3. ⚠️ **Une option dans un lot condensé ressort nommément** dans « Options non
   comprises » : le détail fuit par là. C'est même juste (une option est une
   proposition, le client doit la lire) — mais **l'éditeur doit le dire au
   moment où l'on coche « option »** dans un lot condensé.
4. ⚠️ **Les lignes `TEXTE` d'un lot condensé disparaissent** du document client :
   elles font partie du détail. Ce qui doit être lu par le client se met dans la
   **note du lot**.
5. ⚠️ **La révision et la duplication recopient champ par champ** (`nouvelleRevision`,
   `dupliquerDevis`, `dupliquerLigne`) : `detail`, `rendu` et `libelleClient`
   doivent être ajoutés aux trois listes. Un oubli ne casse rien — il perd
   simplement le détail et **découvre le lot au client** à la révision suivante.
6. ⚠️ **`getDevisPublic` renvoie `note`** sans que rien ne l'affiche. En posant
   `detail` (qui, lui, part chez le client), retirer `note` de la réponse : les
   deux champs se ressemblent trop pour laisser l'ambiguïté en place.
7. ⚠️ **La migration** : `prisma migrate dev --create-only`, retirer les deux
   lignes que le diff régénère sur la colonne `recherche` du wiki, puis
   `migrate deploy`. Et `npm run db:generate` + redémarrage du serveur.

---

## 7. Ce qui est touché

| Fichier | Ce qu'il gagne |
|---|---|
| `prisma/schema.prisma` | `LigneDevis.detail`, `Prestation.detailModele`, `LotDevis.rendu`, `LotDevis.libelleClient` |
| `src/tools/devis/model.ts` | `puces(texte)` (rendu commun détail/note de lot), `condenserLots()`, types de vue |
| `src/tools/devis/queries.ts` | `detail` dans `getDevis` · **condensation + retrait de `note`** dans `getDevisPublic` |
| `src/tools/devis/actions.ts` | `detail` dans `majLigne` · copie du `detailModele` à l'ajout d'une prestation · `majLot({rendu, libelleClient})` · les **trois listes de recopie** |
| `src/tools/devis/document-devis.tsx` `.css` | la liste à puces sous la désignation · la ligne de synthèse · le bandeau « vue interne » |
| `src/tools/devis/publication-devis.tsx` | **« Détail des lots » dans le pavé « Sur le document »** — le réglage vit là, et seulement là |
| `src/tools/devis/editeur-devis-v2.tsx` | la zone « détail » sous la désignation · le badge « condensé » (rappel, pas réglage) sur l'entête de lot et dans le rail · l'avertissement de l'option |
| `src/tools/devis/referentiels-devis.tsx` | le détail type par prestation |
| `.../devis/[id]/apercu/page.tsx` | l'interrupteur `?detail=1` |

---

## 8. Phasage

| Lot | Contenu | Utilisable à la fin ? |
|---|---|---|
| **1** | `LigneDevis.detail` : saisie dans l'éditeur, puces chez le client | **oui** — répond seul au besoin A |
| **2** | `Prestation.detailModele` + l'écran de référentiel | oui |
| **3** | Le lot condensé : champs, `condenserLots()`, garde dans `getDevisPublic`, **réglage dans « Sur le document »** + badge de rappel dans l'éditeur | **oui** — répond au besoin B côté client |
| **4** | L'aperçu à interrupteur = le bordereau interne | oui |

### 8.1 Vérification

- `npx tsx scripts/devis-smoke.mts` — **doit rester vert sans modification** :
  c'est la preuve que le moteur n'a pas bougé.
- Nouveaux contrôles sur `condenserLots()` : le sous-total est conservé au
  centime, les options en sortent, les lignes `TEXTE` sont absorbées, un lot
  détaillé n'est pas touché.
- `npx tsx scripts/devis-restitution-smoke.mts` étendu d'un **test de fuite** :
  la réponse de `getDevisPublic` ne doit contenir **aucune** désignation d'un lot
  condensé (`JSON.stringify(payload)` ne contient pas « ECY-S1000 »). C'est le
  seul contrôle qui vaille — le reste est de l'affichage.
- **Regarder** : `npx tsx scripts/devis-document-apercu.mts` (écran, téléphone,
  PDF), avec un devis portant un détail long et un lot condensé. La leçon du
  §21.9 vaut ici mot pour mot — trois défauts réels y étaient invisibles aux
  contrôles fonctionnels.

---

## 9. Ce qu'on ne fait pas, et pourquoi

- **Des sous-lignes chiffrantes** — voir §3.1 : elles fabriqueraient un total sur
  un détail non exhaustif.
- **Une ligne « kit »** — voir §4.1 : elle réécrirait tout ce qu'une ligne sait
  déjà faire.
- **Deux devis (un interne, un client)** — la duplication existe et ne coûterait
  rien à écrire, mais rien ne garantirait qu'ils restent d'accord. Un devis qui
  ment sur le prix qu'on a envoyé est pire que pas de bordereau du tout.
- **Le versement dans le matériel de l'affaire** — c'est le défaut n°3, il a sa
  propre décision à prendre (verser des lignes, ou poser une réservation).
