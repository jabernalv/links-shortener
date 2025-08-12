FROM node:20-alpine AS base

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8085 \
    SESSION_SECRET=please-change

RUN apk add --no-cache python3 make g++

COPY package*.json ./

# Dependencias para compilar native (better-sqlite3) y tailwind build
RUN apk add --no-cache python3 make g++

FROM base AS deps
ENV NODE_ENV=development
RUN npm ci --include=dev || npm install --include=dev

FROM deps AS builder
COPY tailwind.config.js postcss.config.js ./
COPY src/styles ./src/styles
COPY src/views ./src/views
RUN npx tailwindcss -c tailwind.config.js -i src/styles/input.css -o src/public/style.css --minify

FROM deps AS runtime
ENV NODE_ENV=production \
    PORT=8085 \
    SESSION_SECRET=please-change
COPY src ./src
COPY --from=builder /app/src/public/style.css ./src/public/style.css
RUN mkdir -p /app/data && npm prune --omit=dev
VOLUME ["/app/data"]
EXPOSE 8085
CMD ["npm", "start"]


