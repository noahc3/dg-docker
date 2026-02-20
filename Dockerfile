FROM node:22-alpine

# Install nginx and git
RUN apk add --no-cache nginx git

# Create app directory
WORKDIR /app

# Copy manager scripts
COPY scripts/package.json ./scripts/
RUN cd scripts && npm install

COPY scripts/manager.js ./scripts/
COPY nginx.conf /etc/nginx/nginx.conf

# Setup web root
RUN mkdir -p /var/www/html && chown -R node:node /var/www/html

# The manager will run as root because it needs to start nginx and write to /var/www/html
# (In a production environment, we might want to be more restrictive, but for this automation it's cleaner)

EXPOSE 80

# Environment variables with defaults
ENV MANAGER_PORT=3000
ENV REPO_URL=""
ENV GITHUB_PAT=""
ENV GITHUB_USERNAME=""
ENV GITHUB_REPO=""
ENV WEBHOOK_SECRET=""

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

ENTRYPOINT ["node", "scripts/manager.js"]
