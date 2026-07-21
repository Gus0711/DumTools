import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Image autonome et légère pour Docker (ne copie que le nécessaire).
  output: "standalone",

  // Les server actions plafonnent le corps de requête à 1 Mo par défaut : une
  // note portant un bloc « Page HTML embarquée » volumineux (rapport généré…)
  // dépasse vite → 500 à chaque autosave. On relève la limite (le document
  // entier transite à chaque save). Contrepartie assumée : l'app étant exposée
  // via le tunnel, n'importe qui peut poster un corps de cette taille sur
  // /login — c'est du parsing en mémoire, pas un stockage.
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },

  // Les gabarits Excel des notes de frais sont lus sur le disque au moment de
  // l'export (ExcelJS charge le classeur puis le réécrit rempli). Le tracing ne
  // les voit pas — ce n'est pas un `import`, juste un readFile — donc sans cette
  // ligne ils manquent dans la sortie standalone et l'export casse en prod
  // uniquement. Glob résolu depuis la racine du projet.
  outputFileTracingIncludes: {
    "/api/ndf/**": ["./src/tools/notes-de-frais/modeles/**"],
  },

  // En dev, Next bloque par défaut les requêtes cross-origin vers ses assets
  // internes (/_next, HMR…) depuis une origine autre que localhost. Sans ça,
  // depuis un autre poste du réseau local (http://192.168.1.x:3000) OU via le
  // tunnel Cloudflare (https://dumtools.datagtb.com), la page s'affiche mais
  // React ne s'hydrate pas (les onglets ne réagissent plus).
  allowedDevOrigins: ["192.168.1.97", "192.168.1.*", "dumtools.datagtb.com"],
};

export default nextConfig;
