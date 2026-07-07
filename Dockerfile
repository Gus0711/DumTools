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

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
