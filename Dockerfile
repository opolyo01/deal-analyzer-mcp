FROM node:20 AS build

WORKDIR /app

COPY package*.json ./
COPY client/package*.json ./client/
RUN npm ci && npm --prefix client ci

COPY . .
RUN npm run build

FROM node:20 AS runtime

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/client-dist ./client-dist
COPY --from=build /app/public ./public

CMD ["node", "dist/server.js"]
