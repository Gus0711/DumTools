import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Convention Next 16 : fichier "proxy" (ex-"middleware").
// N'utilise que la config edge-safe (pas de Prisma/bcrypt).
export default NextAuth(authConfig).auth;

export const config = {
  // Protège tout sauf l'API d'auth, les assets Next et le logo public.
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|logo-dumortier.png|logo_DumTools.png|materiel/|gfx-templates/|pdf.worker).*)",
  ],
};
