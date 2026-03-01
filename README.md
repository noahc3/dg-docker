# Digital Garden Self-Hosting Docker

A self-hosting alternative to Vercel/Netlify for notes published with the [Obsidian Digital Garden plugin](https://dg-docs.ole.dev/). The plugin lets you publish notes from Obsidian to a GitHub repository as a static site; this container clones that repository, builds it with Eleventy, and serves it with Nginx — automatically rebuilding whenever you push new notes.

## Features

- **Automated Setup**: Clones and builds your Digital Garden on startup.
- **Nginx Powered**: High-performance serving of static content.
- **GitHub Webhooks**: Automatically pulls and rebuilds your site when you push to GitHub.
- **Lightweight**: Based on Alpine Linux.
- **Self-Healing**: Docker Compose configured to restart automatically.

## Getting Started

### 1. Prerequisites

- A GitHub repository containing your Digital Garden source with the plugin setup in Obsidian (see the [Digital Garden plugin docs](https://dg-docs.ole.dev/)).
- A GitHub Personal Access Token (PAT) with `repo` scope (you can use the same one you supply to the Digital Garden plugin)
- Docker and Docker Compose installed on a server that supports containerization.
- This repo cloned onto the server you plan to use.

### 2. Configuration

Copy the example environment file and update it with your values:

```bash
cp .env.example .env
```

You need to at least provide values for the following variables:

```env
GITHUB_USERNAME=your-github-username
GITHUB_REPO=your-garden-repo-name
GITHUB_PAT=your-github-personal-access-token
WEBHOOK_SECRET=a-secure-random-secret
```

You should generate a long random password for `WEBHOOK_SECRET` using eg. [this tool](https://nordpass.com/password-generator/) (or any other password generator). I recommend using at least 64 characters.

#### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MANAGER_PORT` | `3000` | Port for the webhook listener |
| `SERVE_DIR` | `/var/www/html` | Directory where static files are served from |
| `START_NGINX` | `false` | Set to `true` to enable internal nginx (default is to use external Nginx server) |

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

**Very important:** Your `GITHUB_PAT` is used to clone the repository. If you are reusing your token that you use for the Digital Garden plugin, it will have **read and write access** to your content. Ensure your `.env` file is kept secure and not committed to any public repositories. The `.env.example` file is provided as a template — do not commit your actual `.env` file.
