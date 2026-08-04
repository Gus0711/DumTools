"use client";

import { PanneauPartage } from "@/lib/partage/panneau-partage";
import { DUREES_PARTAGE } from "@/lib/partage/model";
import { genererJetonPartage, prolongerPartage, revoquerJetonPartage } from "./actions";

/**
 * Partage public d'une note : lecture seule via /n/[jeton], sans connexion —
 * l'app est exposée sur internet via le tunnel Cloudflare, le lien fonctionne
 * donc aussi pour un client.
 *
 * Une note d'affaire transmise à un client peut devoir rester lisible sans
 * échéance : « Sans limite » reste offert ici (contrairement au wiki), et c'est
 * le défaut historique de l'outil.
 */
export function PartageNote({
  noteId,
  jetonInitial,
  expireLeInitial,
}: {
  noteId: string;
  jetonInitial: string | null;
  /** ISO, ou null pour « sans échéance ». */
  expireLeInitial: string | null;
}) {
  return (
    <PanneauPartage
      baseUrl="/n/"
      jetonInitial={jetonInitial}
      expireLeInitial={expireLeInitial}
      durees={DUREES_PARTAGE}
      dureeParDefaut="illimite"
      libelleDocument="cette note"
      accroche="Crée un lien public en lecture seule vers cette note — pratique pour un client ou un intervenant extérieur. Le lien est non devinable et révocable à tout moment."
      actions={{
        generer: (dureeId) => genererJetonPartage(noteId, dureeId),
        prolonger: (dureeId) => prolongerPartage(noteId, dureeId),
        revoquer: () => revoquerJetonPartage(noteId),
      }}
    />
  );
}
