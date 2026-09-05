# Dockerfile for Render.com Free Web Service Deployment
FROM node:20-slim

# Install yt-dlp, chromium, and Devanagari Hindi font support
RUN apt-get update && apt-get install -y \
    yt-dlp \
    chromium \
    fonts-noto-core \
    fonts-noto-extra \
    fonts-noto-ui-core \
    fonts-devg \
    && rm -rf /var/lib/apt-get/lists/*

ENV CHROME_BIN=/usr/bin/chromium
ENV PORT=3000

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
