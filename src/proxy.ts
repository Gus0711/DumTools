import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Convention Next 16 : fichier "proxy" (ex-"middleware").
// N'utilise que la config edge-safe (pas de Prisma/bcrypt).
export default NextAuth(authConfig).auth;

export const config = {
  // Protège tout sauf l'API d'auth, les assets Next et le logo public.
  // ⚠️ n/ et api/public/ = partage PUBLIC de notes (lecture seule par jeton
  // non devinable) : l'app étant exposée sur internet, tout ajout ici est
  // accessible au monde entier — n'exclure que des routes conçues pour.
  matcher: [
    "/((?!api/auth|api/documents/drain|api/public/|n/|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|icon-|apple-icon|logo-dumortier.png|logo_DumTools.png|materiel/|gfx-templates/|pdf.worker).*)",
  ],
};
