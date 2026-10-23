# Build context: repository root (npm workspaces share one lockfile).
FROM node:22-alpine
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --workspace frontend
COPY frontend/ frontend/
# Rewrites are baked in at build time; in production Caddy also routes /api straight to the API.
ARG BACKEND_URL=http://api:4000
ENV BACKEND_URL=$BACKEND_URL
RUN npm run build --workspace frontend
ENV NODE_ENV=production
WORKDIR /app/frontend
USER node
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
