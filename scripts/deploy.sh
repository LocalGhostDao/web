#!/bin/bash
# Get the absolute path of the public directory
SRC_DIR=$(realpath "$(dirname "$0")/../public")
DEST_DIR="/var/www/localghost.ai/public"

# Generate build timestamp
BUILD_TIME=$(date +%s)
echo "Build timestamp: $BUILD_TIME"

# Ensure destination exists
mkdir -p "$DEST_DIR"

# Enable dotglob so * includes hidden files like .well-known
shopt -s dotglob

# Copy everything
cp -rv "$SRC_DIR"/* "$DEST_DIR"/

# Disable dotglob to return shell to normal behavior
shopt -u dotglob

# Cache-bust CSS and JS references in HTML files
echo "Adding cache-busting query strings..."

# Update all HTML files
find "$DEST_DIR" -name "*.html" -type f | while read -r file; do
    # CSS files
    sed -i "s|href=\"/css/\([^\"]*\)\.css\"|href=\"/css/\1.css?v=$BUILD_TIME\"|g" "$file"
    sed -i "s|href=\"css/\([^\"]*\)\.css\"|href=\"css/\1.css?v=$BUILD_TIME\"|g" "$file"
    
    # JS files
    sed -i "s|src=\"/js/\([^\"]*\)\.js\"|src=\"/js/\1.js?v=$BUILD_TIME\"|g" "$file"
    sed -i "s|src=\"js/\([^\"]*\)\.js\"|src=\"js/\1.js?v=$BUILD_TIME\"|g" "$file"
    
    echo "  Updated: $file"
done

echo "Deployment complete (build: $BUILD_TIME)"