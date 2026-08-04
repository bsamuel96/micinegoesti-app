FROM node:22-alpine AS build

WORKDIR /app
COPY package.json ./
COPY server/package.json server/package.json
RUN npm install --workspace server

COPY server server
COPY feedback feedback
RUN npm run db:generate --workspace server
RUN npm run build --workspace server

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
COPY server/package.json server/package.json
RUN npm install --omit=dev --workspace server
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/prisma server/prisma
COPY --from=build /app/feedback feedback

EXPOSE 4000
CMD ["sh", "-c", "npm run db:push --workspace server && npm run db:seed --workspace server && npm run start --workspace server"]
