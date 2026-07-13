"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, Plus } from "lucide-react";
import { creerProjetPourAffaire, rattacherProjetAffaire } from "./actions";
import { SelecteurAffaire, type AffaireOption } from "./selecteur-affaire";

/** Index Projet GTB : créer un automate en passant d'abord par une affaire. */
export function NouveauProjet({ affaires }: { affaires: AffaireOption[] }) {
  const [pending, start] = useTransition();
  return (
    <SelecteurAffaire
      affaires={affaires}
      pending={pending}
      triggerLabel="Nouveau projet"
      triggerIcon={<Plus className="h-4 w-4" />}
      onChoisir={(id) =>
        start(async () => {
          await creerProjetPourAffaire(id);
        })
      }
    />
  );
}

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
