"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

/** Server action de connexion. Renvoie un message d'erreur, ou redirige. */
export async function authenticate(
  _prev: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return "Email ou mot de passe incorrect.";
    }
    throw error; // laisse passer la redirection interne de Next
  }
}
