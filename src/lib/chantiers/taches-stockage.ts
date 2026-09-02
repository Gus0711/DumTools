import "server-only";
import { depotMedias } from "@/lib/medias-document/stockage";

/* Dépôt des médias collés dans le CORPS d'une tâche : binaire durable sur le
 * disque de la VM, hors public/. Servi par la route authentifiée
 * /api/taches/media/[id] — une tâche n'a aucune vue publique.
 *
 * ⚠️ SEULEMENT le dépôt. Le préfixe d'URL et la taille max vivent dans
 * `taches.ts` (client-safe) : ce module ouvre `node:fs`, et l'éditeur en aurait
 * fait entrer la moitié dans le bundle navigateur. */

export const DEPOT_MEDIAS_TACHES = depotMedias("TACHES_MEDIA_DIR", ".taches-media");
