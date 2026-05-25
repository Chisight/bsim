#!/bin/bash

# Define the repository directory, branch, and target web directory
PROJECT_DIR="/home/the/Documents/browser-sim"
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

    # Rsync only the relevant assets/code files
    # --delete will clean up any removed assets/js/css files and remove
    # git repositories, test scripts, makefiles, and dev directories.
    echo "[$(date)] Syncing production files to $DEPLOY_DIR..."
    $USE_SUDO rsync -av --delete \
      --include="/index.html" \
      --include="/assets/" \
      --include="/assets/**" \
      --include="/bsimscripts/" \
      --include="/bsimscripts/**" \
      --include="/css/" \
      --include="/css/**" \
      --include="/js/" \
      --include="/js/**" \
      --exclude="*" \
      "$PROJECT_DIR/" "$DEPLOY_DIR/"

    # Set proper permissions:
    # - Directories: 755 (drwxr-xr-x)
    # - Files: 644 (rw-r--r--)
    echo "[$(date)] Setting correct web permissions (755 for directories, 644 for files)..."
    $USE_SUDO find "$DEPLOY_DIR" -type d -exec chmod 755 {} +
    $USE_SUDO find "$DEPLOY_DIR" -type f -exec chmod 644 {} +

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
