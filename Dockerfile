# Railway builds the Discord bot from this file. Nixpacks kept installing
# two Node versions side by side (bun.lock at the repo root pulls in bun and
# the default nodejs next to nodejs_20), so the bot gets a plain Node 20 image.
FROM node:20-slim

WORKDIR /app/public/spotbot
COPY public/spotbot/package.json ./
RUN npm install --omit=dev
COPY public/spotbot/ ./

WORKDIR /app
CMD ["node", "public/spotbot/index.cjs"]
