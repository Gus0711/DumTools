import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

/* Les polices sont exposées sous les noms de variables attendus par globals.css
 * (--font-sans-app / --font-mono-app), pas en dur dans le CSS. */
const sans = Geist({ variable: "--font-sans-app", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono-app", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "DumTools — Outils internes Dumortier",
    template: "%s · DumTools",
  },
  description:
    "Plateforme d'outils internes du Groupe Fareneït · Dumortier (GTB).",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable} h-full`}
    >
      <head>
        {/* Applique le thème mémorisé avant le premier rendu (anti-flash). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('dumtools-theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
