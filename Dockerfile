FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build
RUN cp client/public/lrap-logo.jpg dist/public/ 2>/dev/null || true && \
    cp client/public/screenplay-forge-logo.svg dist/public/ 2>/dev/null || true
ENV NODE_ENV=production
EXPOSE 8080
CMD node --max-old-space-size=512 dist/index.cjs
