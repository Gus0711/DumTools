import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

/* Stockage disque des médias d'un document riche (image collée, pièce jointe).
 *
 * Le binaire vit sur le disque de la VM, HORS de public/ : il n'est jamais
 * servi en statique, toujours par une route qui contrôle l'accès. Le nom de
 * fichier est l'UUID du média — sûr par construction (pas de traversée de
 * chemin possible depuis une saisie utilisateur).
 *
 * Un « dépôt » = un répertoire, décrit par une variable d'environnement et un
 * repli local pour le développement. Les outils qui portent des documents
 * (Notes, Wiki) déclarent le leur et n'écrivent plus une ligne de fs. */

export interface DepotMedias {
  /** Répertoire cible, résolu à l'appel (pas au chargement du module : la
   *  variable d'environnement peut être posée après l'import en dev). */
  repertoire(): string;
}

/** Déclare un dépôt : variable d'environnement + repli local. */
export function depotMedias(variableEnv: string, replisLocal: string): DepotMedias {
  return {
    repertoire: () => process.env[variableEnv] ?? join(process.cwd(), replisLocal),
  };
}

export async function ecrireMedia(
  depot: DepotMedias,
  mediaId: string,
  contenu: Buffer,
): Promise<string> {
  const dir = depot.repertoire();
  await mkdir(dir, { recursive: true });
  const chemin = join(dir, mediaId);
  await writeFile(chemin, contenu);
  return chemin;
}

export function lireMedia(chemin: string): Promise<Buffer> {
  return readFile(chemin);
}

/** Suppression best-effort : un binaire déjà absent n'est pas une erreur (la
 *  ligne en base fait foi, et la purge doit rester idempotente). */
export async function supprimerMedia(chemin: string): Promise<void> {
  await rm(chemin, { force: true }).catch(() => {});
}

/**
 * En-tête `Content-Disposition` d'un média servi.
 *
 * `?dl=1` force **`attachment`** : sans lui, un PDF (ou tout ce que le
 * navigateur sait afficher) s'ouvre dans l'onglet au lieu de se télécharger.
 * C'est ce que visent les liens de pièces jointes ; les `<img>` du document,
 * elles, appellent la route SANS le drapeau et restent en `inline`.
 */
export function dispositionMedia(url: string, nom: string | null): string | null {
  if (!nom) return null;
  const forcer = new URL(url, "http://local").searchParams.get("dl") === "1";
  const type = forcer ? "attachment" : "inline";
  return `${type}; filename*=UTF-8''${encodeURIComponent(nom)}`;
}
