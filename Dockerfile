# Obraz on-premise: frontend (build) + API w jednym kontenerze, bez dostępu do Internetu w runtime.
FROM node:22-alpine AS build
WORKDIR /app
COPY client/package*.json client/
RUN npm --prefix client ci
COPY client client
RUN npm --prefix client run build

FROM node:22-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DB_FILE=/data/udipilot.db
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server server
COPY --from=build /app/client/dist client/dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
CMD ["sh", "-c", "[ -f /data/udipilot.db ] || node server/seed.js; exec node server/index.js"]
