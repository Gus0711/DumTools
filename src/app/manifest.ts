import type { MetadataRoute } from "next";

/**
 * Manifest PWA (route metadata Next 16 → sert /manifest.webmanifest).
 * Rend DumTools installable (icône + lancement hors navigateur). L'offline réel
 * (données) est géré séparément par les îlots local-first, pas par le manifest.
 *
 * Icônes : PNG dérivés de l'emblème du logo (public/logo_DumTools.png, sans le
 * texte, illisible en petit). Les variantes « maskable » gardent l'emblème dans
 * la zone de sécurité centrale. iOS : src/app/apple-icon.png (convention Next).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DumTools — Outils internes Dumortier",
    short_name: "DumTools",
    description: "Plateforme d'outils internes du Groupe Fareneït · Dumortier (GTB).",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2b3a8f",
    lang: "fr",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
