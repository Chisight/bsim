#!/bin/bash

# Define the repository directory and branch
PROJECT_DIR="/home/the/Documents/browser-sim"
BRANCH="main"

cd "$PROJECT_DIR" || exit

# Fetch the latest updates from the remote repository
git fetch origin "$BRANCH"

# Compare the local HEAD with the remote tracking branch
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/"$BRANCH")
BASE=$(git merge-base HEAD origin/"$BRANCH")

if [ "$LOCAL" = "$REMOTE" ]; then
    # Up-to-date
    exit 0
elif [ "$LOCAL" = "$BASE" ]; then
    # Remote has updates, local is behind
    echo "[$(date)] Updates found. Pulling latest code..."
    git pull origin "$BRANCH"
    
    # If a compilation step for the web server/wasm is needed in the future, add it here.
    # e.g., make, npm run build, etc.
else
    echo "[$(date)] Local changes have diverged from remote. Please merge manually."
fi
