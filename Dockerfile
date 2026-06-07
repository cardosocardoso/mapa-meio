# Multi-stage build for the Node app. The frontend is built and the GeoNames geo.db is
# baked in, so the runtime image is fully self-contained (only Valhalla is external).

# ---- builder: install everything, build frontend + geo.db ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
# npm install (not ci) so platform-specific native optional deps (rolldown/better-sqlite3)
# resolve correctly when building on a different OS/arch than the lockfile was made on.
RUN npm install
COPY . .
RUN npm run build && npm run build:geo

# ---- runtime: prod deps only + built assets ----
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY server ./server
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/data/geo.db ./data/geo.db
EXPOSE 3000
CMD ["node", "server/index.mjs"]
