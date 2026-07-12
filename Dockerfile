# Build: Angular browser bundle, SSR server bundle, prerendered routes.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Run: the SSR server bundle is self-contained, so dist is all we need.
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist/nitpick ./dist/nitpick
USER node
EXPOSE 8080
CMD ["node", "dist/nitpick/server/server.mjs"]
