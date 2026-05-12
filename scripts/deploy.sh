#!/bin/bash

# Deploy script that runs in background
# This script will continue running even if the terminal is closed
# Pulls from public repo: https://github.com/Qoomio/AIoT.git

REPO_URL="https://github.com/Qoomio/AIoT.git"
LOCAL_PATH="$HOME/qoom"

{
    set -e

    TEMP_SWAPFILE="/swapfile.qoom-deploy"

    run_as_root() {
        if [ "$EUID" -eq 0 ]; then
            "$@"
        else
            sudo "$@"
        fi
    }

    cleanup_temp_swap() {
        if run_as_root swapon --show 2>/dev/null | awk 'NR>1 {print $1}' | grep -qx "$TEMP_SWAPFILE"; then
            echo "Disabling temporary swap file..."
            run_as_root swapoff "$TEMP_SWAPFILE" || true
        fi
        if [ -f "$TEMP_SWAPFILE" ]; then
            run_as_root rm -f "$TEMP_SWAPFILE" || true
        fi
    }

    setup_temp_swap() {
        local desired_swap_mb=2048
        local mem_available_kb
        mem_available_kb=$(awk '/MemAvailable/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)

        if [ "$mem_available_kb" -ge 2097152 ]; then
            echo "At least 2GB RAM available, skipping temporary swap setup."
            return 0
        fi

        if run_as_root swapon --show 2>/dev/null | awk 'NR>1 {print $1}' | grep -qx "$TEMP_SWAPFILE"; then
            echo "Temporary swap file already enabled."
            return 0
        fi

        echo "Available RAM below 2GB (${mem_available_kb}KB). Creating temporary ${desired_swap_mb}MB swap file..."
        if command -v fallocate >/dev/null 2>&1; then
            run_as_root fallocate -l "${desired_swap_mb}M" "$TEMP_SWAPFILE"
        else
            run_as_root dd if=/dev/zero of="$TEMP_SWAPFILE" bs=1M count="$desired_swap_mb" status=none
        fi
        run_as_root chmod 600 "$TEMP_SWAPFILE"
        run_as_root mkswap "$TEMP_SWAPFILE" >/dev/null
        run_as_root swapon "$TEMP_SWAPFILE"
        free -h || true
    }

    ensure_node_pty() {
        if node -e "require('node-pty')" >/dev/null 2>&1; then
            echo "node-pty is healthy."
            return 0
        fi

        echo "node-pty failed to load. Attempting rebuild from source..."
        echo "Architecture: $(uname -m), Node: $(node -v), npm: $(npm -v)"
        setup_temp_swap
        npm rebuild node-pty --build-from-source || npm install node-pty --build-from-source

        if node -e "require('node-pty')" >/dev/null 2>&1; then
            echo "node-pty rebuild succeeded."
            return 0
        fi

        echo "Error: node-pty is still not loadable after rebuild."
        exit 1
    }

    trap cleanup_temp_swap EXIT

    if [[ "$NODE_ENV" != "user" ]]; then
        echo "Aborting deployment: NODE_ENV is not 'user'. Current NODE_ENV='$NODE_ENV'"
        exit 1
    fi
    echo "Starting deployment process..."
    echo "Timestamp: $(date)"
    
    # STOP PM2 FIRST - before any file changes happen
    echo "Stopping pm2 process before update..."
    pm2 stop qoom2 || true
    sleep 1
    
    cd "$LOCAL_PATH" || { echo "Error: Failed to cd to $LOCAL_PATH"; exit 1; }
    
    # Ensure git remote is set to the public repo
    echo "Configuring git remote..."
    git remote set-url origin "$REPO_URL" 2>/dev/null || git remote add origin "$REPO_URL"
    
    # Pull latest changes from git (public repo, no SSH needed)
    echo "Pulling latest changes from $REPO_URL..."
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

    # Skip npm install if packages haven't changed
    PACKAGE_HASH=$(cat package.json package-lock.json 2>/dev/null | md5sum | cut -d' ' -f1)
    HASH_FILE="node_modules/.package-hash"
    
    if [ -d "node_modules" ] && [ -f "$HASH_FILE" ] && [ "$(cat $HASH_FILE 2>/dev/null)" = "$PACKAGE_HASH" ]; then
        echo "Packages unchanged, skipping npm install ✓"
    else
        echo "Installing npm packages..."
        setup_temp_swap
        npm ci --prefer-offline 2>/dev/null || npm i
        echo "$PACKAGE_HASH" > "$HASH_FILE"
    fi

    # Ensure native terminal dependency is healthy before restarting PM2.
    ensure_node_pty
    
    # Delete existing pm2 process
    echo "Deleting existing pm2 process 'qoom2'..."
    pm2 delete qoom2 2>/dev/null || true

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
