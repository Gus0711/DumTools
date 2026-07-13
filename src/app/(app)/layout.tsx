import { auth } from "@/auth";
import { Sidebar } from "@/components/app-shell/sidebar";
import { Header } from "@/components/app-shell/header";
import { AppShellProvider } from "@/components/app-shell/shell-context";

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
  return (
    <AppShellProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar isAdmin={isAdmin} />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </AppShellProvider>
  );
}
