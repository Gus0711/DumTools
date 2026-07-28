import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";

/* Les polices sont exposées sous les noms de variables attendus par globals.css
 * (--font-sans-app / --font-mono-app / --font-display-app), pas en dur dans le CSS.
 *
 * Texte    : IBM Plex Sans — dessinée pour la documentation technique, grande
 *            hauteur d'x, accents français nets. C'est elle qui porte la
 *            lisibilité sur les longues journées d'écran.
 * Titres   : Archivo — grotesque de signalétique, tracking resserré : le
 *            libellé estampillé d'un cartouche de plan.
 * Repères  : IBM Plex Mono — n° Why, bornes, folios, adresses IP, horodatages.
 *            Même squelette que le texte, donc pas de rupture visuelle. */
const sans = IBM_Plex_Sans({
  variable: "--font-sans-app",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
const mono = IBM_Plex_Mono({
  variable: "--font-mono-app",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});
const display = Archivo({
  variable: "--font-display-app",
  subsets: ["latin"],
  display: "swap",
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
  themeColor: "#003765",
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
        {/* Applique le thème ET la densité mémorisés avant le premier rendu :
            sans ça, l'écran clignote (clair→sombre, compact→confort) au chargement. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=document.documentElement;var t=localStorage.getItem('dumtools-theme');if(t==='dark'||t==='light'){d.setAttribute('data-theme',t);}var n=localStorage.getItem('dumtools-density');if(n==='compact'||n==='confort'){d.setAttribute('data-density',n);}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full">
        <RegisterServiceWorker />
        {children}
      </body>
    </html>
  );
}
