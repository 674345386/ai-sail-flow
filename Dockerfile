FROM node:24-bookworm-slim

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --include=dev
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_REQUIRE_AUTH=true
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL} \
  VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY} \
  VITE_REQUIRE_AUTH=${VITE_REQUIRE_AUTH}
RUN npm run build \
  && mkdir -p /app/data \
  && chown -R node:node /app

USER node
ENV NODE_ENV=production SOP_HOST=0.0.0.0 SOP_PORT=4317 SOP_DATA_DIR=/app/data
EXPOSE 4317
CMD ["npm", "start"]
