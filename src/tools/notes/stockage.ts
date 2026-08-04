import "server-only";
import { depotMedias } from "@/lib/medias-document/stockage";

/* Dépôt des médias de note (images collées, pièces jointes) : binaire durable
 * sur le disque de la VM, hors public/. Servi par la route authentifiée
 * /api/notes/media/[id], ou — pour une note partagée — par la route publique
 * scopée au jeton. La mécanique vit dans @/lib/medias-document. */

export const DEPOT_MEDIAS_NOTES = depotMedias("NOTES_MEDIA_DIR", ".notes-media");
