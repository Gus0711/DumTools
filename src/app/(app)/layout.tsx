import { auth } from "@/auth";
import { compterMesTaches } from "@/lib/chantiers/queries";
import { Sidebar } from "@/components/app-shell/sidebar";
import { Header } from "@/components/app-shell/header";
import { AppShellProvider } from "@/components/app-shell/shell-context";
import { PaletteRecherche } from "@/components/recherche/palette-recherche";

/** Coquille applicative : sidebar + header autour de chaque page d'outil.
 *  Sous 768px, la sidebar devient un tiroir piloté par le bouton du header
 *  (état partagé via AppShellProvider) ; le contenu occupe toute la largeur. */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";
  // Pastille « mes tâches » sur l'entrée Affaires : savoir qu'il y a quelque
  // chose à faire sans avoir à ouvrir la page.
  const nbTaches = session?.user?.id ? await compterMesTaches(session.user.id) : 0;
  return (
    <AppShellProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar isAdmin={isAdmin} nbTaches={nbTaches} />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
      {/* Recherche globale (⌘K) — montée une fois pour toute l'app. */}
      <PaletteRecherche />
    </AppShellProvider>
  );
}
