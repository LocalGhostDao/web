#!/bin/bash
# Get the absolute path of the public directory
SRC_DIR=$(realpath "$(dirname "$0")/../public")
DEST_DIR="/var/www/localghost.ai/public"

# Ensure destination exists
mkdir -p "$DEST_DIR"

# Enable dotglob so * includes hidden files like .well-known
shopt -s dotglob

# Copy everything
cp -rv "$SRC_DIR"/* "$DEST_DIR"/

# Disable dotglob to return shell to normal behavior
shopt -u dotglob

echo "Deployment complete"