"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2 } from "lucide-react";
import { rattacherProjetAffaire } from "./actions";
import { SelecteurAffaire, type AffaireOption } from "./selecteur-affaire";

/* La création d'un automate se fait UNIQUEMENT depuis la fiche Affaire
   (bouton « Ajouter un automate ») : un projet sans affaire n'a pas de sens.
   L'index Projet GTB est une vue de recherche, sans bouton de création. */

/** Éditeur : rattacher un automate orphelin à une affaire (a posteriori). */
export function RattacherAffaire({
  projetId,
  affaires,
}: {
  projetId: string;
  affaires: AffaireOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <SelecteurAffaire
      affaires={affaires}
      pending={pending}
      triggerLabel="Rattacher à une affaire"
      triggerIcon={<Link2 className="h-4 w-4" />}
      triggerVariant="outline"
      triggerSize="sm"
      align="left"
      onChoisir={(id) =>
        start(async () => {
          await rattacherProjetAffaire(projetId, id);
          router.refresh();
        })
      }
    />
  );
}
