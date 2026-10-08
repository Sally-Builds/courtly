# One multi-stage build for the whole monorepo: shared lockfile, shared package built once.

# ---- dependencies (cached until a package.json / lockfile changes) ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund

# ---- build shared, api and web ----
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/web apps/web
RUN npm run build

# ---- backend test runner (used by the `api-test` compose service) ----
FROM build AS test
CMD ["npm", "test", "-w", "@courtly/api"]

# ---- api runtime: compiled JS + production dependencies only ----
FROM build AS api-pruned
RUN npm prune --omit=dev --no-audit --no-fund \
 && rm -rf apps/web packages/shared/src apps/api/src apps/api/test

FROM node:24-alpine AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=api-pruned /app /app
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]

# ---- web: static SPA served by nginx, which also proxies /api to the api service ----
FROM nginx:1.27-alpine AS web
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
