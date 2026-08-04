"use client";

import { PanneauPartage } from "@/lib/partage/panneau-partage";
import { DUREES_PARTAGE_WIKI } from "@/lib/partage/model";
import {
  genererJetonPartagePage,
  prolongerPartagePage,
  revoquerJetonPartagePage,
} from "./actions";

/**
 * Partage TEMPORAIRE d'une page de wiki : lecture seule via /w/[jeton], sans
 * connexion.
 *
 * Le wiki est la base de connaissances interne — la sortir vers l'extérieur est
 * l'exception, pas la règle. D'où l'échéance obligatoire (aucun « sans limite »
 * dans DUREES_PARTAGE_WIKI, et le serveur la refuse de toute façon) : une
 * procédure envoyée à un sous-traitant pour un chantier n'a pas à rester
 * lisible du monde entier six mois plus tard.
 */
export function PartagePage({
  pageId,
  jetonInitial,
  expireLeInitial,
}: {
  pageId: string;
  jetonInitial: string | null;
  /** ISO — toujours renseignée quand un jeton existe (échéance obligatoire). */
  expireLeInitial: string | null;
}) {
  return (
    <PanneauPartage
      baseUrl="/w/"
      jetonInitial={jetonInitial}
      expireLeInitial={expireLeInitial}
      durees={DUREES_PARTAGE_WIKI}
      dureeParDefaut="7j"
      libelleDocument="cette page"
      accroche="Crée un lien public en lecture seule vers cette page — pour un sous-traitant, un client ou un intervenant extérieur. Le lien est non devinable, expire tout seul, et reste révocable à tout moment."
      actions={{
        generer: (dureeId) => genererJetonPartagePage(pageId, dureeId),
        prolonger: (dureeId) => prolongerPartagePage(pageId, dureeId),
        revoquer: () => revoquerJetonPartagePage(pageId),
      }}
    />
  );
}
