FROM node:24-trixie-slim

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --include=dev \
  && npm install --global @openai/codex@0.166.0
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_REQUIRE_AUTH=true
ARG SOP_PREBUILT_DIST=false
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL} \
  VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY} \
  VITE_REQUIRE_AUTH=${VITE_REQUIRE_AUTH}
RUN if [ "$SOP_PREBUILT_DIST" = true ]; then test -s dist/index.html; else npx vite build; fi
RUN mkdir -p /app/data \
  && chown -R node:node /app

USER node
ENV NODE_ENV=production SOP_HOST=0.0.0.0 SOP_PORT=4317 SOP_DATA_DIR=/app/data
EXPOSE 4317
CMD ["npm", "start"]
