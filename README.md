# Digital Garden Self-Hosting Docker

This Docker setup automates the process of self-hosting your Obsidian Digital Garden. It handles cloning your repository, building the static site using Eleventy, and serving it via Nginx. It also includes a webhook listener for automatic updates whenever you push changes to your GitHub repository.

## Features

- **Automated Setup**: Clones and builds your Digital Garden on startup.
- **Nginx Powered**: High-performance serving of static content.
- **GitHub Webhooks**: Automatically pulls and rebuilds your site when you push to GitHub.
- **Lightweight**: Based on Alpine Linux.
- **Self-Healing**: Docker Compose configured to restart automatically.

## Getting Started

### 1. Prerequisites

- Docker and Docker Compose installed.
- A GitHub Personal Access Token (PAT) with `repo` scope.
- A GitHub repository containing your Digital Garden source (usually created by the Obsidian Digital Garden plugin).

### 2. Configuration

Create a `.env` file in the same directory as `docker-compose.yml` with the following variables:

```env
GITHUB_USERNAME=your-github-username
GITHUB_REPO=your-garden-repo-name
GITHUB_PAT=your-github-personal-access-token
WEBHOOK_SECRET=a-secure-random-secret
```

### 3. Launch

Run the following command to build and start the container:

```bash
docker compose up -d
```

### 4. Setup GitHub Webhook

Once the container is running, you need to configure the webhook in GitHub for automatic updates:

1.  Go to your repository on GitHub.
2.  Navigate to **Settings** > **Webhooks**.
3.  Click **Add webhook**.
4.  **Payload URL**: `http://your-server-ip/webhook`
5.  **Content type**: `application/json`
6.  **Secret**: The value you set for `WEBHOOK_SECRET`.
7.  **Events**: Select "Just the push event."
8.  Click **Add webhook**.

### Monitoring

You can check the logs to see the build progress and webhook status:

```bash
docker compose logs -f
```

## How it Works

The container runs a small Node.js manager script that:
1.  Clones your repository using the PAT.
2.  Runs `npm install` and `npm run build`.
3.  Copies the generated static files to the Nginx web root.
4.  Starts Nginx.
5.  Listens for incoming GitHub push webhooks to trigger a rebuild.

## Security Note

Your `GITHUB_PAT` is used to clone the repository. Ensure your `.env` file is kept secure and not committed to any public repositories.
