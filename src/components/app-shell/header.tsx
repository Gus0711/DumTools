import { LogOut, UserCircle2 } from "lucide-react";
import { auth, signOut } from "@/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { BoutonRecherche } from "@/components/recherche/bouton-recherche";
import { MobileMenuButton } from "./mobile-menu-button";

/** Barre supérieure : recherche globale + thème + utilisateur + déconnexion. */
export async function Header() {
  const session = await auth();
  const nom = session?.user?.name ?? session?.user?.email ?? "Utilisateur";

  return (
    <header className="flex h-14 shrink-0 items-center justify-end gap-1.5 border-b border-border bg-surface/80 px-4 backdrop-blur">
      {/* Ouverture du tiroir de navigation (mobile). Repousse le reste à droite. */}
      <MobileMenuButton />

      <BoutonRecherche />

      <ThemeToggle />

      <div className="ml-1 flex items-center gap-2 rounded-full border border-border bg-surface-2 py-1 pl-2 pr-3 text-sm text-muted">
        <UserCircle2 className="h-5 w-5 text-brand" />
        <span className="hidden max-w-[16ch] truncate font-medium text-fg sm:inline">
          {nom}
        </span>
      </div>

      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <button
          type="submit"
          aria-label="Se déconnecter"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <LogOut className="h-4.5 w-4.5" />
        </button>
      </form>
    </header>
  );
}
