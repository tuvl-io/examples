# tuvl sandbox portal — Node orchestrator + reverse proxy + static frontend.
FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
# country lookup for visitor ids: DB-IP Lite (CC BY 4.0; credited in the page footer). Update GEO_MONTH to refresh.
ARG GEO_MONTH=2026-11
ENV GEO_MONTH=$GEO_MONTH
RUN mkdir -p geo && node -e "const https=require('https'),z=require('zlib'),fs=require('fs');https.get('https://download.db-ip.com/free/dbip-country-lite-'+process.env.GEO_MONTH+'.mmdb.gz',r=>{if(r.statusCode!==200){console.error('geo download failed',r.statusCode);process.exit(1)}r.pipe(z.createGunzip()).pipe(fs.createWriteStream('geo/country.mmdb'))})" && test -s geo/country.mmdb
COPY server.js admin.html ./
COPY lib ./lib
COPY public ./public
EXPOSE 3000
CMD ["node", "server.js"]
