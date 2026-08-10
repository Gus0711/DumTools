# Devis — améliorations à faire

> Ce qui a été **identifié le 2026-08-07** en relisant l'outil livré, et **mis de
> côté volontairement**. Ce n'est pas un fourre-tout d'idées : chaque entrée dit
> le problème réel, pourquoi il compte, et la parade envisagée.
>
> Doc de l'outil : [`DEVIS.md`](DEVIS.md) · le mécanisme d'associations :
> [`MAGASIN.md` §14](MAGASIN.md).
>
> **Déjà traité et sorti de cette liste** : la duplication d'un devis vers un
> nouveau numéro, et le prix cible (voir [`DEVIS.md`](DEVIS.md) §17).

---

## 1. Un devis émis se modifie sans rien dire ⚠️ *défaut*

**Le problème.** Toute la doctrine de l'outil est « le devis fige » — les prix
sont copiés sur la ligne précisément pour qu'un devis rouvert trois mois plus
tard montre ce qui a été chiffré. Mais **aucune garde ne regarde l'état** :
`majEnteteDevis`, `majLigne`, `supprimerLigne`, `reordonnerLignes` acceptent
toutes d'écrire sur un devis `EMIS` ou `ACCEPTE`.

On peut donc changer un prix, une quantité ou une remise sur un devis **déjà
envoyé au client**, sans trace, sans avertissement, et sans que le devis
imprimé chez le client corresponde encore à celui qui est en base.

**Pourquoi ça compte.** C'est le seul endroit où l'outil contredit son propre
principe. Et l'écart ne se voit pas : rien dans l'interface ne dit que le devis
consulté a bougé depuis son émission.

**La parade envisagée.** Refuser l'écriture côté **action** (pas seulement dans
l'écran) dès que l'état est `EMIS` ou `ACCEPTE`, et proposer à la place le
chemin normal : **« créer une révision »**. Prévoir une soupape pour l'erreur de
frappe évidente — soit un déverrouillage explicite et attribuable, soit
l'autorisation de repasser en `BROUILLON` (ce qui laisse au moins une trace
d'état). Le champ `emisLe` ne doit pas être réécrit dans ce cas : il pose la
date de la PREMIÈRE émission.

**Où.** `src/tools/devis/actions.ts` (la garde), `editeur-devis.tsx` (le
bandeau qui l'explique et le bouton de révision).

---

## 2. Reprendre le matériel d'une affaire deux fois double tout, en silence ⚠️ *défaut*

**Le problème.** `reprendreBom` filtre les lignes de la BOM sur les produits
cochés, mais **ne regarde jamais ce que le devis contient déjà**. Deux clics sur
« Reprendre le matériel de l'affaire » posent deux fois l'automate et deux fois
les douze sondes, dans deux lots distincts.

**Pourquoi ça compte.** Le total est faux, et **rien ne le signale** — ni un
avertissement, ni un doublon visible (les lignes sont dans des lots différents).
C'est exactement le genre d'erreur qu'on n'attrape qu'en recomptant à la main,
c'est-à-dire jamais.

**La parade envisagée.** Dans l'aperçu de reprise, marquer les articles **déjà
présents dans le devis** : décochés d'office, avec la mention « déjà au devis
(×3) ». Laisser la possibilité de les cocher quand même — on peut légitimement
vouloir compléter une quantité — mais que ce soit une décision, pas un accident.

**Où.** `apercuReprise` (renvoyer les quantités déjà au devis),
`reprise-bom.tsx` (l'affichage et la présélection).

---

## 3. Le devis accepté n'alimente rien

**Le problème.** Un devis passé à `ACCEPTE` ne déclenche rien. Le matériel qu'on
vient de chiffrer doit être **ressaisi à la main** dans l'écran Matériel de
l'affaire pour être réservé, préparé et sorti.

**Pourquoi ça compte.** C'est la boucle ouverte du cycle A→Z : l'étape 2 (étude
& chiffrage) ne se déverse pas dans l'étape 3 (fabrication). Toute la valeur du
Magasin est justement de ne pas recompter le matériel.

**La parade envisagée — à trancher, c'est la question §10.1 de `DEVIS.md`.**
Deux niveaux possibles, du plus sûr au plus engageant :

1. **Verser les lignes manuelles** de l'affaire (`LigneMaterielAffaire`) à
   partir des lignes produit du devis accepté — la BOM dérivée reprend la main
   ensuite, rien n'est figé côté affaire ;
2. **Poser une réservation de stock** (`ReservationStock`) dans la foulée.

⚠️ Le piège à éviter : une **synchronisation** permanente devis ⇄ affaire. Le
devis fige, la BOM vit — les deux ne peuvent pas rester d'accord. Ce doit être
un **versement ponctuel**, déclenché explicitement, et qui dit ce qu'il a fait.

---

## 6. On ne voit pas ce qui a changé entre deux révisions

**Le problème.** Les révisions sont chaînées (`parentId`) et on navigue de v2
vers v1, mais pour savoir ce qui a bougé il faut ouvrir les deux et comparer de
tête.

**Pourquoi ça compte.** C'est précisément ce qu'on regarde après une
négociation : qu'est-ce que j'ai lâché, et où. Sans ça, la révision conserve
l'information sans la rendre lisible.

**La parade envisagée.** Une vue de comparaison v(n−1) → v(n) : lignes ajoutées,
retirées, quantités et prix modifiés, écart de total. Les lignes portant un
`produitId` s'apparient dessus ; les lignes libres et les prestations
s'apparient sur leur libellé, avec le reste en « ajouté / retiré » plutôt qu'un
appariement approximatif qui mentirait.

---

## 7. La validité ne sert à rien

**Le problème.** `validiteJours` est saisie, stockée, affichée dans le
cartouche — et **jamais exploitée**. Un devis émis il y a 45 jours avec 30 jours
de validité ne se distingue en rien d'un devis émis hier.

**Pourquoi ça compte.** C'est le suivi commercial le moins cher du monde : la
donnée est déjà là, et `emisLe` aussi.

**La parade envisagée.** Sur l'index : une pastille « échu » (et « échoit dans
n jours ») sur les devis `EMIS` dont `emisLe + validiteJours` est dépassé, plus
un filtre. Rien d'automatique — on ne change pas l'état tout seul, un devis échu
se relance ou se révise, c'est une décision commerciale.

---

## Plus petit, même esprit

- **Dupliquer une ligne** dans un devis (fréquent : la même sonde à un autre
  étage, avec une note différente).
- **Total d'heures par famille de prestation.** Un devis GTB se juge aussi en
  jours-homme, pas seulement en euros — et l'information est déjà dans les
  lignes.
- **Export CSV** des lignes, pour ressaisie dans WhySoft en attendant le PDF.
- **Proposer les associations à la reprise de BOM** : aujourd'hui elles ne se
  déclenchent qu'à l'ajout manuel d'une ligne.
- **Vue inverse des associations** sur la fiche produit : « qui appelle cet
  article ? ». La relation existe en base, il manque l'écran.
- **Dupliquer depuis l'index**, sans avoir à ouvrir le devis.

---

## ~~Et toujours : la restitution client~~ — FAIT le 2026-08-08

Le devis **sort** : page publique `/d/{jeton}` à envoyer au client, PDF à
en-tête imprimé par un vrai navigateur, mentions et conditions réglées une fois
pour la maison. Cadrage complet et pièges : [`DEVIS.md`](DEVIS.md) §21.

⚠️ **Cela aggrave le défaut n°1 ci-dessus**, en connaissance de cause : le lien
public sert le devis **à sa source**, donc modifier un devis publié change ce que
le client a sous les yeux. Trois garde-fous visibles ont été posés à défaut de
figement (document daté « mis à jour le… », avertissement dans l'éditeur, journal
de consultation) — voir §21.2. Le vrai remède reste **la révision**, qui garde le
numéro et ne reprend pas le lien du parent.
