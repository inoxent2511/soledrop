# Sole Drop storefront — production image (Next.js standalone output, docs/DEPLOYMENT-RUNBOOK.md).
# Build:  docker build -t soledrop --build-arg NEXT_PUBLIC_SITE_URL=https://example.com .
# Run:    docker run -p 3000:3000 --env-file .env.production soledrop

FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@12.16.1 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Public values are inlined into the browser bundle, so they are build arguments, not runtime env.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_DEFAULT_CURRENCY=PKR
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_DEFAULT_CURRENCY=$NEXT_PUBLIC_DEFAULT_CURRENCY \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm build:standalone

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
