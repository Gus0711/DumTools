# syntax=docker/dockerfile:1

# ------------------------------------------------------------------ deps
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Sans scripts : "prisma generate" (postinstall) a besoin du schéma, copié plus tard.
RUN npm ci --ignore-scripts

# --------------------------------------------------------------- builder
FROM node:24-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------------------------------------------------------------- runner
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# Sortie standalone : server.js + node_modules tracés uniquement.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Points de montage des volumes persistants (spool kDrive + médias des outils).
# Créés ET chown ICI, avant le USER : quand Docker monte un volume nommé sur un
# chemin qui EXISTE dans l'image, il en recopie l'ownership. Sur un chemin
# absent, il crée le dossier en root:root → l'app (utilisateur nextjs) ne peut
# plus rien y écrire (EACCES silencieux à l'upload).
# Tout nouveau volume déclaré dans docker-compose.yml doit être listé ici.
RUN mkdir -p /data/spool /data/visites-media /data/notes-media /data/wiki-media \
             /data/formulaires-media \
 && chown -R nextjs:nodejs /data

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
