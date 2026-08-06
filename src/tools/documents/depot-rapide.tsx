"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, FolderOpen, Plus, X } from "lucide-react";
import { Button, EnteteBloc } from "@/ui";
import { Depot } from "./depot";

/**
 * Bloc « Fichiers kDrive » de la fiche Affaire : l'en-tête, le dépôt inline, et
 * la liste des fichiers (rendue par le serveur, passée en `children`).
 *
 * Évite le détour par l'outil Documents : un clic ouvre la zone de dépôt
 * (glisser-déposer + catégorie) directement dans l'affaire. Le `Depot`
 * rafraîchit la page au succès → le fichier apparaît dans la liste en dessous.
 * La zone reste ouverte pour enchaîner plusieurs dépôts.
 *
 * Le titre et la liste vivent dans LE MÊME cadre : la barre d'actions flottait
 * auparavant au-dessus de cadres séparés (un par dossier), et rien ne disait
 * qu'elle les commandait.
 */
export function DepotRapide({
  chantierId,
  count,
  children,
}: {
  chantierId: string;
  count: number;
  children: React.ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);
  return (
    /* Le vert du signal « DO » — celui de l'outil Documents dans le registre. */
    <section className="bloc signal-do">
      <EnteteBloc
        icone={FolderOpen}
        titre="Fichiers kDrive"
        compteur={count}
        mention="miroir du dossier de l'affaire"
        actions={
          <>
            {/* Sur la fiche, le nom d'un fichier l'OUVRE ; la gestion
                (suppression, resynchro kDrive, miroir) reste sur la page
                dédiée. */}
            <Link
              href={`/outils/documents/${chantierId}`}
              className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-fg"
            >
              Gérer les fichiers
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
            <Button size="sm" variant="outline" onClick={() => setOuvert((v) => !v)}>
              {ouvert ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {ouvert ? "Fermer" : "Déposer un fichier"}
            </Button>
          </>
        }
      />

      {ouvert && (
        <div className="border-b border-hairline p-3 md:p-4">
          <Depot chantierId={chantierId} />
        </div>
      )}

      {children}
    </section>
  );
}
