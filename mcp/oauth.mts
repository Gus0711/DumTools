// Couche OAuth 2.1 du serveur MCP HTTP — pour « Ajouter un connecteur
// personnalisé » dans Claude Desktop / claude.ai (qui exige le flux OAuth du
// spec MCP : découverte, enregistrement dynamique, code + PKCE).
//
// Identité = le compte DumTools : la page /authorize demande email + mot de
// passe (bcrypt, comptes actifs seulement), puis chaque appareil reçoit SON
// jeton d'accès (table McpToken, hash SHA-256 uniquement, révocation = DELETE).
// Le jeton « legacy » User.mcpTokenHash (scripts/mcp-token.mts) reste accepté
// sur /mcp pour les ponts mcp-remote existants.
//
// Stockages : clients OAuth (DCR) → fichier mcp/.oauth-clients.json (survit au
// redémarrage, Claude garde son client_id) ; codes d'autorisation → mémoire
// (10 min, usage unique) ; jetons d'accès → Postgres.
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as attendre } from "node:timers/promises";
import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { InvalidGrantError, InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { prisma } from "../src/lib/db";

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

/* --- Clients OAuth (enregistrement dynamique), persistés sur disque ---------- */

class ClientsStoreFichier implements OAuthRegisteredClientsStore {
  private clients = new Map<string, OAuthClientInformationFull>();

  constructor(private chemin: string) {
    if (existsSync(chemin)) {
      try {
        const data = JSON.parse(readFileSync(chemin, "utf8")) as OAuthClientInformationFull[];
        for (const c of data) this.clients.set(c.client_id, c);
      } catch {
        /* fichier corrompu → repartir vide (les clients se ré-enregistrent) */
      }
    }
  }

  private sauver() {
    writeFileSync(this.chemin, JSON.stringify([...this.clients.values()], null, 2));
  }

  getClient(clientId: string) {
    return this.clients.get(clientId);
  }

  registerClient(client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">) {
    // Le handler du SDK fournit déjà client_id/secret ; on tolère les deux cas.
    const brut = client as OAuthClientInformationFull;
    const info: OAuthClientInformationFull = {
      ...brut,
      client_id: brut.client_id ?? randomBytes(16).toString("base64url"),
      client_id_issued_at: brut.client_id_issued_at ?? Math.floor(Date.now() / 1000),
    };
    this.clients.set(info.client_id, info);
    this.sauver();
    return info;
  }
}

/* --- Codes d'autorisation (mémoire, usage unique, 10 min) --------------------- */

interface CodeEnAttente {
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  userId: string;
  expireA: number;
}

const codes = new Map<string, CodeEnAttente>();

function purgerCodes() {
  const maintenant = Date.now();
  for (const [c, e] of codes) if (e.expireA < maintenant) codes.delete(c);
}

/* --- Page de connexion (HTML autonome, français, sans asset externe) ---------- */

const htmlEchapper = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function pageConnexion(champs: Record<string, string>, erreur?: string): string {
  const caches = Object.entries(champs)
    .map(([k, v]) => `<input type="hidden" name="${htmlEchapper(k)}" value="${htmlEchapper(v)}">`)
    .join("\n      ");
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>DumTools — Autoriser l'accès MCP</title>
  <style>
    :root { color-scheme: light dark; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center;
           font-family: system-ui, sans-serif; background: #101d2c; color: #e8eef5; }
    .carte { width: min(92vw, 380px); background: #16283c; border: 1px solid #2b4258;
             border-radius: 12px; padding: 28px; }
    h1 { font-size: 1.05rem; margin: 0 0 4px; }
    p  { margin: 0 0 18px; font-size: .85rem; color: #9db2c7; }
    label { display: block; font-size: .8rem; margin: 12px 0 4px; color: #c3d2e0; }
    input[type=email], input[type=password] {
      width: 100%; box-sizing: border-box; padding: 9px 10px; border-radius: 8px;
      border: 1px solid #2b4258; background: #101d2c; color: #e8eef5; font-size: .95rem; }
    button { width: 100%; margin-top: 18px; padding: 10px; border: 0; border-radius: 8px;
             background: #ee7d1b; color: #16202b; font-weight: 700; font-size: .95rem; cursor: pointer; }
    .erreur { margin: 0 0 12px; padding: 8px 10px; border-radius: 8px; font-size: .82rem;
              background: #3a1d1d; border: 1px solid #6e2b2b; color: #ffb4b4; }
  </style>
</head>
<body>
  <main class="carte">
    <h1>DumTools — accès MCP</h1>
    <p>Une application demande l'accès à DumTools en votre nom.
       Connectez-vous avec votre compte DumTools pour autoriser.</p>
    ${erreur ? `<div class="erreur">${htmlEchapper(erreur)}</div>` : ""}
    <form method="post" action="/connexion-mcp">
      ${caches}
      <label for="email">E-mail</label>
      <input id="email" name="email" type="email" required autofocus autocomplete="username">
      <label for="password">Mot de passe</label>
      <input id="password" name="password" type="password" required autocomplete="current-password">
      <button type="submit">Autoriser l'accès</button>
    </form>
  </main>
</body>
</html>`;
}

/* --- Fournisseur OAuth --------------------------------------------------------- */

export function creerFournisseurOAuth(): OAuthServerProvider & {
  gererConnexion: (req: Request, res: Response) => Promise<void>;
} {
  const clientsStore = new ClientsStoreFichier(join(process.cwd(), "mcp", ".oauth-clients.json"));

  return {
    get clientsStore() {
      return clientsStore;
    },

    /** Étape navigateur : rend la page de connexion (les paramètres OAuth
     *  voyagent en champs cachés et sont RE-validés au POST). */
    async authorize(client, params: AuthorizationParams, res) {
      res
        .status(200)
        .type("html")
        .send(
          pageConnexion({
            client_id: client.client_id,
            redirect_uri: params.redirectUri,
            code_challenge: params.codeChallenge,
            ...(params.state ? { state: params.state } : {}),
          }),
        );
    },

    async challengeForAuthorizationCode(client, authorizationCode) {
      purgerCodes();
      const entree = codes.get(authorizationCode);
      if (!entree || entree.clientId !== client.client_id) {
        throw new InvalidGrantError("Code d'autorisation invalide ou expiré.");
      }
      return entree.codeChallenge;
    },

    async exchangeAuthorizationCode(client, authorizationCode, _codeVerifier, redirectUri) {
      purgerCodes();
      const entree = codes.get(authorizationCode);
      if (!entree || entree.clientId !== client.client_id) {
        throw new InvalidGrantError("Code d'autorisation invalide ou expiré.");
      }
      if (redirectUri && redirectUri !== entree.redirectUri) {
        throw new InvalidGrantError("redirect_uri différent de celui de l'autorisation.");
      }
      codes.delete(authorizationCode); // usage unique

      const jeton = "dmt_" + randomBytes(32).toString("base64url");
      await prisma.mcpToken.create({
        data: {
          tokenHash: sha256(jeton),
          userId: entree.userId,
          client: client.client_name ?? client.client_id,
        },
      });
      // Jeton longue durée, pas de refresh : la révocation se fait côté serveur
      // (suppression de la ligne McpToken) ou par désactivation du compte.
      return { access_token: jeton, token_type: "bearer" } satisfies OAuthTokens;
    },

    async exchangeRefreshToken(): Promise<OAuthTokens> {
      throw new InvalidGrantError("refresh_token non supporté — refaire l'autorisation.");
    },

    async verifyAccessToken(token): Promise<AuthInfo> {
      const hash = sha256(token);
      const t = await prisma.mcpToken.findUnique({
        where: { tokenHash: hash },
        select: { id: true, client: true, user: { select: { actif: true } } },
      });
      if (t?.user.actif) {
        prisma.mcpToken
          .update({ where: { id: t.id }, data: { lastUsedAt: new Date() } })
          .catch(() => {});
        return { token, clientId: t.client || "dumtools", scopes: [] };
      }
      // Jeton « legacy » (scripts/mcp-token.mts) — toujours accepté.
      const u = await prisma.user.findUnique({
        where: { mcpTokenHash: hash },
        select: { actif: true },
      });
      if (u?.actif) return { token, clientId: "jeton-personnel", scopes: [] };
      throw new InvalidTokenError("Jeton d'accès invalide ou révoqué.");
    },

    async revokeToken(_client, request: OAuthTokenRevocationRequest) {
      await prisma.mcpToken.deleteMany({ where: { tokenHash: sha256(request.token) } });
    },

    /** POST /connexion-mcp : valide le compte DumTools puis redirige avec le code. */
    async gererConnexion(req, res) {
      const b = (req.body ?? {}) as Record<string, string>;
      const { email, password, client_id, redirect_uri, code_challenge, state } = b;

      // Re-validation stricte des paramètres OAuth (jamais confiance aux champs cachés).
      const client = clientsStore.getClient(client_id ?? "");
      if (!client || !code_challenge || !client.redirect_uris.includes(redirect_uri)) {
        res.status(400).type("html").send(pageConnexion({}, "Demande d'autorisation invalide — relancez la connexion depuis l'application."));
        return;
      }
      const rejouer = (erreur: string) =>
        res.status(401).type("html").send(
          pageConnexion(
            { client_id, redirect_uri, code_challenge, ...(state ? { state } : {}) },
            erreur,
          ),
        );

      const user = await prisma.user.findUnique({
        where: { email: (email ?? "").trim().toLowerCase() },
        select: { id: true, actif: true, passwordHash: true },
      });
      const valide = user?.actif && (await bcrypt.compare(password ?? "", user.passwordHash));
      if (!valide) {
        await attendre(400); // freine la force brute
        rejouer("E-mail ou mot de passe incorrect.");
        return;
      }

      const code = randomBytes(24).toString("base64url");
      codes.set(code, {
        clientId: client.client_id,
        codeChallenge: code_challenge,
        redirectUri: redirect_uri,
        userId: user!.id,
        expireA: Date.now() + 10 * 60 * 1000,
      });

      const cible = new URL(redirect_uri);
      cible.searchParams.set("code", code);
      if (state) cible.searchParams.set("state", state);
      res.redirect(cible.toString());
    },
  };
}
