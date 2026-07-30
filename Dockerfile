# syntax=docker/dockerfile:1

# Multi-stage image for the DelhiveryWay backend (Node/Express + Socket.IO).
#   target "dev"  → hot-reload via nodemon (source is bind-mounted by compose)
#   target "prod" → lean image with only runtime dependencies

FROM node:22-alpine AS base
WORKDIR /app
# Husky sets up git hooks on install; there is no .git inside the image and
# hooks are irrelevant here, so disable it to keep installs clean.
ENV HUSKY=0
COPY package*.json ./

# ---- Development: full dependency set (includes nodemon) ----
FROM base AS dev
RUN npm ci
COPY . .
RUN mkdir -p uploads
EXPOSE 5000
CMD ["npm", "run", "dev"]

# ---- Production: runtime dependencies only ----
FROM base AS prod
ENV NODE_ENV=production
RUN npm ci --omit=dev --ignore-scripts
COPY . .
RUN mkdir -p uploads
EXPOSE 5000
CMD ["node", "server.js"]
