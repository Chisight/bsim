#!/bin/bash

# Dynamically determine the repository directory based on the script's location
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRANCH="main"
DEPLOY_DIR="/var/www/html/sim.dystopi.cc"

cd "$PROJECT_DIR" || exit

# Function to perform the deployment
deploy_files() {
    echo "[$(date)] Starting deployment process..."
    
    # Check if we have write access to the deployment directory. If not, use sudo.
    USE_SUDO=""
    if [ ! -w "$DEPLOY_DIR" ] && [ ! -w "$(dirname "$DEPLOY_DIR")" 2>/dev/null ]; then
        echo "[$(date)] Insufficient permissions for $DEPLOY_DIR. Using sudo..."
        USE_SUDO="sudo"
    fi

    # Create target directory
    $USE_SUDO mkdir -p "$DEPLOY_DIR"

    # Explicitly remove development, git, and scripting files from the web root for security
    echo "[$(date)] Cleaning up any non-production/dangerous files from $DEPLOY_DIR..."
    $USE_SUDO rm -rf "$DEPLOY_DIR/.git" \
                     "$DEPLOY_DIR/.gitignore" \
                     "$DEPLOY_DIR/wasm-core" \
                     "$DEPLOY_DIR/auto_deploy.sh" \
                     "$DEPLOY_DIR/poll_updates.sh" \
                     "$DEPLOY_DIR/README.md" \
                     "$DEPLOY_DIR/SCRIPTING.md" \
                     "$DEPLOY_DIR"/test*

    # Sync production directories cleanly
    echo "[$(date)] Syncing production directories to $DEPLOY_DIR..."
    $USE_SUDO rsync -av --delete "$PROJECT_DIR/assets/" "$DEPLOY_DIR/assets/"
    $USE_SUDO rsync -av --delete "$PROJECT_DIR/bsimscripts/" "$DEPLOY_DIR/bsimscripts/"
    $USE_SUDO rsync -av --delete "$PROJECT_DIR/css/" "$DEPLOY_DIR/css/"
    $USE_SUDO rsync -av --delete "$PROJECT_DIR/js/" "$DEPLOY_DIR/js/"
    
    # Copy entrypoint index.html
    $USE_SUDO cp "$PROJECT_DIR/index.html" "$DEPLOY_DIR/index.html"

    # Set proper permissions:
    # - Directories: 755 (drwxr-xr-x)
    # - Files: 644 (rw-r--r--)
    echo "[$(date)] Setting correct web permissions (755 for directories, 644 for files)..."
    $USE_SUDO find "$DEPLOY_DIR" -type d -exec chmod 755 {} +
    $USE_SUDO find "$DEPLOY_DIR" -type f -exec chmod 644 {} +

    # Set web server owner/group ownership (with graceful fallbacks)
    echo "[$(date)] Setting owner to web server user (www-data)..."
    if $USE_SUDO chown -R www-data:www-data "$DEPLOY_DIR" 2>/dev/null; then
        echo "[$(date)] Ownership successfully set to www-data:www-data."
    elif $USE_SUDO chown -R nginx:nginx "$DEPLOY_DIR" 2>/dev/null; then
        echo "[$(date)] Ownership successfully set to nginx:nginx."
    elif $USE_SUDO chown -R apache:apache "$DEPLOY_DIR" 2>/dev/null; then
        echo "[$(date)] Ownership successfully set to apache:apache."
    else
        echo "[$(date)] Warning: Web server users (www-data/nginx/apache) not found or chown failed. Keeping default owner."
    fi

    echo "[$(date)] Deployment successfully completed."
}

# Check for force flag
FORCE_DEPLOY=false
if [ "$1" = "--force" ] || [ "$1" = "-f" ]; then
    FORCE_DEPLOY=true
fi

# Fetch the latest updates from the remote repository
git fetch origin "$BRANCH" 2>/dev/null

# Compare the local HEAD with the remote tracking branch
LOCAL=$(git rev-parse HEAD 2>/dev/null)
REMOTE=$(git rev-parse origin/"$BRANCH" 2>/dev/null)
BASE=$(git merge-base HEAD origin/"$BRANCH" 2>/dev/null)

if [ -z "$LOCAL" ] || [ -z "$REMOTE" ]; then
    echo "[$(date)] Error: Unable to determine git status. Performing fallback deployment..."
    deploy_files
    exit 0
fi

if [ "$LOCAL" = "$REMOTE" ]; then
    if [ "$FORCE_DEPLOY" = true ]; then
        echo "[$(date)] Repository is up-to-date, but force-deploy was requested."
        deploy_files
    else
        echo "[$(date)] Repository is up-to-date. No deployment needed."
    fi
    exit 0
elif [ "$LOCAL" = "$BASE" ]; then
    echo "[$(date)] Updates found. Pulling latest code..."
    git pull origin "$BRANCH"
    
    # Deploy the pulled updates
    deploy_files
else
    echo "[$(date)] Local changes have diverged from remote. Please merge manually."
    if [ "$FORCE_DEPLOY" = true ]; then
        echo "[$(date)] Force-deploy requested despite git divergence."
        deploy_files
    fi
fi
