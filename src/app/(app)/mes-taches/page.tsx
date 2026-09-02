import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Cartouche } from "@/ui";
import {
  listerAffairesPourTache,
  listerClientsPourTache,
  listerDomainesTache,
  listerTachesCompletes,
} from "@/lib/chantiers/queries";
import { listerUtilisateursActifs } from "@/lib/users/queries";
import { obligations } from "@/lib/chantiers/obligations";
import { MesTachesEcran } from "@/lib/chantiers/mes-taches-ecran";

export const metadata: Metadata = { title: "Mes tâches" };

export default async function Page() {
  const session = await auth();
  // Un écran qui s'ouvre sur SES tâches : sans session il n'y a pas de « mes ».
  if (!session?.user?.id) redirect("/login");

  const [taches, aSignaler, domaines, affaires, clientsRef, utilisateurs] = await Promise.all([
    listerTachesCompletes(),
    obligations(),
    listerDomainesTache(),
    listerAffairesPourTache(),
    listerClientsPourTache(),
    listerUtilisateursActifs(),
  ]);

  return (
    <div className="mx-auto max-w-[1700px] px-4 py-5 md:px-7 md:py-7">
      <Cartouche
        estampille="Affaires"
        titre="Mes tâches"
        description="Tout ce qu'il y a à faire, écrit ou déduit. Les tâches, vous les écrivez — sur une affaire, sur un client, ou en interne. Les lignes en pointillé, personne ne les a écrites : le système les déduit (besoin matériel jamais arrêté, éléments non reliés à un produit, devis échu) et elles s'éteignent d'elles-mêmes quand leur cause disparaît."
        retour={{ href: "/affaires", label: "Retour aux affaires" }}
        className="mb-6"
      />

      <MesTachesEcran
        taches={taches}
        obligations={aSignaler}
        domaines={domaines}
        affaires={affaires}
        clientsRef={clientsRef}
        utilisateurs={utilisateurs}
        moiId={session.user.id}
      />
    </div>
  );
}
