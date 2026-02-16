#!/bin/bash


# Deploy script that runs in background
# This script will continue running even if the terminal is closed
# Pulls from public repo: https://github.com/Qoomio/AIoT.git

REPO_URL="https://github.com/Qoomio/AIoT.git"

{
    if [[ "$NODE_ENV" != "education" && "$NODE_ENV" != "EDUCATION" ]]; then
        echo "Aborting deployment: NODE_ENV is not 'education'. Current NODE_ENV='$NODE_ENV'"
        exit 1
    fi
    echo "Starting deployment process..."
    echo "Timestamp: $(date)"
    
    # Ensure git remote is set to the public repo
    echo "Configuring git remote..."
    git remote set-url origin "$REPO_URL" 2>/dev/null || git remote add origin "$REPO_URL"
    
    # Pull latest changes from git (public repo, no SSH needed)
    echo "Pulling latest changes from $REPO_URL..."
    echo "Resetting any uncommitted or unstaged changes to ensure clean git pull..."
    git reset --hard
    git clean -fd
    git pull origin main

    # Check if uv is installed, install if not
    if ! command -v uv &> /dev/null; then
        echo "uv not found. Installing uv..."
        curl -LsSf https://astral.sh/uv/install.sh | sh
        echo "uv installed successfully."
    else
        echo "uv is already installed."
    fi

    echo "Installing npm packages..."
    npm i
    
    # Delete existing pm2 process
    echo "Deleting existing pm2 process 'aiot'..."
    pm2 delete aiot 2>/dev/null || echo "No existing 'aiot' process to delete"

    # Start new pm2 process using ecosystem config
    echo "Starting new pm2 process using ecosystem.config.cjs..."
    pm2 start ecosystem.config.cjs
    
    # Save pm2 configuration
    echo "Saving pm2 configuration..."
    pm2 save
    
    echo "Deployment completed successfully!"
    echo "End timestamp: $(date)"
    
} > /tmp/deploy.log 2>&1 &

echo "Deployment script started in background. Check /tmp/deploy.log for progress."
