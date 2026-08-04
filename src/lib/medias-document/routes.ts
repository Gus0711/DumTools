import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { dispositionMedia, ecrireMedia, lireMedia, type DepotMedias } from "./stockage";

/* Routes média d'un document riche.
 *
 * Ce qui est factorisé : la mécanique (validation du multipart, idempotence par
 * UUID, écriture disque, lecture, en-têtes de réponse). Ce qui ne l'est PAS :
 * le contrôle d'accès en lecture — chaque route le porte en clair. Une route
 * publique scopée à un jeton et une route interne authentifiée n'autorisent pas
 * la même chose, et cacher cette différence derrière une fabrique serait le
 * meilleur moyen de la perdre de vue au prochain outil. */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MediaServi {
  fichier: string;
  mimeType: string;
  nom: string;
}

export interface ConfigTeleversement {
  depot: DepotMedias;
  tailleMax: number;
  /** Champ du formulaire portant l'id du document parent (`noteId`, `pageId`…). */
  champParent: string;
  /** Libellé du parent dans les messages d'erreur (« Note », « Page »). */
  libelleParent: string;
  /** Le document parent existe-t-il ? */
  parentExiste(id: string): Promise<boolean>;
  /** Le média est-il DÉJÀ en base ? (idempotence : re-tenter n'écrit pas deux fois) */
  mediaExiste(id: string): Promise<boolean>;
  /** Écrit la ligne média en base, une fois le binaire posé sur le disque. */
  enregistrer(m: {
    id: string;
    parentId: string;
    nom: string;
    mimeType: string;
    taille: number;
    fichier: string;
  }): Promise<void>;
}

/**
 * Fabrique du `POST` de réception d'un média (image collée dans l'éditeur,
 * pièce jointe). IDEMPOTENT par UUID média : re-tenter un envoi interrompu ne
 * duplique jamais. Réservé aux utilisateurs connectés — un document ne reçoit
 * de contenu que de l'intérieur, même s'il est partagé publiquement en lecture.
 */
export function routeTeleversementMedia(cfg: ConfigTeleversement) {
  return async function POST(req: Request): Promise<Response> {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const form = await req.formData();
    const mediaId = String(form.get("mediaId") || "").toLowerCase();
    const parentId = String(form.get(cfg.champParent) || "");
    const file = form.get("file");

    if (!UUID_RE.test(mediaId) || !parentId) {
      return NextResponse.json({ error: "Identifiants invalides" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
    }
    if (file.size > cfg.tailleMax) {
      const mo = Math.round(cfg.tailleMax / (1024 * 1024));
      return NextResponse.json(
        { error: `Fichier trop volumineux (max ${mo} Mo)` },
        { status: 413 },
      );
    }
    if (!(await cfg.parentExiste(parentId))) {
      return NextResponse.json(
        { error: `${cfg.libelleParent} inconnue` },
        { status: 404 },
      );
    }
    if (await cfg.mediaExiste(mediaId)) {
      return NextResponse.json({ ok: true, deja: true });
    }

    const contenu = Buffer.from(await file.arrayBuffer());
    const fichier = await ecrireMedia(cfg.depot, mediaId, contenu);

    await cfg.enregistrer({
      id: mediaId,
      parentId,
      nom: file.name || "",
      mimeType: file.type || "application/octet-stream",
      taille: contenu.byteLength,
      fichier,
    });

    return NextResponse.json({ ok: true });
  };
}

/** Cache d'un média déjà autorisé. Un média est immuable (son id est un UUID),
 *  donc `immutable` en interne ; sur un partage public on reste court, pour
 *  qu'une révocation ou une échéance coupe l'accès sans délai. */
export const CACHE_MEDIA_INTERNE = "private, max-age=31536000, immutable";
export const CACHE_MEDIA_PUBLIC = "private, max-age=3600";

/**
 * Réponse binaire d'un média **dont l'accès a déjà été autorisé par
 * l'appelant**. Ne fait aucun contrôle : c'est la route qui décide qui a le
 * droit de voir quoi, et qui n'appelle ceci qu'après.
 */
export async function reponseMedia(
  req: Request,
  media: MediaServi,
  cacheControl: string,
): Promise<Response> {
  let contenu: Buffer;
  try {
    contenu = await lireMedia(media.fichier);
  } catch {
    return NextResponse.json({ error: "Fichier absent du stockage" }, { status: 410 });
  }

  const disposition = dispositionMedia(req.url, media.nom);
  return new NextResponse(new Uint8Array(contenu), {
    headers: {
      "Content-Type": media.mimeType,
      "Content-Length": String(contenu.byteLength),
      ...(disposition ? { "Content-Disposition": disposition } : {}),
      "Cache-Control": cacheControl,
    },
  });
}
