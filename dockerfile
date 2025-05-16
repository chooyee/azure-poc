FROM node:20-alpine3.17 as build-env

COPY . /app
WORKDIR /app

RUN npm ci --omit=dev

FROM gcr.io/distroless/nodejs20-debian11
COPY --from=build-env /app /app
WORKDIR /app

EXPOSE 8080

ENV NODE_ENV=prod
CMD ["server.js"]