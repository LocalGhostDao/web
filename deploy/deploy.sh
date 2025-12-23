#!/bin/bash
# Get the absolute path of the public directory
SRC_DIR=$(realpath "$(dirname "$0")/../public")
DEST_DIR="/var/www/localghost.ai/public"
TEMP_FILE="/tmp/lg_deploy_changes_$$"
SITE_URL="https://www.localghost.ai"

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
ASSET_OUTPUT=$(rsync -av --checksum --delete --exclude='*.html' --exclude='sitemap.xml' --out-format="[%o] %n" "$SRC_DIR"/ "$DEST_DIR"/ 2>&1)
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

# Check for nginx config changes
NGINX_SRC=$(realpath "$(dirname "$0")/nginx.conf")
NGINX_DEST="/etc/nginx/sites-available/www.localghost.ai"
NGINX_CHANGED=false

if [ -f "$NGINX_SRC" ]; then
    if ! cmp -s "$NGINX_SRC" "$NGINX_DEST" 2>/dev/null; then
        NGINX_CHANGED=true
        echo "NGINX_CHANGED" >> "$TEMP_FILE"
        echo "  [↑] SYNC: nginx.conf"
    fi
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

# 4. Generate sitemap.xml
echo ""
echo "> SITEMAP GENERATION..."

SITEMAP_FILE="$DEST_DIR/sitemap.xml"
LASTMOD=$(date +%Y-%m-%d)

# Start sitemap
cat > "$SITEMAP_FILE" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
EOF

# Collect and sort URLs
declare -a URLS

while IFS= read -r -d '' html_file; do
    rel_path="${html_file#$SRC_DIR/}"
    
    # Skip error pages
    [[ "$rel_path" == error/* ]] && continue
    
    # Convert to clean URL
    if [ "$rel_path" = "index.html" ]; then
        # Root index -> /
        clean_url="/"
        priority="1.0"
    elif [[ "$rel_path" == */index.html ]]; then
        # Subdirectory index -> /subdir/
        clean_url="/${rel_path%index.html}"
        priority="0.8"
    else
        # Regular page -> /page (no .html)
        clean_url="/${rel_path%.html}"
        priority="0.8"
    fi
    
    URLS+=("$priority|$clean_url")
done < <(find "$SRC_DIR" -name "*.html" -type f -print0)

# Sort URLs (by priority desc, then alphabetically)
IFS=$'\n' SORTED_URLS=($(sort -t'|' -k1,1rn -k2,2 <<< "${URLS[*]}")); unset IFS

# Write URLs to sitemap
for entry in "${SORTED_URLS[@]}"; do
    priority="${entry%%|*}"
    url="${entry#*|}"
    
    cat >> "$SITEMAP_FILE" << EOF
  <url>
    <loc>${SITE_URL}${url}</loc>
    <lastmod>${LASTMOD}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
  </url>
EOF
done

# Close sitemap
echo "</urlset>" >> "$SITEMAP_FILE"

# Count URLs
URL_COUNT=${#SORTED_URLS[@]}
echo "  [📍] sitemap.xml (${URL_COUNT} URLs)"

# Cleanup
rm -f "$TEMP_FILE"

# Calculate elapsed time
END_TIME=$(date +%s%N)
ELAPSED_MS=$(( (END_TIME - START_TIME) / 1000000 ))

# 5. Deploy nginx config if changed
if [ "$NGINX_CHANGED" = true ]; then
    echo ""
    echo "> NGINX CONFIGURATION..."
    sudo cp "$NGINX_SRC" "$NGINX_DEST"
    
    NGINX_TEST=$(sudo nginx -t 2>&1)
    if echo "$NGINX_TEST" | grep -q "successful"; then
        sudo systemctl reload nginx
        echo "  [⚡] nginx.conf deployed & reloaded"
    else
        echo "  [✗] nginx config invalid:"
        echo "$NGINX_TEST" | sed 's/^/      /'
        # Restore previous config
        sudo git -C "$(dirname "$NGINX_SRC")" checkout -- nginx.conf 2>/dev/null || true
    fi
fi

echo ""
echo "  ╔════════════════════════════════════════╗"
echo "  ║  > BROADCAST COMPLETE                  ║"
echo "  ╚════════════════════════════════════════╝"
echo ""
echo "> THE EXIT IS OPEN: ${BUILD_ID}"
echo "> PROPAGATION: ${ELAPSED_MS}ms"
echo ""