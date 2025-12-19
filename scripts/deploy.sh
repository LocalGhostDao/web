#!/bin/bash
SRC_DIR="$(dirname "$0")/../public"
DEST_DIR="/var/www/localghost.ai/public"

# Ensure destination exists
mkdir -p "$DEST_DIR"

# Copy all files
cp -r "$SRC_DIR"/* "$DEST_DIR"/