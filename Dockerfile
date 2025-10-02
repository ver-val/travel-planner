# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=development

RUN apk add --no-cache bash

COPY package*.json ./
RUN npm ci

# ---------------- Development ----------------
FROM base AS development
ENV NODE_ENV=development
COPY . .
CMD ["npm", "run", "start:dev"]

# ---------------- Build ----------------
FROM base AS build
ENV NODE_ENV=production
COPY . .
RUN npm run build

# ---------------- Production ----------------
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY --from=base /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./
COPY --from=build /app/ormconfig.ts ./ormconfig.ts
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/tsconfig*.json ./
COPY --from=build /app/src ./src

EXPOSE 3000
CMD ["sh", "-c", "npm run build && npm run migration:run && npm run start"]
