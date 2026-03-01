FROM node:22-alpine

# Install git and wget
RUN apk add --no-cache git wget

# Create app directory
WORKDIR /app

# Copy manager scripts
COPY scripts/package.json ./scripts/
RUN cd scripts && npm install

COPY scripts/manager.js ./scripts/

# Environment variables with defaults
ENV MANAGER_PORT=3000
ENV SERVE_DIR=/var/www/html
ENV START_NGINX=false
ENV GITHUB_PAT=""
ENV GITHUB_USERNAME=""
ENV GITHUB_REPO=""
ENV WEBHOOK_SECRET=""

# Setup web root
RUN mkdir -p ${SERVE_DIR} && chown -R node:node ${SERVE_DIR}

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

ENTRYPOINT ["node", "scripts/manager.js"]
