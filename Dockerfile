# Railway builds the Discord bot from this file. Nixpacks kept installing
# two Node versions side by side (bun.lock at the repo root pulls in bun and
# the default nodejs next to nodejs_20), so the bot gets a plain Node 22 image. Node 22 is required: current
# @supabase/supabase-js needs the built-in WebSocket that Node 20 lacks.
FROM node:22-slim

WORKDIR /app/public/spotbot
COPY public/spotbot/package.json ./
RUN npm install --omit=dev
COPY public/spotbot/ ./

WORKDIR /app
CMD ["node", "public/spotbot/index.cjs"]
