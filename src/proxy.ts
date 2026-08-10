import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Convention Next 16 : fichier "proxy" (ex-"middleware").
// N'utilise que la config edge-safe (pas de Prisma/bcrypt).
export default NextAuth(authConfig).auth;

export const config = {
  // Protège tout sauf l'API d'auth, les assets Next et le logo public.
  // ⚠️ n/, w/, d/ et api/public/ = partage PUBLIC par jeton non devinable, en
  // lecture seule (n/ = note, w/ = page de wiki, d/ = devis envoyé au client ;
  // les trois sont temporaires). L'app étant exposée sur internet, tout ajout
  // ici est accessible au monde entier — n'exclure que des routes conçues pour,
  // et qui valident le jeton ET son échéance côté serveur (partageActif,
  // cf. src/lib/partage/model.ts).
  matcher: [
    "/((?!api/auth|api/documents/drain|api/public/|n/|w/|d/|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|icon-|apple-icon|logo-dumortier.png|logo_DumTools.png|materiel/|gfx-templates/|pdf.worker).*)",
  ],
};
