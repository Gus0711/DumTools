import "server-only";
import { depotMedias } from "@/lib/medias-document/stockage";

/* Dépôt des documentations produit (fiches techniques, notices, certificats).
 *
 * Le binaire vit sur le disque de la VM, HORS de `public/` — c'est tout l'objet
 * de la bascule : les fiches Distech étaient dans le dépôt Git et servies en
 * statique, donc ajouter une fiche demandait un commit et une reconstruction
 * d'image. Ici, un collègue Achats la téléverse depuis la fiche produit.
 *
 * La mécanique (écriture, lecture, en-têtes) vit dans @/lib/medias-document. */

export const DEPOT_DOCUMENTATIONS = depotMedias("DOC_MEDIA_DIR", ".documentation-media");
