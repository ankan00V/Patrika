# Build context: repository root (npm workspaces share one lockfile).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --workspace backend
COPY backend/ backend/
RUN npm run build --workspace backend

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --omit=dev --workspace backend && npm cache clean --force
COPY --from=build /app/backend/dist backend/dist
COPY backend/drizzle backend/drizzle
WORKDIR /app/backend
USER node
EXPOSE 4000
# The same image runs the worker with: node dist/worker.js
CMD ["node", "dist/api.js"]
