# Devis — le bloc : ce qu'on chiffre, et ce que le client lit

> **État : LIVRÉ le 2026-08-12.** Cadré le 2026-08-10, réécrit le 2026-08-12
> après relecture d'Augustin, puis implémenté. Ce qui a été écrit et ce qui a
> été trouvé en le regardant : **[§13](#13-ce-qui-a-été-livré)**.
>
> Doc de l'outil : [`DEVIS.md`](DEVIS.md) · défauts connus :
> [`amelioration_devis.md`](amelioration_devis.md) · le fil :
> [`DEVIS-FIL.md`](DEVIS-FIL.md).

> **Ce que cette version corrige.** La première rédaction voyait **deux** besoins
> et proposait **deux** mécanismes : un champ `detail` sur la ligne pour l'un, un
> lot condensé pour l'autre. C'était faux, et c'est Augustin qui l'a vu : *« pour
> moi il n'y a pas de différence entre les 2 collègues »*. Celui qui chiffre
> l'armoire **cache** lui aussi son chiffrage — le client ne voit pas ses heures
> de câblage à 62 € ; celui qui chiffre le Distech **ajoute** lui aussi du texte
> — « COMPRIS DISTECH + PROGRAMMATION + SUPERVISION » n'est rien d'autre que
> « 2× départ pour pompe, 4× pilotage V3V » écrit en ligne au lieu d'être écrit
> en liste. Un seul besoin, un seul mécanisme. `LigneDevis.detail` et
> `Prestation.detailModele` sont **abandonnés** (§12).

---

## 1. Le besoin

Deux collègues, le même geste.

**L'armoire.** Le client lit « FABRICATION ARMOIRE ÉLECTRIQUE », suivi d'un
détail — *2× départ pour pompe, 4× pilotage V3V, 1× pompe de relevage*. Ce
détail **n'est pas exhaustif** et **ne correspond pas à du matériel** : ce sont
des unités fonctionnelles. Derrière, le chiffrage réel — des heures de câblage,
un coffret, de l'appareillage — que le client ne voit pas.

**La régulation.** Le client lit « DÉPOSE DE L'ANCIENNE RÉGULATION, POSE,
RACCORDEMENT DE LA NOUVELLE RÉGULATION ET CONTRÔLE DES POINTS — COMPRIS DISTECH
+ PROGRAMMATION + SUPERVISION ». Derrière : un ECY-S1000, trois extensions, une
alimentation, 30 h de programmation, 12 h de mise en service. Rien de tout cela
ne s'imprime — **mais quand l'affaire passe en commande, c'est exactement ce
dont on a besoin.**

D'où la forme commune : **un bloc a deux faces.**

```
┌─ CE QU'ON CHIFFRE ─────────────┐   ┌─ CE QUE LE CLIENT LIT ────────────┐
│  des lignes réelles            │   │  une désignation                  │
│  produits + heures             │ → │  une description non exhaustive   │
│  déboursé, coefficient, marge  │   │  un prix                          │
└────────────────────────────────┘   └───────────────────────────────────┘
        jamais imprimé                      écrit à la main
```

Un devis est **une pile de blocs**, chacun détaillé ou forfaitaire. **Le mélange
est le cas normal**, pas l'exception — c'est ce qui commande toute la partie
écran (§5).

---

## 2. Ce que le code fait aujourd'hui — vérifié le 2026-08-12

### 2.1 La base, telle qu'elle est

```
PRESTATIONS (6) — toutes au TEMPS, aucune « fabrication armoire »
  [Atelier]         Câblage armoire ......... 62,00 €/h
  [Bureau d'études] Étude & synoptique ...... 68,00 €/h
  [Bureau d'études] Programmation automate .. 74,00 €/h
  [Bureau d'études] Formation .............. 480,00 €/j
  [Terrain]         Mise en service ......... 79,00 €/h
  [Terrain]         Déplacement .............. 95,00 € forfait

LIGNES   PRESTATION=14   PRODUIT=13   LIBRE=2   TEXTE=2
  AUTOMATE DISTECH ECY-S1000-C50 ... deb 1 494,00 → pv 1 867,50  (produitId ✓)
  EXTENSION DISTECH 4UI4UO ......... deb   243,00 → pv   303,75  (produitId ✓)

4 devis · 8 lots · lignes portant une note : 0
```

Trois enseignements. Le matériel Distech est **déjà chiffré proprement** (vraies
lignes, vrai déboursé, `produitId` renseigné) — il ne manque que le fait de ne
pas l'imprimer. Le terrain est **neuf** : 4 devis, aucune donnée à ménager. Et
`LigneDevis.note` n'est utilisé par personne.

### 2.2 `LotDevis.note` fait déjà la moitié du travail

Le champ **existe**, il est **imprimé** sous le titre du lot
(`document-devis.tsx:137`), il est **recopié** par la révision et la duplication
(`actions.ts:431`, `actions.ts:547`). C'est déjà la « description client ».

Il lui manque deux choses :

1. ⚠️ **Aucun écran ne l'écrit.** `majLot` accepte `{titre, note}`
   (`actions.ts:616`) mais l'éditeur ne l'appelle qu'avec `titre`
   (`editeur-devis.tsx:1396`). Manque déjà consigné en
   [`DEVIS.md` §22.8](DEVIS.md).
2. Il s'imprime en **un seul `<p>`** : une saisie sur plusieurs lignes s'écrase
   en un paragraphe. `.lot-note` n'a pas de `white-space` (`document-devis.css:174`).

### 2.3 Le contournement actuel abîme la marge, en silence

Pour obtenir le document voulu aujourd'hui, on tape une ligne `LIBRE` au
forfait. `ajouterLigneLibre` force `debourseCents: null` (`actions.ts:967`).

Conséquence mesurable dans `calculerDevis` : le montant sort **du déboursé et du
vendu-fourniture à la fois** — la marge affichée ne parle plus de cette partie du
devis. Et **rien ne le signale** : `nbSansPrix` ne compte que les lignes
`PRODUIT` (`model.ts:627`).

**C'est le gain chiffrable de tout ce chantier** : même document chez le client,
marge juste chez nous.

---

## 3. Le modèle — le bloc, c'est le LOT

```prisma
model LotDevis {
  id      String @id @default(cuid())
  devisId String
  titre   String            // le nom INTERNE, celui du rail
  ordre   Float

  /// La description non exhaustive, imprimée sous la désignation. EXISTE DÉJÀ.
  /// « 2× départ pour pompe / 4× pilotage V3V ». Une ligne saisie = une puce.
  note    String @default("")

  // --- À AJOUTER ------------------------------------------------------------
  /// Ce que le CLIENT voit de ce bloc : "DETAILLE" (défaut) ou "CONDENSE".
  /// Chaîne validée dans l'action et non un enum Postgres — même choix que
  /// CoefVente.portee : la migration reste triviale et le vocabulaire peut
  /// grandir (un « détaillé sans prix unitaires » viendra peut-être un jour).
  rendu         String @default("DETAILLE")
  /// La désignation que le client LIT quand le bloc est condensé. Vide = le
  /// titre du lot. ⚠️ Ce n'est PAS un titre : c'est un paragraphe, écrit pour
  /// le client, souvent en capitales, parfois sur plusieurs lignes.
  libelleClient String @default("")
}
```

**Deux champs. C'est tout le modèle.**

### 3.1 Pourquoi pas un troisième niveau

La tentation serait *Lot ▸ Groupe ▸ Ligne*, pour garder « Chaufferie » comme
chapitre et y loger des forfaits. Ça coûte un modèle, un ordre, un
glisser-déposer qui traverse deux niveaux, trois listes de recopie et un rendu de
document — pour arriver **exactement au même papier**.

Le lot fait déjà tout : titre, note, ordre, et un sous-total que le moteur
calcule. Ce qui change, c'est le mot : **un lot n'est plus un chapitre, c'est un
bloc du client.** Cinq forfaits = cinq lots. À 8 lots pour 4 devis, ça ne coûte
rien.

### 3.2 Pourquoi pas une ligne « kit » à sous-composants

Elle devrait ré-implémenter, un par un, tout ce qu'une ligne sait déjà faire :
coefficient en cascade, fraîcheur contre le magasin, associations de produits,
rafraîchissement, duplication, option, remise, reprise de BOM.

Et surtout : **un kit de produits ne sait pas porter 30 h de programmation.** Un
bloc mélange fourniture et main d'œuvre — le lot les additionne déjà.

### 3.3 Tout ou rien

Aucune case « masquer cette ligne » à cocher ligne par ligne. Si une ligne doit
être vue du client, **elle n'est pas dans ce bloc** — on la sort, et c'est un
geste visible, pas une case oubliée. Un drapeau de visibilité par ligne est
exactement le genre de réglage dont on découvre l'état après l'envoi.

---

## 4. `condenserLots()` — une fonction, un sens de lecture

```ts
/** Les lignes telles que le CLIENT doit les recevoir : chaque bloc CONDENSE y
 *  est remplacé par sa ligne de synthèse, ses options laissées telles quelles. */
export function condenserLots(
  entete: OptionsCalcul,
  lots: LotDevisVue[],
  lignes: LigneDevisVue[],
): LignesPourClient;
```

Pure, testable, **en amont du moteur** : elle prend et rend des `LigneDevisVue`,
c'est-à-dire l'entrée de `calculerDevis`. Pour chaque lot condensé : elle calcule
le sous-total (hors options), retire ses lignes non-option, **garde ses options
telles quelles** et insère la ligne de synthèse.

### 4.1 La ligne de synthèse

| Champ | Valeur |
|---|---|
| `id` | `synth-${lot.id}` — stable, sans collision possible avec un cuid |
| `lotId` | le lot, pour qu'elle atterrisse dans le bon groupe |
| `genre` | `LIBRE` — donc « chiffrée » (`ligneChiffree` = `genre !== "TEXTE"`), et `documentVide()` continue de dire vrai |
| `designation` | `libelleClient` ou, à défaut, le titre du lot |
| `quantiteMillieme` | `1000` |
| `unite` | `"forfait"` |
| `pvUnitaireCents` | le **sous-total du lot**, hors options |
| `remisePourMille` | `0` — les remises de ligne sont déjà dans le sous-total |
| `debourseCents`, `coefMillieme`, `contenu` | `null` |
| `option`, `note` | `false`, `""` |

Aucune dérive d'arrondi : à quantité 1000 et remise nulle, `calculerLigne` rend
`brut = pv` au centime.

### 4.2 L'invariant qui vaut tous les tests d'affichage

```
calculerDevis(condensé).totalHtCents  === calculerDevis(original).totalHtCents
calculerDevis(condensé).optionsCents  === calculerDevis(original).optionsCents
```

Si ça tient, le client reçoit le bon prix. Le reste est de la mise en page.

### 4.3 ⚠️ Le tableau condensé est du poison pour tout chiffre interne

La ligne de synthèse est `LIBRE` sans déboursé : elle reproduit **exactement** le
défaut décrit au §2.3. C'est sans conséquence tant qu'elle ne sert que le
document client — mais rien n'empêcherait, un jour, de la passer à la barre de
totaux.

Donc le type de retour est **marqué**, et le compilateur refuse la confusion :

```ts
declare const pourClient: unique symbol;
export type LignesPourClient = LigneDevisVue[] & { readonly [pourClient]: true };
```

Deux lignes, et l'erreur devient impossible à commettre par distraction. Même
esprit que la garde du [§21.3](DEVIS.md).

### 4.4 Deux appelants, un seul chemin

1. **`getDevisPublic`** condense **dans la requête** et ne renvoie jamais les
   lignes réelles. C'est la garde : *un détail absent de la réponse ne peut pas
   fuir.*
2. **L'aperçu interne** condense **par défaut** aussi (§7) — il travaille sur le
   devis complet, mais montre d'abord ce que le client voit.

Les deux passent le **même** tableau à `DocumentDevis`, qui ne sait rien de tout
ceci.

---

## 5. L'éditeur — on dessine le bloc

C'est la partie qui décide de l'adoption. Le mélange étant le cas normal, rien ne
doit laisser croire qu'on chiffre dans un bloc détaillé quand on est dans un
forfait.

```
   Désignation                          Qté   Déboursé   Coef      PV      Total
  ──────────────────────────────────────────────────────────────────────────────
  ▾ ● CHAUFFERIE               ▣ forfait   5 lignes                     12 400,00
  ┃  ┌ CE QUE LE CLIENT LIRA ────────────────────────────────────────────────┐
  ┃  │ DÉPOSE DE L'ANCIENNE RÉGULATION, POSE, RACCORDEMENT DE LA NOUVELLE    │
  ┃  │ RÉGULATION ET CONTRÔLE DES POINTS — COMPRIS DISTECH + PROGRAMMATION   │
  ┃  │ + SUPERVISION                                                         │
  ┃  │ · 2× départ pour pompe  · 4× pilotage V3V  · 1× pompe de relevage     │
  ┃  └───────────────────────────────── il verra UNE ligne à 12 400,00 HT ───┘
  ┃    AUTOMATE DISTECH ECY-S1000-C50   1    1 494,00  ×1,25  1 867,50  1 867,50
  ┃    EXTENSION DISTECH 4UI4UO         3      243,00  ×1,25    303,75    911,25
  ┃    Alimentation 24 V 5 A            1       78,00  ×1,25     97,50     97,50
  ┃    Programmation automate          30 h         —      —     74,00  2 220,00
  ┃    Mise en service                 12 h         —      —     79,00    948,00
  ──────────────────────────────────────────────────────────────────────────────
  ▾ ● ÉQUIPEMENTS DE TERRAIN       détaillé   3 lignes                   1 250,00
       Sonde extérieure                2       45,00  ×1,25     56,25    112,50
       Compteur d'énergie              1      380,00  ×1,25    475,00    475,00
       Vanne 3 voies DN40              1      530,00  ×1,25    662,50    662,50
```

Trois signes, et ils suffisent :

**Le filet vertical** `┃` court le long d'un bloc forfait : *tout ce qui est à
droite de ce trait deviendra une ligne*. Un bloc détaillé n'en a pas, ses lignes
touchent le bord comme aujourd'hui.

**Le cartouche « ce que le client lira »** est posé **en tête du bloc, dans le
tableau** — pas dans un onglet, pas dans un panneau. C'est là qu'on écrit la
désignation et la description, c'est là qu'on les relit, et il porte son propre
rappel : *il verra UNE ligne à 12 400,00 HT*. On ne peut plus chiffrer dans un
forfait sans avoir la phrase du client sous les yeux.

**Le badge** `▣ forfait` / `détaillé` sur l'entête de lot (`tr.ed-lot`,
`editeur-devis.tsx:1376` — la rangée pleine largeur existe déjà et porte déjà
chevron, puce, titre, compteur, sous-total et actions), repris à l'identique dans
le rail des lots, qui devient la table des matières du client :

```
  ▣ Chaufferie ............. forfait    12 400,00
  ▣ Fabrication armoire .... forfait     8 500,00
  ▢ Équipements terrain .... détaillé    1 250,00
  ▢ Prestations diverses ... détaillé    1 900,00
```

### 5.1 Le geste qui rend la chose utilisable

Le vrai risque n'est pas la lisibilité, c'est le **coût d'entrée** : créer un
lot, le nommer, le passer en forfait, écrire la phrase, puis seulement chiffrer,
ça fait quatre gestes avant de commencer — et un outil qu'on contourne ne sert à
rien.

Donc **deux boutons** là où il n'y a que « Nouveau lot » aujourd'hui :

```
   + Nouveau lot          + Nouveau forfait
```

« Nouveau forfait » crée le bloc **déjà en `CONDENSE`**, curseur dans la
désignation client. Un geste.

### 5.2 Où se règle quoi

Le rendu se **décide sur le bloc**, dans l'éditeur, là où on travaille.

Le pavé « Sur le document » de l'onglet *Publier* garde une **récapitulation** —
les blocs et ce que le client voit de chacun, cliquable pour y aller, et
basculable sur place. Ce n'est pas un second réglage : c'est le **même champ**,
et c'est la dernière relecture avant d'envoyer. Un bloc resté détaillé par oubli
est exactement ce qui ne se remarque qu'après le mail.

```
Sur le document
  ☑ Prix unitaires par ligne
  ☑ Sous-totaux par lot
  ☑ Options en fin de document
  ─────────────────────────────────────────
  Ce que le client voit de chaque bloc
    Chaufferie             ○ détaillé  ● forfait
      → « DÉPOSE DE L'ANCIENNE RÉGULATION, POSE, … »
    Équipements terrain    ● détaillé  ○ forfait
```

### 5.3 ⚠️ L'option perce le bloc

Cocher « option » sur une ligne d'un bloc forfait la fait **ressortir nommément**
dans « Options non comprises » en fin de document — le détail fuit par là. C'est
même juste (une option est une proposition, le client doit la lire), mais
l'éditeur doit le dire **au moment du clic**, pas après.

---

## 6. Le document client

Pour chaque bloc condensé, une seule rangée :

```
 Désignation                                        Qté  Unité    Total HT
 DÉPOSE DE L'ANCIENNE RÉGULATION, POSE, RACCORDE-     1  forfait  12 400,00
 MENT DE LA NOUVELLE RÉGULATION ET CONTRÔLE DES
 POINTS — COMPRIS DISTECH + PROGRAMMATION + SUPERVISION
   · 2× départ pour pompe
   · 4× pilotage V3V
   · 1× pompe de relevage
```

Quatre règles, chacune parant un défaut réel :

**a. Jamais le titre du lot ET la ligne de synthèse.** Le document imprime
aujourd'hui le titre en bandeau doré au-dessus des lignes
(`document-devis.tsx:136`). Le client lirait « Chaufferie » puis, juste dessous,
le paragraphe qui dit la même chose. **La phrase remplace le bandeau.**

**b. Le prix s'affiche toujours sur la ligne de synthèse** — même si
« prix unitaires par ligne » est décoché, même sur un devis d'un seul lot (où
`avecSousTotaux` est faux par construction, `model.ts:1126`). Décocher les prix
unitaires veut dire *« pas le prix de chaque article »* ; un bloc condensé n'a
pas d'articles, **sa ligne EST son prix**. Sans cette règle, le client reçoit une
phrase et aucun chiffre. Corollaire : jamais de `tfoot` de sous-total sous une
ligne de synthèse — ce serait le même nombre à deux centimètres.

La décision appartient donc au **bloc**, pas à la ligne : `LotDevisVue` porte
`rendu`, `LotDocument` porte `condense`, et `TableLignes` en déduit tout.

**c. La description en puces, une ligne saisie = une puce.** ⚠️ Ni `.lot-note`
ni `td.des` n'ont de `white-space: pre-wrap` (`document-devis.css:174`, `:228`) :
un texte multiligne s'y écraserait en un seul paragraphe, **sans que rien ne le
signale**. C'est une `<ul>` de `<li>` qu'il faut produire — un helper `puces()`
dans `model.ts`, partagé par la description du bloc et le libellé client (qui
peut lui aussi porter des retours).

**d. Le bloc ne se coupe pas.** `break-inside: avoid` est déjà posé sur
`tbody tr` (`document-devis.css:225`) : la synthèse et sa description restent
ensemble. Et un bloc condensé dont le sous-total est nul (rien que des lignes
`TEXTE`) **disparaît**, comme `documentClient` fait déjà disparaître un lot vidé
de ses seules options (`model.ts:1114`) — « Ensemble … 0,00 € » est pire que
rien.

---

## 7. Le bordereau interne — le même document, deux tirages

`/perso/{qui}/devis/{id}/apercu` gagne un interrupteur **« Voir le détail des
blocs forfaitaires »** (`?detail=1`, lu côté serveur — aucun état client à
tenir). Le bouton « Imprimer / PDF » existant tire ce qui est à l'écran : **le
bordereau, c'est l'aperçu avec l'interrupteur allumé.**

⚠️ **Cet interrupteur n'est PAS dans « Sur le document », et c'est délibéré.**
Les réglages du pavé sont **persistés sur le devis** ; un quatrième réglage
persisté « montrer le détail » serait à un clic de tout dévoiler au client, sans
que rien ne le rattrape — le lien public sert le devis vivant. Celui de l'aperçu
**ne vit que le temps d'une URL**.

Trois règles, dans cet ordre :

1. **Le défaut reste l'aperçu CLIENT**, interrupteur éteint. Cet écran s'appelle
   « Aperçu client » et sert à relire avant d'envoyer — s'il montrait le détail
   par défaut, on croirait que le client le voit, et un Ctrl+P distrait
   l'enverrait pour de bon. Le besoin est écrit noir sur blanc : *« non visible à
   l'impression »* vaut aussi pour NOTRE impression.
2. **La vue interne le DIT, et la mention s'imprime.** Bandeau « Vue interne — le
   client ne voit pas le détail des blocs forfaitaires » en tête du document.
   ⚠️ **À l'intérieur de `.print-root`**, sinon le patron d'impression global le
   masque ([§21.6](DEVIS.md)) et le papier ne se distingue plus de celui du
   client.
3. **La vue interne imprime `refInterne`** sous la désignation des lignes
   révélées. Sans la référence fournisseur, cette feuille est un justificatif de
   composition, pas un bon de commande — et le besoin dit *« quand l'affaire
   passe en commande »*. C'est un tirage interne : il n'y a rien à protéger.
4. **La page publique n'a pas cet interrupteur et ne pourrait pas l'avoir** :
   `getDevisPublic` ne renvoie pas le détail. Un `?detail=1` sur `/d/{jeton}` ne
   change rien — il n'y a rien à révéler.

Ce que ça ne fait **pas** : verser le matériel dans l'affaire, réserver du stock,
exporter en CSV. Le vrai chemin de la commande passe par le Magasin — chaque
ligne porte son `produitId` — et c'est le défaut n°3 de
[`amelioration_devis.md`](amelioration_devis.md), qui a sa propre décision à
prendre. **Ne pas faire semblant de le régler avec un PDF.**

---

## 8. Les pièges — tous silencieux

1. ⚠️ **Le titre imprimé deux fois** (§6a) — on ne s'en aperçoit qu'en regardant
   le document.
2. ⚠️ **Un bloc condensé sans prix** quand `montrerPrixUnitaires` est décoché
   (§6b) : le client reçoit une phrase et rien d'autre.
3. ⚠️ **Les retours à la ligne écrasés** dans la description et le libellé client
   (§6c) : la saisie est correcte en base, le papier est faux.
4. ⚠️ **La révision et la duplication recopient champ par champ**
   (`nouvelleRevision`, `dupliquerDevis`) : le lot est recréé avec
   `{devisId, titre, ordre, note}` — `rendu` et `libelleClient` doivent être
   ajoutés aux **deux** listes. Un oubli ne casse rien : il **découvre le bloc au
   client** à la révision suivante.
5. ⚠️ **Les lignes `TEXTE` d'un bloc condensé disparaissent** du document : elles
   font partie du détail. Ce que le client doit lire va dans la **description du
   bloc**.
6. ⚠️ **`getDevisPublic` renvoie `LigneDevis.note`** (`queries.ts:568`) sans que
   rien ne l'affiche : contre la doctrine du [§21.3](DEVIS.md). Le neutraliser
   (`note: ""` — le type l'exige non nul, comme `refInterne: null` juste
   au-dessus). Zéro ligne n'en porte aujourd'hui, donc zéro régression.
7. ⚠️ **Ne jamais calculer un chiffre interne sur un tableau condensé** (§4.3) —
   d'où le type marqué.
8. ⚠️ **La migration** : `prisma migrate dev --create-only`, **retirer les deux
   lignes** que le diff régénère sur la colonne `recherche` du wiki
   (`DROP INDEX` + `DROP DEFAULT`), puis `migrate deploy`. Vérifier ensuite que
   `WikiPage_recherche_idx` existe encore. Puis `npm run db:generate` **et
   redémarrer le serveur** (Prisma 7 ne régénère pas le client).

---

## 9. Ce qui est touché

| Fichier | Ce qu'il gagne |
|---|---|
| `prisma/schema.prisma` | `LotDevis.rendu`, `LotDevis.libelleClient` |
| `src/tools/devis/model.ts` | `condenserLots()`, `LignesPourClient`, `puces()`, `rendu` sur `LotDevisVue`, `condense` sur `LotDocument` |
| `src/tools/devis/queries.ts` | condensation dans `getDevisPublic` · `note: ""` sur les lignes publiques · `rendu`/`libelleClient` dans `getDevis` |
| `src/tools/devis/actions.ts` | `majLot({rendu, libelleClient})` · `ajouterLot(…, {rendu})` pour « Nouveau forfait » · les **deux** listes de recopie |
| `src/tools/devis/editeur-devis.tsx` | le filet du bloc · le cartouche « ce que le client lira » (désignation + description) · le badge sur l'entête et dans le rail · « + Nouveau forfait » · l'avertissement de l'option |
| `src/tools/devis/editeur-devis.css` | `.ed-bloc` (filet vertical), `.ed-face-client` (cartouche) |
| `src/tools/devis/document-devis.tsx` `.css` | la ligne de synthèse · les puces · le titre effacé · le bandeau « vue interne » · `refInterne` en vue interne |
| `src/tools/devis/publication-devis.tsx` | la récapitulation « ce que le client voit de chaque bloc » |
| `.../devis/[id]/apercu/page.tsx` | l'interrupteur `?detail=1` |

Ce qui **n'est pas** touché : `calculerDevis` et toute la chaîne de calcul.

---

## 10. Phasage

| Lot | Contenu | Utilisable à la fin ? |
|---|---|---|
| **1** | La description du bloc : `lot.note` éditable dans l'éditeur + puces au document | **oui** — c'est déjà la moitié du besoin, sans une ligne de schéma |
| **2** | Le bloc forfaitaire : `rendu` + `libelleClient`, `condenserLots()`, garde dans `getDevisPublic`, rendu du document | **oui** — répond au besoin côté client |
| **3** | L'éditeur : filet, cartouche, badge, rail, « + Nouveau forfait », récapitulation dans « Sur le document » | oui |
| **4** | L'aperçu à interrupteur = le bordereau interne, avec `refInterne` | oui |

Les lots 2 et 3 se livrent **ensemble** en pratique : un bloc condensé qu'on ne
voit pas comme tel dans l'éditeur est un piège, pas une fonctionnalité.

---

## 11. Vérification

- `npx tsx scripts/devis-smoke.mts` — **doit rester vert sans modification**.
  C'est la preuve que le moteur n'a pas bougé.
- **Nouveaux contrôles sur `condenserLots()`** : l'invariant du §4.2 au centime ;
  les options sortent du bloc et restent nommées ; les lignes `TEXTE` sont
  absorbées ; un bloc détaillé n'est pas touché ; un bloc à sous-total nul
  disparaît.
- `npx tsx scripts/devis-restitution-smoke.mts` étendu d'un **test de fuite avec
  témoin négatif** — le seul contrôle qui vaille :
  - la réponse de `getDevisPublic` ne contient **aucune** désignation ni
    référence d'un bloc condensé (`JSON.stringify(payload)` sans « ECY-S1000 ») ;
  - elle contient **bien** les désignations d'un bloc détaillé du même devis
    (sinon le test passe au vert sur une charge utile vide) ;
  - elle ne contient plus `LigneDevis.note`.
- **Regarder** : `npx tsx scripts/devis-document-apercu.mts` (écran, téléphone,
  PDF) sur un devis **mélangé** — un bloc forfaitaire à description longue et un
  bloc détaillé. La leçon du [§21.9](DEVIS.md) vaut ici mot pour mot : trois
  défauts réels y étaient invisibles aux contrôles fonctionnels.
- **En navigateur**, l'éditeur à 1440 / 1280 / 390 px : le filet et le cartouche
  doivent survivre au repli `.table-cards` (< 640 px), où les largeurs de colonne
  sont neutralisées.

---

## 12. Ce qu'on ne fait pas, et pourquoi

- **`LigneDevis.detail` et `Prestation.detailModele`** — abandonnés. C'était la
  réponse à un second besoin qui n'existe pas (préambule). Si un jour une ligne
  d'un bloc **détaillé** appelle un commentaire, la ligne `TEXTE` fait déjà ce
  travail, et elle est riche.
- **Des sous-lignes chiffrantes** — elles fabriqueraient un total sur un détail
  non exhaustif, affiché avec l'autorité d'un calcul. La doctrine dit l'inverse
  ([§2.3](DEVIS.md)) : *ce qu'on ne sait pas chiffrer est dit, pas compté.*
- **Un troisième niveau `Groupe`** — §3.1.
- **Une ligne « kit »** — §3.2.
- **Un drapeau de visibilité par ligne** — §3.3.
- **Deux devis (un interne, un client)** — la duplication existe et ne coûterait
  rien, mais rien ne garantirait qu'ils restent d'accord. Un devis qui ment sur
  le prix qu'on a envoyé est pire que pas de bordereau du tout.
- **Un champ pour l'unité de la ligne de synthèse** — `"forfait"` en dur. Un
  champ de plus pour un mot ; on regardera à l'écran si « ens » manque vraiment.
- **Le versement dans le matériel de l'affaire** — §7, et défaut n°3.

---

## 13. Ce qui a été livré

Implémenté et vérifié le **2026-08-12**. Le plan a été suivi ; ce qui suit note
les écarts et surtout **ce que seuls les yeux ont trouvé**.

### 13.1 Le modèle, tel qu'écrit

`LotDevis.rendu` (`DETAILLE` par défaut) et `LotDevis.libelleClient`. Migration
`20260812090000_devis_bloc_client`, écrite à la main — le diff régénérait bien
les deux lignes du tsvector wiki, elles ont été retirées, et
`WikiPage_recherche_idx` a été vérifié présent après `migrate deploy`.

Le défaut préserve exactement les 8 lots existants : aucun devis ne change.

### 13.2 `condenserLots()` — deux précisions venues du code

**Elle est IDEMPOTENTE**, et c'est ce qui rend l'architecture simple :
`getDevisPublic` condense dans la requête (la garde) *et* `DocumentDevis`
condense au rendu (pour l'aperçu interne). Comme condenser une synthèse redonne
la même synthèse, aucun des deux n'a besoin de savoir si l'autre est passé. Un
contrôle le verrouille.

**Un bloc sans rien à chiffrer ne produit pas de synthèse.** Le premier jet
sortait « TRAVAUX — 0,00 € » pour un bloc ne portant que des commentaires. La
condition retenue est « au moins une ligne chiffrée non-option », et non « un
sous-total non nul » : un bloc réellement chiffré à 0 € reste affiché.

Le type de retour `LignesPourClient` est **marqué** (`unique symbol`) : la ligne
de synthèse est une `LIBRE` sans déboursé, donc du poison pour tout calcul de
marge. Le compilateur refuse la confusion.

### 13.3 Ce que seuls les yeux ont trouvé

Trois défauts que **tous les contrôles fonctionnels laissaient passer** — la
leçon du [§21.9](DEVIS.md) se vérifie une fois de plus :

1. ⚠️ **La description perdait ses puces.** `<ul class="lot-note">` sans
   marqueurs : le reset de l'application efface `list-style`, et une liste sans
   puces se lit comme un paragraphe cassé. Exactement le même piège qu'une fois
   déjà sur ce document (listes d'un texte riche).
2. ⚠️ **Un bloc forfaitaire se collait au précédent.** N'ayant plus de bandeau de
   titre (sa phrase le remplace), il commençait juste sous le sous-total du bloc
   d'avant et se lisait comme sa suite. Visible surtout au téléphone, où tout est
   empilé en fiches. Parade : `.lot-condense` porte un filet supérieur.
3. ⚠️ **Le champ de description coupait sa 3ᵉ puce** dans l'éditeur (hauteur
   fixe à 2 lignes). Ce qu'on ne voit pas dans l'éditeur, on ne le relit pas
   avant l'envoi — les deux champs de la face client suivent maintenant leur
   contenu (2 à 8 lignes).

### 13.4 Un piège d'outillage, pas de code

Le premier passage en navigateur a montré **un aperçu entièrement blanc et sans
style**. Ce n'était pas le code : une instance de serveur d'un build précédent
tournait encore, pendant que `serve-prod.sh` avait déjà **remplacé les assets
statiques** par ceux du nouveau build (`rm -rf .next/standalone/.next/static`).
Le serveur servait donc du HTML qui référence des noms de fichiers disparus —
d'où un `document-devis.css` en 404, donc un document en `display: none`
(règle `.print-root`).

**À retenir** : après un `npm run build`, l'instance qui tourne doit être
redémarrée, sinon elle sert un HTML dont les chunks n'existent plus. Un
`EADDRINUSE` avalé dans un log suffit à passer une heure à chercher un bug de
CSS qui n'existe pas.

### 13.5 Vérifié

| Quoi | Résultat |
|---|---|
| `npx tsx scripts/devis-smoke.mts` | **200 ✔** (169 d'origine **inchangés** + 31 sur le bloc) |
| `npx tsx scripts/devis-restitution-smoke.mts` | **63 ✔** (vraie base, vrai serveur) |
| `npx tsx --env-file=.env --conditions=react-server scripts/devis-fil-smoke.mts` | **20 ✔** |
| `tsc --noEmit`, `eslint` sur l'outil | propres (1 avertissement hérité) |
| Navigateur 1440 / 390 px | aucune erreur console, aucun débordement |

Le test de fuite porte un **témoin négatif** (le bloc détaillé voisin DOIT
apparaître) et s'applique **aussi au PDF**, pas seulement au HTML dont il est
tiré : c'est le PDF qui part réellement chez le client.

Les 169 contrôles d'origine du moteur n'ont pas été modifiés — seules les
fabriques de lots ont gagné les deux champs. C'est la preuve que `calculerDevis`
n'a pas bougé.

### 13.6 Ce qui n'est pas fait

- **Le versement du bloc dans la BOM de l'affaire** — chaque ligne porte son
  `produitId`, le chemin existe, mais c'est le défaut n°3 et il a sa propre
  décision à prendre (verser des lignes, ou poser une réservation).
- **Un référentiel de phrases types.** « DÉPOSE DE L'ANCIENNE RÉGULATION… » se
  répétera d'un devis à l'autre ; pour l'instant la duplication d'un devis suffit
  à la recopier. À reprendre quand on aura vu trois ou quatre phrases réelles —
  pas avant, sinon on range du vide.
- **L'unité de la ligne de synthèse** reste `"forfait"` en dur.
