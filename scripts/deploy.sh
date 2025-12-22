#!/bin/bash
# Get the absolute path of the public directory
SRC_DIR=$(realpath "$(dirname "$0")/../public")
DEST_DIR="/var/www/localghost.ai/public"
TEMP_FILE="/tmp/lg_deploy_changes_$$"

# Start timer (nanoseconds)
START_TIME=$(date +%s%N)

# Generate cryptic build identifier
BUILD_DATE=$(date +%Y.%m.%d)
BUILD_TIME=$(date +%s)
BUILD_HASH=$(echo -n "$BUILD_TIME" | sha256sum | cut -c1-8)
BUILD_ID="${BUILD_DATE}_0x${BUILD_HASH}"

echo ""
echo "  ╔════════════════════════════════════════╗"
echo "  ║  > LOCALGHOST DEPLOYMENT SEQUENCE      ║"
echo "  ╠════════════════════════════════════════╣"
echo "  ║  SIGNAL:  ${BUILD_ID}         ║"
echo "  ║  STATUS:  SCANNING...                  ║"
echo "  ╚════════════════════════════════════════╝"
echo ""

# Ensure destination exists
mkdir -p "$DEST_DIR"

# Clean up temp file
rm -f "$TEMP_FILE"

echo "> DIFFERENTIAL ANALYSIS..."
echo ""

# 1. Sync non-HTML files (assets)
ASSET_OUTPUT=$(rsync -av --checksum --delete --exclude='*.html' --out-format="[%o] %n" "$SRC_DIR"/ "$DEST_DIR"/ 2>&1)
ASSET_CHANGES=$(echo "$ASSET_OUTPUT" | grep -E "^\[(send|del\.)\]" | grep -v "/$")

if [ -n "$ASSET_CHANGES" ]; then
    echo "$ASSET_CHANGES" | while read -r line; do
        if echo "$line" | grep -q "\[del\.\]"; then
            FILE=$(echo "$line" | sed 's/\[del\.\] //')
            echo "  [✗] PURGED: $FILE"
        else
            FILE=$(echo "$line" | sed 's/\[send\] //')
            echo "  [↑] SYNC: $FILE"
        fi
    done
    echo "ASSET_CHANGED" >> "$TEMP_FILE"
fi

# 2. Check HTML files (compare content, ignoring version strings)
while IFS= read -r -d '' src_file; do
    rel_path="${src_file#$SRC_DIR/}"
    dest_file="$DEST_DIR/$rel_path"
    
    if [ ! -f "$dest_file" ]; then
        # New HTML file
        echo "NEW:$rel_path" >> "$TEMP_FILE"
    else
        # Compare source to destination (strip ?v=... from destination)
        src_hash=$(sha256sum < "$src_file" | cut -c1-16)
        dest_hash=$(sed 's/?v=[^"]*//g' "$dest_file" | sha256sum | cut -c1-16)
        
        if [ "$src_hash" != "$dest_hash" ]; then
            echo "MOD:$rel_path" >> "$TEMP_FILE"
        fi
    fi
done < <(find "$SRC_DIR" -name "*.html" -type f -print0)

# Check for deleted HTML files
while IFS= read -r -d '' dest_file; do
    rel_path="${dest_file#$DEST_DIR/}"
    src_file="$SRC_DIR/$rel_path"
    
    if [ ! -f "$src_file" ]; then
        echo "DEL:$rel_path" >> "$TEMP_FILE"
    fi
done < <(find "$DEST_DIR" -name "*.html" -type f -print0)

# Process HTML changes
if grep -qE "^(NEW|MOD|DEL):" "$TEMP_FILE" 2>/dev/null; then
    grep -E "^(NEW|MOD|DEL):" "$TEMP_FILE" | while read -r line; do
        TYPE="${line%%:*}"
        FILE="${line#*:}"
        case "$TYPE" in
            DEL)
                echo "  [✗] PURGED: $FILE"
                rm -f "$DEST_DIR/$FILE"
                ;;
            NEW)
                echo "  [+] NEW: $FILE"
                ;;
            MOD)
                echo "  [↑] SYNC: $FILE"
                ;;
        esac
    done
fi

# If no changes, exit early
if [ ! -f "$TEMP_FILE" ] || [ ! -s "$TEMP_FILE" ]; then
    END_TIME=$(date +%s%N)
    ELAPSED_MS=$(( (END_TIME - START_TIME) / 1000000 ))
    echo "  [—] No changes detected"
    echo ""
    echo "> SYSTEM STATE: UNCHANGED"
    echo "> SIGNAL DORMANT: ${BUILD_ID}"
    echo "> PROPAGATION: ${ELAPSED_MS}ms"
    echo ""
    rm -f "$TEMP_FILE"
    exit 0
fi

# 3. Copy and cache-bust HTML files
echo ""
echo "> CACHE INVALIDATION..."

while IFS= read -r -d '' src_file; do
    rel_path="${src_file#$SRC_DIR/}"
    dest_file="$DEST_DIR/$rel_path"
    
    # Ensure directory exists
    mkdir -p "$(dirname "$dest_file")"
    
    # Copy and add version strings
    sed -e "s|href=\"/css/\([^\"]*\)\.css\"|href=\"/css/\1.css?v=$BUILD_ID\"|g" \
        -e "s|href=\"css/\([^\"]*\)\.css\"|href=\"css/\1.css?v=$BUILD_ID\"|g" \
        -e "s|src=\"/js/\([^\"]*\)\.js\"|src=\"/js/\1.js?v=$BUILD_ID\"|g" \
        -e "s|src=\"js/\([^\"]*\)\.js\"|src=\"js/\1.js?v=$BUILD_ID\"|g" \
        "$src_file" > "$dest_file"
    
    echo "  [⚡] $rel_path"
done < <(find "$SRC_DIR" -name "*.html" -type f -print0)

# Cleanup
rm -f "$TEMP_FILE"

# Calculate elapsed time
END_TIME=$(date +%s%N)
ELAPSED_MS=$(( (END_TIME - START_TIME) / 1000000 ))

echo ""
echo "  ╔════════════════════════════════════════╗"
echo "  ║  > BROADCAST COMPLETE                  ║"
echo "  ╚════════════════════════════════════════╝"
echo ""
echo "> THE EXIT IS OPEN: ${BUILD_ID}"
echo "> PROPAGATION: ${ELAPSED_MS}ms"
echo ""