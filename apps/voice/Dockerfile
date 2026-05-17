# Build from the repository root:
#   docker build -f apps/voice/Dockerfile -t ultravoyce-voice .
#
# Railway: set Root Directory to the repo root and Dockerfile path to apps/voice/Dockerfile

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/voice/package.json apps/voice/
RUN pnpm install --frozen-lockfile --filter=voice...

COPY apps/voice apps/voice
RUN pnpm --filter=voice deploy /prod/voice --prod

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8001

RUN addgroup -g 1001 -S nodejs && adduser -S voice -u 1001 -G nodejs

COPY --from=build --chown=voice:nodejs /prod/voice ./

USER voice
EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8001)+'/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
