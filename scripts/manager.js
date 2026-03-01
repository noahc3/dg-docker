const express = require('express');
const crypto = require('crypto');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.MANAGER_PORT || 3000;
const secret = process.env.WEBHOOK_SECRET;
const pat = process.env.GITHUB_PAT;
const username = process.env.GITHUB_USERNAME;
const repoName = process.env.GITHUB_REPO;
const workDir = '/app/repo';
const buildDir = path.join(workDir, 'dist');
const serveDir = process.env.SERVE_DIR || '/var/www/html';


function log(msg) {
    console.log(`[MANAGER] ${new Date().toISOString()} - ${msg}`);
}

function verifySignature(req) {
    if (!secret) return true; // No secret configured; warn but allow through
    const signature = req.headers['x-hub-signature-256'];
    if (!signature) return false;
    if (!Buffer.isBuffer(req.body)) {
        log('WARNING: req.body is not a Buffer — raw body middleware did not run correctly.');
        return false;
    }
    try {
        const hmac = crypto.createHmac('sha256', secret);
        const digest = 'sha256=' + hmac.update(req.body).digest('hex');
        // timingSafeEqual requires same-length buffers; throws TypeError if lengths differ.
        return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
    } catch {
        return false;
    }
}

// Creates a minimal placeholder page shown at / when no gardenEntry note has
// been published yet (or when the build failed to produce index.html).
function createPlaceholderPage() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Digital Garden — Getting Started</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 80px auto; padding: 0 20px; color: #cdd6f4; background: #1e1e2e; }
    h1   { color: #cba6f7; margin-bottom: .25em; }
    p    { line-height: 1.6; }
    code { background: #313244; padding: 2px 6px; border-radius: 4px; font-size: .9em; }
    .box { background: #313244; border-left: 4px solid #cba6f7; padding: 16px 20px; border-radius: 4px; margin: 24px 0; }
    a    { color: #89b4fa; }
  </style>
</head>
<body>
  <h1>Your Digital Garden</h1>
  <p>The server is running and your repository was built, but no home page has been published yet.</p>
  <div class="box">
    <strong>Next step:</strong> In Obsidian, open the note you want as your home page,
    enable the <strong>Home Page</strong> toggle in the Digital Garden plugin panel, then
    click <strong>Publish</strong>.
  </div>
  <p>
    The plugin marks the home page note with the <code>gardenEntry</code> tag. Eleventy
    uses that tag to output the note at <code>/</code>. Without it, no <code>index.html</code>
    is generated and nginx has nothing to serve at the root URL.
  </p>
  <p>
    Once you publish a home page note and push the changes to GitHub, the webhook will
    trigger a rebuild and this placeholder will be replaced automatically.
  </p>
</body>
</html>
`;
}

// If the build did not produce an index.html (no gardenEntry note, or the build
// failed entirely), write a placeholder so nginx can serve something at / instead
// of returning 403 "Forbidden" due to a missing directory index.
function ensureIndexPage() {
    const indexPath = path.join(serveDir, 'index.html');
    if (!fs.existsSync(indexPath)) {
        log('WARNING: No index.html found in the served directory.');
        log('This usually means no note with the "gardenEntry" tag has been published yet,');
        log('or the build failed before copying files. Creating a placeholder page.');
        fs.mkdirSync(serveDir, { recursive: true });
        fs.writeFileSync(indexPath, createPlaceholderPage());
        log('Placeholder written to ' + indexPath);
    }
}

function runBuild() {
    log('Starting build process...');
    try {
        log(`Checking directory: ${workDir}`);
        if (fs.existsSync(workDir)) {
            const files = fs.readdirSync(workDir);
            log(`Files in ${workDir}: ${files.join(', ')}`);
        } else {
            log(`${workDir} does not exist.`);
        }

        log('Configuring git safe.directory...');
        execSync(`git config --global --add safe.directory ${workDir}`);

        let isGitRepo = false;
        const dotGitPath = path.join(workDir, '.git');
        if (fs.existsSync(dotGitPath)) {
            log('.git directory exists, verifying...');
            try {
                execSync(`git -C ${workDir} status`, { stdio: 'pipe' });
                isGitRepo = true;
                log('Git repository verified.');
            } catch (e) {
                log(`Git verification failed: ${e.message}`);
                log('Existing .git directory is invalid or corrupted.');
            }
        } else {
            log('.git directory does not exist.');
        }

        // Even if the directory looks like a valid git repo, confirm it is
        // actually pointing at the right remote. A stale volume from a previous
        // setup (or a different repo) would otherwise silently pull the wrong
        // content and the manager would never notice.
        if (isGitRepo) {
            try {
                const remoteUrl = execSync(`git -C ${workDir} remote get-url origin`, { stdio: 'pipe' }).toString().trim();
                if (!remoteUrl.includes(`${username}/${repoName}`)) {
                    log(`Existing repo remote "${remoteUrl}" does not match ${username}/${repoName}. Re-cloning.`);
                    isGitRepo = false;
                }
            } catch (e) {
                log(`Could not read remote URL: ${e.message}. Re-cloning.`);
                isGitRepo = false;
            }
        }

        const authenticatedUrl = `https://${username}:${pat}@github.com/${username}/${repoName}.git`;

        if (!isGitRepo) {
            log(`Cloning repository ${username}/${repoName}...`);
            if (fs.existsSync(workDir)) {
                log('Cleaning up work directory before clone...');
                execSync(`rm -rf ${workDir}/* ${workDir}/.* 2>/dev/null || true`);
            } else {
                fs.mkdirSync(workDir, { recursive: true });
            }
            execSync(`git clone ${authenticatedUrl} ${workDir}`, { stdio: 'inherit' });
        } else {
            log('Updating repository...');
            // Refresh the remote URL so a rotated PAT is always picked up.
            execSync(`git -C ${workDir} remote set-url origin ${authenticatedUrl}`);
            execSync(`git -C ${workDir} pull`, { stdio: 'inherit' });
        }

        log('Installing dependencies...');
        execSync(`npm install`, { cwd: workDir, stdio: 'inherit' });

        log('Building site...');
        execSync(`npm run build`, { cwd: workDir, stdio: 'inherit' });

        if (!fs.existsSync(buildDir)) {
            throw new Error(`Build directory not found at ${buildDir}. Build might have failed or the build script outputs elsewhere.`);
        }

        log('Syncing files to web server directory...');
        fs.mkdirSync(serveDir, { recursive: true });
        execSync(`cp -a ${buildDir}/. ${serveDir}/`, { stdio: 'inherit' });

        log('Build completed successfully.');
    } catch (error) {
        log(`Build failed: ${error.message}`);
    }

    // Always guarantee an index.html exists so nginx can serve / without 403.
    // This runs whether the build succeeded (but produced no gardenEntry page)
    // or whether it failed partway through.
    ensureIndexPage();
}

// express.raw() is applied inline here rather than via app.use() to ensure it
// runs in the same routing context as the handler. When mounted with app.use()
// Express strips the path prefix before calling the middleware, which can cause
// body-parser to skip parsing and leave req.body as a plain object instead of
// the Buffer needed for HMAC verification.
app.post('/webhook', express.raw({ type: '*/*' }), (req, res) => {
    log('Received webhook request.');
    if (!verifySignature(req)) {
        log('Invalid signature. Ignoring.');
        return res.status(401).send('Invalid signature');
    }

    const event = req.headers['x-github-event'];

    if (event === 'push') {
        log('Push event detected. Triggering rebuild.');
        res.status(202).send('Rebuild triggered');
        runBuild();
    } else if (event === 'ping') {
        log('Ping event received. Webhook is active.');
        res.status(200).send('pong');
    } else {
        log(`Ignored event: ${event}`);
        res.status(200).send('Event ignored');
    }
});

// Health check endpoint (used by Docker HEALTHCHECK and docker compose)
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Main execution
(async () => {
    log('Manager starting...');
    log(`Configured Username: ${username}`);
    log(`Configured Repo: ${repoName}`);
    log(`Webhook Secret: ${secret ? '[SET]' : '[NOT SET]'}`);
    log(`GitHub PAT: ${pat ? '[SET]' : '[NOT SET]'}`);
    log(`Serve Directory: ${serveDir}`);

    if (!username || !repoName || !pat) {
        log('ERROR: GITHUB_USERNAME, GITHUB_REPO, and GITHUB_PAT must be provided.');
        process.exit(1);
    }

    // Initial clone/pull + build
    runBuild();

    // Start the webhook listener
    app.listen(port, () => {
        log(`Webhook listener running on port ${port}`);

        if (!secret) {
            console.log(`
${'*'.repeat(60)}
IMPORTANT: WEBHOOK_SECRET is not defined!
To enable automatic updates, please set up a GitHub Webhook:
1. Go to https://github.com/${username}/${repoName}/settings/hooks
2. Click "Add webhook"
3. Payload URL: http://<your-server-ip>/webhook
4. Content type: application/json
5. Secret: [Choose a secret and set it in WEBHOOK_SECRET env var]
6. Which events? Just the "push" event.
${'*'.repeat(60)}
`);
        } else {
            log('Webhook secret is configured. Automatic updates enabled.');
        }
    });
})();
