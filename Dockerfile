FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
RUN mkdir -p /app/data && chown -R node:node /app
USER node
VOLUME ["/app/data"]
HEALTHCHECK --interval=1m --timeout=10s --start-period=3m --retries=3 CMD ["node", "src/healthcheck.js"]
CMD ["node", "src/main.js"]
