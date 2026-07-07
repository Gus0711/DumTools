import { LogOut, UserCircle2 } from "lucide-react";
import { auth, signOut } from "@/auth";
import { ThemeToggle } from "@/components/theme-toggle";

/** Barre supérieure : thème + utilisateur connecté + déconnexion. */
export async function Header() {
  const session = await auth();
  const nom = session?.user?.name ?? session?.user?.email ?? "Utilisateur";

  return (
    <header className="flex h-14 shrink-0 items-center justify-end gap-1 border-b border-border bg-surface px-4">
      <ThemeToggle />

      <div className="ml-1 flex items-center gap-2 px-2 text-sm text-muted">
        <UserCircle2 className="h-5 w-5" />
        <span className="hidden max-w-[16ch] truncate sm:inline">{nom}</span>
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
