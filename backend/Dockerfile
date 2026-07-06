FROM node:20-alpine AS build

WORKDIR /app
RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci

COPY backend backend
RUN npm run prisma:generate --workspace=backend \
    && npm run build --workspace=backend

FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl ffmpeg

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/backend/package.json backend/package.json
COPY --from=build /app/frontend/package.json frontend/package.json
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/backend/prisma backend/prisma

USER node
EXPOSE 3001

CMD ["npm", "run", "start:docker", "--workspace=backend"]
