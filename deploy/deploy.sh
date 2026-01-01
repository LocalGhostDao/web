#!/bin/bash
# Get the absolute path of the public directory
SRC_DIR=$(realpath "$(dirname "$0")/../public")
DEST_DIR="/var/www/localghost.ai/public"
TEMP_FILE="/tmp/lg_deploy_changes_$$"
WORK_DIR="/tmp/lg_deploy_work_$$"
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

# Minify CSS: remove comments and collapse whitespace
minify_css() {
    sed 's|/\*[^*]*\*\+\([^/*][^*]*\*\+\)*/||g' | \
    tr '\n' ' ' | \
    sed -e 's/  */ /g' \
        -e 's/: /:/g' \
        -e 's/ {/{/g' \
        -e 's/{ /{/g' \
        -e 's/ }/}/g' \
        -e 's/} /}/g' \
        -e 's/; /;/g' \
        -e 's/, /,/g' \
        -e 's/^ //' \
        -e 's/ $//'
}

# Check if HTML file has noindex directive
has_noindex() {
    local file="$1"
    # Match <meta name="robots" content="...noindex..."> in either attribute order
    grep -qE '<meta[^>]*name="robots"[^>]*content="[^"]*noindex' "$file" 2>/dev/null || \
    grep -qE '<meta[^>]*content="[^"]*noindex[^"]*"[^>]*name="robots"' "$file" 2>/dev/null
}

# Ensure directories exist
mkdir -p "$DEST_DIR"
mkdir -p "$WORK_DIR/css"
mkdir -p "$WORK_DIR/js"

# Clean up temp files on exit
trap "rm -rf '$TEMP_FILE' '$WORK_DIR'" EXIT

echo "> DIFFERENTIAL ANALYSIS..."
echo ""

# 1. Sync static assets (images, fonts, etc - not CSS/JS/HTML)
ASSET_OUTPUT=$(rsync -av --checksum --delete \
    --exclude='*.html' \
    --exclude='*.css' \
    --exclude='*.js' \
    --exclude='sitemap.xml' \
    --exclude='ghost/deploy-manifest*' \
    --out-format="[%o] %n" "$SRC_DIR"/ "$DEST_DIR"/ 2>&1)
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

# 2. Minify CSS to work dir
echo ""
echo "> MINIFYING CSS..."

TOTAL_SAVED=0

while IFS= read -r -d '' css_file; do
    rel_path="${css_file#$SRC_DIR/}"
    work_file="$WORK_DIR/$rel_path"
    mkdir -p "$(dirname "$work_file")"
    
    ORIG_SIZE=$(stat -c%s "$css_file" 2>/dev/null || stat -f%z "$css_file" 2>/dev/null)
    minify_css < "$css_file" > "$work_file"
    NEW_SIZE=$(stat -c%s "$work_file" 2>/dev/null || stat -f%z "$work_file" 2>/dev/null)
    
    SAVED=$((ORIG_SIZE - NEW_SIZE))
    TOTAL_SAVED=$((TOTAL_SAVED + SAVED))
    PERCENT=$((SAVED * 100 / ORIG_SIZE))
    echo "  [⚡] $rel_path (-${PERCENT}%)"
done < <(find "$SRC_DIR" -name "*.css" -type f -print0)

if [ "$TOTAL_SAVED" -gt 1024 ]; then
    echo "  [Σ] Saved: $((TOTAL_SAVED / 1024))KB"
elif [ "$TOTAL_SAVED" -gt 0 ]; then
    echo "  [Σ] Saved: ${TOTAL_SAVED}B"
fi

# 3. Sync JS files to destination with version string
echo ""
echo "> SYNCING JS..."

while IFS= read -r -d '' js_file; do
    rel_path="${js_file#$SRC_DIR/}"
    dest_file="$DEST_DIR/$rel_path"
    mkdir -p "$(dirname "$dest_file")"
    cp "$js_file" "$dest_file"
    echo "  [↑] $rel_path"
done < <(find "$SRC_DIR" -name "*.js" -type f -print0)

# 3. Check HTML files for changes
while IFS= read -r -d '' src_file; do
    rel_path="${src_file#$SRC_DIR/}"
    dest_file="$DEST_DIR/$rel_path"
    
    if [ ! -f "$dest_file" ]; then
        echo "NEW:$rel_path" >> "$TEMP_FILE"
    else
        src_hash=$(sha256sum < "$src_file" | cut -c1-16)
        dest_hash=$(sed -e 's/<style>[^<]*<\/style>//g' -e 's/<script>[^<]*<\/script>//g' "$dest_file" | sha256sum | cut -c1-16)
        
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

# Log changes
if grep -qE "^(NEW|MOD|DEL):" "$TEMP_FILE" 2>/dev/null; then
    grep -E "^(NEW|MOD|DEL):" "$TEMP_FILE" | while read -r line; do
        TYPE="${line%%:*}"
        FILE="${line#*:}"
        case "$TYPE" in
            DEL) echo "  [✗] PURGED: $FILE"; rm -f "$DEST_DIR/$FILE" ;;
            NEW) echo "  [+] NEW: $FILE" ;;
            MOD) echo "  [↑] SYNC: $FILE" ;;
        esac
    done
fi

# Check nginx config
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
    echo ""
    echo "  [—] No changes detected"
    echo ""
    echo "> SYSTEM STATE: UNCHANGED"
    echo "> SIGNAL DORMANT: ${BUILD_ID}"
    echo "> PROPAGATION: ${ELAPSED_MS}ms"
    echo ""
    exit 0
fi

# 4. Process HTML: inline CSS, version JS, then minify
echo ""
echo "> INLINING CSS & VERSIONING JS..."

while IFS= read -r -d '' src_file; do
    rel_path="${src_file#$SRC_DIR/}"
    dest_file="$DEST_DIR/$rel_path"
    html_work="$WORK_DIR/html_$$.tmp"
    
    mkdir -p "$(dirname "$dest_file")"
    cp "$src_file" "$html_work"
    
    # Inline CSS: <link rel="stylesheet" href="..."> → <style>...</style>
    while IFS= read -r link_tag; do
        [ -z "$link_tag" ] && continue
        
        href=$(echo "$link_tag" | sed -n 's/.*href="\([^"]*\)".*/\1/p')
        [ -z "$href" ] && continue
        
        # Resolve path
        if [[ "$href" == /* ]]; then
            css_file="$WORK_DIR$href"
        else
            css_file="$WORK_DIR/$href"
        fi
        
        if [ -f "$css_file" ]; then
            # Use awk for safe replacement - handles any content
            awk -v tag="$link_tag" -v cssfile="$css_file" '
            {
                idx = index($0, tag)
                if (idx > 0) {
                    printf "%s", substr($0, 1, idx - 1)
                    printf "<style>"
                    while ((getline line < cssfile) > 0) printf "%s", line
                    close(cssfile)
                    printf "</style>"
                    printf "%s\n", substr($0, idx + length(tag))
                } else {
                    print
                }
            }' "$html_work" > "$html_work.tmp" && mv "$html_work.tmp" "$html_work"
        fi
    done < <(grep -oE '<link[^>]*rel="stylesheet"[^>]*>' "$html_work" 2>/dev/null)
    
    # Add version string to JS: <script src="/js/x.js"> → <script src="/js/x.js?v=BUILD_ID">
    sed -i "s|src=\"\([^\"]*\.js\)\"|src=\"\1?v=$BUILD_ID\"|g" "$html_work"
    
    # Copy to destination (no minification - breaks <pre> blocks)
    cp "$html_work" "$dest_file"
    echo "  [⚡] $rel_path"
    
    rm -f "$html_work"
done < <(find "$SRC_DIR" -name "*.html" -type f -print0)

# 5. Generate sitemap.xml
echo ""
echo "> SITEMAP GENERATION..."

SITEMAP_FILE="$DEST_DIR/sitemap.xml"
LASTMOD=$(date +%Y-%m-%d)

cat > "$SITEMAP_FILE" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
EOF

declare -a URLS
NOINDEX_COUNT=0

while IFS= read -r -d '' html_file; do
    rel_path="${html_file#$SRC_DIR/}"
    
    # Skip error pages
    [[ "$rel_path" == error/* ]] && continue
    
    # Skip files with noindex meta tag
    if has_noindex "$html_file"; then
        echo "  [—] NOINDEX: $rel_path"
        ((NOINDEX_COUNT++))
        continue
    fi
    
    if [ "$rel_path" = "index.html" ]; then
        clean_url="/"; priority="1.0"
    elif [[ "$rel_path" == */index.html ]]; then
        clean_url="/${rel_path%index.html}"; priority="0.8"
    else
        clean_url="/${rel_path%.html}"; priority="0.8"
    fi
    
    URLS+=("$priority|$clean_url")
done < <(find "$SRC_DIR" -name "*.html" -type f -print0)

IFS=$'\n' SORTED_URLS=($(sort -t'|' -k1,1rn -k2,2 <<< "${URLS[*]}")); unset IFS

for entry in "${SORTED_URLS[@]}"; do
    priority="${entry%%|*}"; url="${entry#*|}"
    cat >> "$SITEMAP_FILE" << EOF
  <url>
    <loc>${SITE_URL}${url}</loc>
    <lastmod>${LASTMOD}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
  </url>
EOF
done

echo "</urlset>" >> "$SITEMAP_FILE"
echo "  [📍] sitemap.xml (${#SORTED_URLS[@]} URLs, ${NOINDEX_COUNT} excluded)"

# 6. Deploy nginx config if changed
if [ "$NGINX_CHANGED" = true ]; then
    echo ""
    echo "> NGINX CONFIGURATION..."
    sudo cp "$NGINX_SRC" "$NGINX_DEST"
    
    if sudo nginx -t 2>&1 | grep -q "successful"; then
        sudo systemctl reload nginx
        echo "  [⚡] nginx.conf deployed & reloaded"
    else
        echo "  [✗] nginx config invalid"
        sudo git -C "$(dirname "$NGINX_SRC")" checkout -- nginx.conf 2>/dev/null || true
    fi
fi

# 7. Sign deployment manifest
echo ""
echo "> SIGNING MANIFEST..."

mkdir -p "$DEST_DIR/ghost"
MANIFEST_FILE="$DEST_DIR/ghost/deploy-manifest.txt"
MANIFEST_SIG="$DEST_DIR/ghost/deploy-manifest.txt.asc"

{
    echo "# LocalGhost Deployment Manifest"
    echo "# Build: ${BUILD_ID}"
    echo "# Signed: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo ""
    find "$DEST_DIR" -type f ! -path "*/ghost/deploy-manifest*" -exec sha256sum {} \; | sed "s|$DEST_DIR||" | sort -k2
} > "$MANIFEST_FILE"

gpg --batch --yes --armor --local-user info@localghost.ai --output "$MANIFEST_SIG" --detach-sign "$MANIFEST_FILE"

FILE_COUNT=$(grep -c "^[a-f0-9]" "$MANIFEST_FILE")
echo "  [🔏] deploy-manifest.txt (${FILE_COUNT} files)"
echo "  [🔏] deploy-manifest.txt.asc"

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