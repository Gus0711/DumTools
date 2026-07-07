import type { Metadata } from "next";
import Image from "next/image";
import { LoginForm } from "@/components/auth/login-form";
import { Card } from "@/ui";

export const metadata: Metadata = { title: "Connexion" };

export default function LoginPage() {
  return (
    <Card className="w-full max-w-sm p-8">
      <div className="mb-6 flex flex-col items-center text-center">
        <Image
          src="/logo-dumortier.png"
          alt="Dumortier — Groupe Fareneït"
          width={64}
          height={86}
          className="h-16 w-auto object-contain"
          priority
        />
        <h1 className="mt-4 text-lg font-bold tracking-tight text-fg">
          DumTools
        </h1>
        <p className="text-sm text-muted">Outils internes · Groupe Fareneït</p>
      </div>

      <LoginForm />
    </Card>
  );
}
