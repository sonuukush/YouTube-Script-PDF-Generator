# Dockerfile for Render.com Free Web Service Deployment
FROM node:20-slim

# Install dependencies, curl, python3, chromium, and Devanagari Hindi font support
RUN apt-get update && apt-get install -y \
    curl \
    python3 \
    chromium \
    fonts-noto-core \
    fonts-noto-extra \
    fonts-noto-ui-core \
    fonts-deva \
    fonts-gargi \
    fonts-indic \
    && rm -rf /var/lib/apt-get/lists/*

# Install LATEST yt-dlp binary directly from GitHub releases
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

ENV CHROME_BIN=/usr/bin/chromium
ENV PORT=3000

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
