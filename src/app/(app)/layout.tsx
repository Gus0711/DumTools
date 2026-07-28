import { auth, signOut } from "@/auth";
import { compterMesTaches } from "@/lib/chantiers/queries";
import { Rail } from "@/components/app-shell/rail";
import { BarreMobile } from "@/components/app-shell/barre-mobile";
import { BarreChrome } from "@/components/app-shell/barre-chrome";
import { AppShellProvider } from "@/components/app-shell/shell-context";
import { FournisseurEcran } from "@/components/app-shell/contexte-ecran";
import { TransitionPage } from "@/components/app-shell/transition-page";
import { PaletteRecherche } from "@/components/recherche/palette-recherche";

/** Coquille applicative : un bâti sombre autour d'un plan de travail clair.
 *  Au bureau, ce bâti est un rail d'icônes à gauche ; au téléphone, une barre
 *  d'onglets en bas — à portée de pouce, et sans manger la largeur. */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";
  const nom = session?.user?.name ?? session?.user?.email ?? "Utilisateur";
  const role = isAdmin ? "Administrateur" : "Membre";
  // Pastille « mes tâches » : savoir qu'il y a quelque chose à faire sans
  // avoir à ouvrir la page.
  const nbTaches = session?.user?.id ? await compterMesTaches(session.user.id) : 0;

  async function deconnexion() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <AppShellProvider>
      <FournisseurEcran>
        <div className="flex h-screen overflow-hidden">
          <Rail isAdmin={isAdmin} nbTaches={nbTaches} />
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <BarreChrome nom={nom} role={role} onDeconnexion={deconnexion} />
            {/* Le plan de travail est une surface unie, légèrement creusée :
                les blocs blancs s'y posent comme des feuilles sur un établi.
                La réserve en bas laisse passer la barre d'onglets du téléphone. */}
            <main className="flex-1 overflow-auto pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0">
              <TransitionPage>{children}</TransitionPage>
            </main>
          </div>
        </div>

        <BarreMobile isAdmin={isAdmin} nbTaches={nbTaches} onDeconnexion={deconnexion} />

        {/* Recherche globale (⌘K) — montée une fois pour toute l'app. */}
        <PaletteRecherche />
      </FournisseurEcran>
    </AppShellProvider>
  );
}
