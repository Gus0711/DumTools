import type { NextAuthConfig } from "next-auth";
import type { Role } from "@/generated/prisma/enums";

/* Configuration edge-safe (sans Prisma ni bcrypt) : utilisée par le middleware.
 * Le provider Credentials (accès DB) est ajouté dans auth.ts, côté Node. */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  trustHost: true,
  callbacks: {
    // Contrôle d'accès global : tout est protégé sauf /login.
    authorized({ auth, request: { nextUrl } }) {
      const connecte = !!auth?.user;
      const surLogin = nextUrl.pathname.startsWith("/login");
      if (surLogin) {
        return connecte ? Response.redirect(new URL("/", nextUrl)) : true;
      }
      return connecte; // sinon → redirection vers la page de login
    },
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.uid === "string" ? token.uid : "";
        if (token.role) session.user.role = token.role as Role;
      }
      return session;
    },
  },
  providers: [], // renseigné dans auth.ts
} satisfies NextAuthConfig;
