import "server-only";
import { depotMedias } from "@/lib/medias-document/stockage";

/* Dépôt des médias de devis (images collées dans un texte libre, pièces
 * jointes) : binaire durable sur le disque de la VM, hors public/. Servi par la
 * route authentifiée ET cloisonnée /api/devis/media/[id] — un devis n'a aucune
 * vue publique, contrairement aux notes. La mécanique vit dans
 * @/lib/medias-document. */

export const DEPOT_MEDIAS_DEVIS = depotMedias("DEVIS_MEDIA_DIR", ".devis-media");
