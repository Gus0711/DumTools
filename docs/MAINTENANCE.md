# Outil « Maintenance » — les contrats, et les heures qu'ils contiennent

> Implémenté le **2026-09-11**. Espace perso **ToolGus** (`/perso/gus/maintenance`),
> accessible à toute l'équipe. À lire après [`ARCHITECTURE.md`](ARCHITECTURE.md).

## 1. Pourquoi

`docs/ROADMAP.md` décrit le cycle d'une affaire en 7 étapes et la dernière —
**Exploitation / SAV** — était la seule dont la couverture DumTools tenait en un
mot : **rien**. Or Dumortier vend des contrats de maintenance : des sites, des
heures de téléassistance, des heures de présentiel (pas partout), sur plusieurs
années.

Ces heures se comptaient de mémoire. C'est-à-dire qu'elles ne se comptaient pas :
personne ne savait, en décrochant le téléphone, s'il restait du forfait, et le
temps passé au-delà ne se refacturait que lorsque quelqu'un y repensait.

## 2. Ce qu'un contrat n'est pas

Ni un **client** (une commune a dix-sept salles, une seule adresse de mairie),
ni une **affaire** (`Chantier`, un n° Why, qui se **livre** et se referme). Un
contrat **dure** et se **consomme**. D'où ses modèles à lui — et d'où
`SiteClient`, la notion qui manquait à toute la plateforme : **l'endroit qu'on
maintient**, qui survit aux affaires qui l'ont équipé.

## 3. Les décisions (validées avec Augustin)

| Sujet | Décision |
|---|---|
| Périmètre | **N sites par contrat**, avec un vrai référentiel `SiteClient` (réutilisable par d'autres outils plus tard) |
| Renouvellement | **Annuel, à la date anniversaire** — le forfait repart à zéro |
| Temps passé | **Tout dans l'outil** : téléassistance ET présentiel |
| Dépassement | L'intervention est marquée **hors forfait**, donc **refacturable** |
| Qui saisit | **Toute l'équipe** — pas de cloisonnement (voir §7) |
| Fiche client | `listerPourClient` **écrit mais pas branché** — règle ToolGus (§8) |

## 4. Les cinq invariants

### 4.1 Le temps est en MINUTES ENTIÈRES

1 h 10 n'est pas 1,17 h. Un arrondi se déciderait **deux fois** — à la saisie et
au total — et les deux compteurs divergeraient d'une poignée de minutes que
personne ne saurait expliquer **devant le client**. Même règle que l'argent en
centimes dans le Devis. `enHeuresDecimales()` existe pour les exports, et
seulement pour eux.

⚠️ **Deux règles de saisie, et c'est voulu** :
`parseDuree` (une intervention) — un entier nu vaut des **minutes** (« 20 » pour
un appel de vingt minutes), un décimal vaut des **heures** (« 1,5 » = 1 h 30) ;
`parseHeures` (un forfait) — tout vaut des **heures** (« 10 » = 10 h).
Personne n'écrit un forfait annuel de « 600 », personne ne chronomètre un appel
en « 0,33 ». Ce n'est pas devinable, et **ce n'est pas la règle qui protège de
l'erreur : c'est l'écho**. Les deux champs réaffichent en clair ce qu'ils ont
compris (« soit 1 h 30 »), sous le champ, à chaque frappe.

### 4.2 Les périodes sont DÉRIVÉES, jamais stockées

Une période = `[debut + n ans, debut + (n+1) ans[`, écourtée par le terme s'il
tombe avant. Aucune ligne « période » en base : elles se déduisent toutes de
`ContratMaintenance.debut`, comme la frise des 7 jalons se déduit du contenu
d'une affaire. Ce qui se déduit ne se saisit jamais, sinon les deux finissent par
se contredire et **c'est la saisie qu'on croit**.

⚠️ `ajouterAnnees` **serre au mois** : le 29 février + 1 an donne le 28 février,
jamais le 1er mars. Sans ce serrage, un contrat signé un 29 février verrait sa
date anniversaire dériver d'un jour tous les quatre ans, et la période de
consommation avec elle.

### 4.3 Le dépassement est CONSTATÉ, la décision est SAISIE

« Hors forfait » a **deux natures**, comme l'arrêt d'une affaire
(`chantiers/arret.ts`) :

- `Intervention.horsForfait` — une **décision humaine** : ce motif n'est pas
  couvert (une extension, un dégât des eaux). Elle ne consomme aucun quota ;
- le **dépassement**, lui, se **calcule** : on cumule les interventions de la
  période dans l'ordre (date, puis création), et ce qui déborde du quota est
  hors forfait. Jamais stocké.

Corriger la durée d'une intervention de janvier **redistribue tout ce qui suit**.
C'est exactement ce qu'on veut, et c'est la raison pour laquelle on ne fige rien.

⚠️ Une intervention peut être **à cheval** : s'il reste 30 min au forfait et
qu'on passe 1 h 30, 30 min sont incluses et 1 h est en dépassement. Écrire un
booléen par ligne aurait obligé à trancher en faveur de l'un ou de l'autre —
et le client aurait eu raison de contester.

### 4.4 Les deux forfaits NE SE COMPENSENT PAS

Une heure de téléassistance épargnée ne paie pas un déplacement. Deux compteurs,
**jamais un total** : c'est ce que dit le contrat, et c'est ce que le client
compte de son côté. Corollaire d'interface : le cartouche de la fiche affiche
**deux champs** (« Télé / an », « Sur site / an ») et non leur somme — un
« forfait annuel : 18 h » laisserait croire à une enveloppe commune.

Un quota à **0** veut dire « aucune heure incluse pour cette nature », pas
« oubli de saisie » : beaucoup de contrats n'ont pas de présentiel. L'écran
l'écrit en toutes lettres au lieu d'afficher « 0 / 0 ».

### 4.5 Ce qui tombe HORS PÉRIODE est DIT, jamais avalé

Une intervention datée avant la date d'effet ou après le terme n'appartient à
aucune période. Il suffit d'écourter un contrat après coup, ou de se tromper
d'année à la saisie. Sans un traitement explicite, ces minutes **s'évaporaient
de tous les compteurs** — le temps passé perdu sans qu'aucun écran ne s'en
aperçoive.

D'où la troisième cause, `hors-periode` (`CauseHorsForfait`) : ces minutes sont
comptées hors forfait, **et** la fiche ouvre un bandeau rouge qui les nomme une
par une avec un lien « corriger ». Contrôle qui le tient :
« AUCUNE minute n'est perdue : total réparti = total saisi ».

## 5. Le modèle

```
Client ──< SiteClient ──< ContratSite >── ContratMaintenance ──< Intervention
                     └──────────────────────────────────────────────┘ (siteId)
```

- **`SiteClient`** — nom (unique par client : c'est la clé de résolution),
  adresse, `acces` (code portail, où est le local GTB), `accesDistant` (VPN,
  TeamViewer, IP — ce qu'on cherche au moment où le client appelle), `actif`.
- **`ContratMaintenance`** — `debut` (la date anniversaire), `fin` (null = sans
  terme), `tacite`, `preavisJours`, `quotaTeleMin`, `quotaPresentielMin`,
  `tarifHoraireCents`, `etat`.
- **`ContratSite`** — N↔N, et non une FK sur le site : un site passe d'un contrat
  au suivant quand celui-ci est renouvelé, et les interventions de l'ancien
  doivent rester lisibles.
- **`Intervention`** — jour (**midi UTC**, jamais minuit), nature, `dureeMin`,
  `motif` (la colonne qu'on relit un an plus tard quand le client conteste),
  `compteRendu`, `demandeur`, site, intervenant, `horsForfait`, `factureeLe`.

⚠️ **Pas de `clientNom` dénormalisé**, contrairement aux autres outils, et c'est
délibéré : cette dénormalisation existe là où le client est saisi en texte libre
et peut précéder sa résolution (une visite née hors-ligne). Un contrat naît
toujours au bureau avec un client choisi. Recopier le nom n'aurait ajouté qu'une
seconde vérité à resynchroniser — et la liste de `renommerClient` a déjà oublié
deux modèles par le passé.

## 6. Facturable ≠ facturé

Le **facturable** se **déduit** (c'est le hors forfait, recalculé). Le
**facturé** se **déclare** : `factureeLe`, une date et non un booléen — on veut
savoir quand. Sélection multiple dans le tableau → « Marquer facturées ».

Le compteur « à refacturer » de la fiche et de l'index porte sur **toutes les
périodes** : une heure de l'an dernier jamais facturée est perdue exactement
comme une d'aujourd'hui.

⚠️ Le montant est **tu** quand le tarif horaire n'est pas renseigné
(`montantHorsForfaitCents` rend `null`), et l'index compte les contrats
concernés (`nbSansTarif`) : un total qui tait ce qu'il ignore se lit comme un
total complet, et on facture court. Règle reprise du Devis.

## 7. Pas de cloisonnement

Contrairement aux Notes de frais (§6 de `NDF.md`), la garde ne filtre pas par
utilisateur. Un contrat est un engagement de la **maison** : n'importe qui peut
prendre l'appel du client un vendredi soir et doit pouvoir noter son quart
d'heure sans attendre le retour de qui que ce soit. **Un outil qu'une seule
personne peut nourrir n'est pas tenu à jour.**

## 8. Ce qui reste à faire

1. **La fiche client et la fiche affaire.** `listerPourClient` est écrit dans
   `queries.ts` mais **pas** enregistré dans `src/lib/clients/providers.ts` — la
   règle ToolGus veut qu'un outil perso n'entre pas dans l'agrégation
   ([`TOOLGUS.md`](TOOLGUS.md) §2). Le jour où l'outil est promu outil métier,
   comme le Devis l'a été le 2026-08-12, **c'est une ligne**.
2. **Les obligations déduites** (`src/lib/chantiers/obligations.ts`) : « forfait
   dépassé sans rien de facturé », « préavis entamé sur un contrat tacite »,
   « heures hors forfait de plus de 60 jours jamais facturées ». Elles ont
   exactement la forme voulue par les trois règles du fichier (déduites,
   exceptionnelles, incombant à quelqu'un) — reste à trancher **à qui** incombe
   un contrat : il n'a pas de `suiviParId`.
3. **⌘K** : une source `contrats` dans `src/lib/recherche/queries.ts`.
4. **Le MCP** : une IA ne voit pas les contrats. Même découpage que les visites
   ([`VISITES.md`](VISITES.md) §12) — lister, lire la consommation, poser une
   intervention.
5. **La reprise dans un devis** : le hors forfait non facturé a tout ce qu'il
   faut (heures + tarif) pour devenir une `Prestation` de devis.
6. **L'export** d'un relevé de consommation pour le client (le document qu'on
   joint à la facture annuelle).

## 9. Vérifier

```bash
# 92 contrôles : le moteur pur (durées, anniversaire, périodes, cumul du
# forfait, hors période, échéance) puis la chaîne complète sur la VRAIE base.
npx tsx --conditions=react-server scripts/maintenance-smoke.mts

# REGARDER : pose un contrat de démonstration, capture les 13 écrans dans les
# deux largeurs, puis efface tout. Les contrôles ne voient pas une mise en page.
BASE=http://127.0.0.1:3011 npx tsx scripts/maintenance-regard.mts
```

Trois défauts n'ont été vus qu'**en regardant** : l'écho de la durée projeté à
l'autre bout de la ligne (loin du champ qu'il explique), les cellules-titres qui
se rangeaient **côte à côte** au téléphone (sous 640 px `.table-cards` passe la
cellule en `display: flex` — il lui faut **un seul enfant**), et le suffixe
« h / an » qui se coupait en deux lignes.
