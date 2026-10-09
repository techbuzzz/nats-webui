# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1 — install dependencies (full tree, needed for the Nuxt build)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps

WORKDIR /app

# Proxy variables are intentionally not forwarded: the host environment sets
# HTTP_PROXY/HTTPS_PROXY, and letting them leak into the build breaks npm.
ENV HTTP_PROXY="" \
    HTTPS_PROXY="" \
    http_proxy="" \
    https_proxy="" \
    NO_PROXY="*" \
    no_proxy="*"

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------------------------------------------------------------------------
# Stage 2 — build the Nuxt/Nitro output
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app
ENV HTTP_PROXY="" HTTPS_PROXY="" http_proxy="" https_proxy="" NO_PROXY="*" no_proxy="*"

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ---------------------------------------------------------------------------
# Stage 3 — runtime: only the Nitro server output, no toolchain, no sources
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    NITRO_PORT=3000 \
    NITRO_HOST=0.0.0.0

# Run as the unprivileged user shipped with the node image.
COPY --from=build --chown=node:node /app/.output ./.output

USER node

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.NITRO_PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]