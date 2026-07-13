import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

/* Les polices sont exposées sous les noms de variables attendus par globals.css
 * (--font-sans-app / --font-mono-app / --font-display-app), pas en dur dans le CSS.
 * Sans/mono : Geist (UI & données). Affichage : Space Grotesk (titres — caractère
 * « technique / dessin industriel », employé avec retenue). */
const sans = Geist({ variable: "--font-sans-app", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono-app", subsets: ["latin"] });
const display = Space_Grotesk({
  variable: "--font-display-app",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "DumTools — Outils internes Dumortier",
    template: "%s · DumTools",
  },
  description:
    "Plateforme d'outils internes du Groupe Fareneït · Dumortier (GTB).",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable} ${display.variable} h-full`}
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
