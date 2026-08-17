# tuvl sandbox portal — Node orchestrator + reverse proxy + static frontend.
FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.js ./
COPY lib ./lib
COPY public ./public
EXPOSE 3000
CMD ["node", "server.js"]
