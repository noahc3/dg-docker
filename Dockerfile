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
ENV GITHUB_PAT=""
ENV GITHUB_USERNAME=""
ENV GITHUB_REPO=""
ENV WEBHOOK_SECRET=""

COPY scripts/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "scripts/manager.js"]
