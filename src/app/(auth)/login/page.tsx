import type { Metadata } from "next";
import Image from "next/image";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Connexion" };

export default function LoginPage() {
  return (
    <div className="cartouche anim-rise w-full">
      {/* Le filet des 5 signaux E/S se met sous tension à l'ouverture : la
          signature de la maison, dès l'écran de connexion. */}
      <span aria-hidden className="rule-signal anim-sweep absolute inset-x-0 top-0 z-10 h-[3px]" />

      <div className="px-8 pt-8 pb-7">
        <div className="mb-7 flex flex-col items-center text-center">
          <Image
            src="/logo_DumTools.png"
            alt="DumoTool — Groupe Fareneït"
            width={64}
            height={86}
            className="h-16 w-auto object-contain"
            priority
          />
          <h1 className="mt-4 font-display text-xl font-bold tracking-tight text-fg">
            DumTools
          </h1>
          <p className="stamp mt-1.5">Outils internes · Groupe Fareneït</p>
        </div>

        <LoginForm />
      </div>
    </div>
  );
}
