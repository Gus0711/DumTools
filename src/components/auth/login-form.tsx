"use client";

import { useActionState } from "react";
import { AlertCircle, LogIn } from "lucide-react";
import { authenticate } from "@/app/(auth)/login/actions";
import { Button, Input, Label } from "@/ui";

export function LoginForm() {
  const [errorMessage, formAction, isPending] = useActionState(
    authenticate,
    undefined,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          placeholder="prenom.nom@dumortier02.fr"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Mot de passe</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      {errorMessage && (
        <p className="flex items-center gap-2 text-sm text-danger">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {errorMessage}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={isPending}>
        <LogIn className="h-4 w-4" />
        {isPending ? "Connexion…" : "Se connecter"}
      </Button>
    </form>
  );
}
