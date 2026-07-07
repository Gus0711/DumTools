import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Image autonome et légère pour Docker (ne copie que le nécessaire).
  output: "standalone",

  // En dev, Next bloque par défaut les requêtes cross-origin vers ses assets
  // internes (/_next, HMR…) depuis une origine autre que localhost. Sans ça,
  // depuis un autre poste du réseau local (http://192.168.1.x:3000) la page
  // s'affiche mais React ne s'hydrate pas (les onglets ne réagissent plus).
  allowedDevOrigins: ["192.168.1.97", "192.168.1.*"],
};

export default nextConfig;
