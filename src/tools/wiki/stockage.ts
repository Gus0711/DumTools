import "server-only";
import { depotMedias } from "@/lib/medias-document/stockage";

/* Dépôt des médias de page wiki : même patron que les notes (binaire durable
 * sur le disque de la VM, hors public/). Servi par la route authentifiée
 * /api/wiki/media/[id], ou — pour une page partagée temporairement — par la
 * route publique scopée au jeton. La mécanique vit dans @/lib/medias-document. */

export const DEPOT_MEDIAS_WIKI = depotMedias("WIKI_MEDIA_DIR", ".wiki-media");
