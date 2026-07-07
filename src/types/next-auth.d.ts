import type { DefaultSession } from "next-auth";
import type { Role } from "@/generated/prisma/enums";

/* Étend la session/JWT avec l'id et le rôle de l'utilisateur. */
declare module "next-auth" {
  interface User {
    role?: Role;
  }
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    role?: Role;
  }
}
