import type { EtatTache, PrioriteTache } from "@/generated/prisma/enums";
import type { NoteContenu } from "@/tools/notes/model";

/** Tâche telle que servie au kanban de la fiche affaire (voir listerTaches). */
export interface TacheRow {
  id: string;
  titre: string;
  etat: EtatTache;
  ordre: number;
  assigneId: string | null;
  assigneNom: string | null;
  /** Portées par l'écran « Mes tâches », mais AFFICHÉES ici aussi : une tâche
   *  marquée « Haute » ou en retard qui ne le montrerait pas sur le tableau de
   *  son affaire ferait mentir l'un des deux écrans. */
  priorite: PrioriteTache;
  echeance: string | null;
}

/** Utilisateur assignable à une tâche (utilisateur actif). */
export interface AssignableUser {
  id: string;
  nom: string;
}

/** Tâche ouverte assignée à l'utilisateur courant, avec son rattachement
 *  (bloc « Mes tâches » de l'accueil et du tableau de bord Affaires).
 *
 *  ⚠️ L'affaire est FACULTATIVE : une tâche interne (Atelier, Administratif…)
 *  est assignée comme une autre et doit apparaître ici — la masquer la rendrait
 *  invisible partout où l'on va voir ce qu'on a à faire. Elle porte alors son
 *  `domaineNom` à la place. */
export interface MaTacheRow {
  id: string;
  titre: string;
  etat: EtatTache;
  affaireId: string | null;
  affaireNom: string | null;
  clientNom: string | null;
  domaineNom: string | null;
}

/**
 * Une tâche de l'écran « Mes tâches » (`/mes-taches`), qui voit PLUS LARGE que
 * le bloc du même nom : les terminées y sont consultables, on filtre par client
 * ou par domaine, et on voit aussi celles des collègues.
 *
 * ⚠️ Le rattachement a TROIS formes, et une seule à la fois (garde côté
 * serveur) : une AFFAIRE, un CLIENT sans affaire précise (le travail commence
 * souvent avant qu'un n° Why existe), ou un DOMAINE interne. Le client, lui,
 * est toujours lisible : il vient de l'affaire, ou du rattachement direct.
 */
export interface TacheDetail {
  id: string;
  titre: string;
  etat: EtatTache;
  priorite: PrioriteTache;
  /** Jour d'échéance en `AAAA-MM-JJ`, ou null. Une DATE, pas un instant : une
   *  échéance ne change pas de valeur selon le fuseau de qui la regarde. */
  echeance: string | null;
  affaireId: string | null;
  affaireNom: string | null;
  clientId: string | null;
  clientNom: string | null;
  numeroWhy: string | null;
  /** true quand la tâche est posée sur le CLIENT, sans affaire précise. Le
   *  `clientNom` est renseigné dans les deux cas — c'est ce drapeau qui dit
   *  d'où il vient, donc ce que la colonne « Rattachée à » doit montrer. */
  clientDirect: boolean;
  domaineId: string | null;
  domaineNom: string | null;
  assigneId: string | null;
  assigneNom: string | null;
  creeeLe: string;
  modifieeLe: string;
  /** Le CORPS de la tâche — document riche, null tant que personne n'a écrit.
   *  Servi avec la liste : il tient dans quelques kilo-octets, et le charger à
   *  la demande ferait clignoter la ligne qu'on vient de déplier. */
  contenu: NoteContenu | null;
  /** Verrou optimiste du document seul. */
  version: number;
}

/** Un domaine où ranger une tâche interne. */
export interface DomaineVue {
  id: string;
  nom: string;
  actif: boolean;
}

/** Les trois priorités, de la plus forte à la plus faible — l'ordre d'affichage
 *  ET l'ordre de tri. Le glyphe double le libellé : sur cet écran la couleur ne
 *  porte jamais l'information seule (règle de la charte). */
export const PRIORITES: {
  value: PrioriteTache;
  label: string;
  glyphe: string;
  classe: string;
}[] = [
  { value: "HAUTE", label: "Haute", glyphe: "▲", classe: "text-danger" },
  { value: "NORMALE", label: "Normale", glyphe: "—", classe: "text-muted" },
  { value: "BASSE", label: "Basse", glyphe: "▼", classe: "text-subtle" },
];

export const RANG_PRIORITE: Record<PrioriteTache, number> = {
  HAUTE: 0,
  NORMALE: 1,
  BASSE: 2,
};

/** Les trois états d'une tâche, dans l'ordre du travail. */
export const ETATS_TACHE: { value: EtatTache; label: string }[] = [
  { value: "EN_COURS", label: "En cours" },
  { value: "A_FAIRE", label: "À faire" },
  { value: "TERMINEE", label: "Terminée" },
];

/** Ce qui est coché à l'ouverture de `/mes-taches` : ce qu'il RESTE à faire.
 *  Les terminées sont à un clic — elles répondent à « qu'ai-je fait ? », une
 *  autre question, qui n'a pas à encombrer la première. */
export const ETATS_TACHE_DEFAUT: EtatTache[] = ["EN_COURS", "A_FAIRE"];

/** Colonnes du kanban, dans l'ordre d'affichage. */
export const COLONNES_TACHES: { etat: EtatTache; label: string; dot: string }[] = [
  { etat: "A_FAIRE", label: "À faire", dot: "bg-subtle" },
  { etat: "EN_COURS", label: "En cours", dot: "bg-accent" },
  { etat: "TERMINEE", label: "Terminé", dot: "bg-success" },
];

/** Initiales d'un nom d'utilisateur (« Augustin Duhant » → « AD »). */
export function initialesNom(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return "?";
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return (mots[0][0] + mots[mots.length - 1][0]).toUpperCase();
}

/* Tons d'avatar : classes complètes (jamais composées dynamiquement, sinon
 * Tailwind ne les génère pas), piochées dans les tokens sémantiques E/S. */
const TONS_AVATAR = [
  "bg-io-ai/15 text-io-ai",
  "bg-io-di/15 text-io-di",
  "bg-io-ao/15 text-io-ao",
  "bg-io-do/15 text-io-do",
  "bg-io-com/15 text-io-com",
];

/** Ton d'avatar stable pour un utilisateur donné (hash du nom → palette). */
export function tonAvatar(nom: string): string {
  let h = 0;
  for (let i = 0; i < nom.length; i++) h = (h * 31 + nom.charCodeAt(i)) >>> 0;
  return TONS_AVATAR[h % TONS_AVATAR.length];
}

/* =============================================================================
 * MÉDIAS DU CORPS D'UNE TÂCHE
 *
 * ⚠️ Ces trois-là vivent ICI, dans le modèle CLIENT-SAFE, et non dans
 * `taches-stockage.ts` : ce dernier est `server-only` (il ouvre `node:fs`), et
 * l'éditeur — un composant client — a besoin de l'URL. Les mélanger fait
 * échouer la compilation du bundle navigateur avec un message qui ne pointe pas
 * la ligne fautive (« does not support external modules: node:fs/promises »).
 * Même découpage que le devis : le DÉPÔT au serveur, l'URL des deux côtés.
 * ========================================================================== */

/** 25 Mo : on colle des photos d'armoire et des captures, pas des vidéos. */
export const TAILLE_MAX_MEDIA_TACHE = 25 * 1024 * 1024;

/** Préfixe de la route média des tâches. Source de vérité UNIQUE : l'URL écrite
 *  dans le document et la regex de purge en dépendent toutes les deux. */
export const PREFIXE_MEDIA_TACHE = "/api/taches/media/";

export function urlMediaTache(mediaId: string): string {
  return `${PREFIXE_MEDIA_TACHE}${mediaId}`;
}
