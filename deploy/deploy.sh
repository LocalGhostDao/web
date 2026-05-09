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
    grep -qE '<meta[^>]*name="robots"[^>]*content="[^"]*noindex' "$file" 2>/dev/null || \
    grep -qE '<meta[^>]*content="[^"]*noindex[^"]*"[^>]*name="robots"' "$file" 2>/dev/null
}

# ============================================
# METADATA EXTRACTION HELPERS
# ============================================

extract_meta() {
    local file="$1" prop="$2"
    grep -oE "<meta[^>]*property=\"${prop}\"[^>]*content=\"[^\"]*\"" "$file" 2>/dev/null | \
        head -1 | sed -E 's/.*content="([^"]*)".*/\1/'
}

extract_title() {
    local file="$1"
    local t
    t=$(extract_meta "$file" "og:title")
    if [ -z "$t" ]; then
        t=$(grep -oE '<title>[^<]*</title>' "$file" | head -1 | sed -E 's/<title>([^<]*)<\/title>/\1/')
    fi
    echo "$t" | sed -E 's/ \| (LocalGhost|Hard Truths)[^|]*$//' | sed -E 's/ \| LocalGhost\.ai$//'
}

extract_description() {
    local file="$1"
    grep -oE '<meta[^>]*name="description"[^>]*content="[^"]*"' "$file" 2>/dev/null | \
        head -1 | sed -E 's/.*content="([^"]*)".*/\1/'
}

extract_pubdate() {
    local file="$1"
    extract_meta "$file" "article:published_time"
}

extract_author() {
    local file="$1"
    local a
    a=$(extract_meta "$file" "article:author")
    [ -z "$a" ] && a="LocalGhost"
    echo "$a"
}

xml_escape() {
    sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/"/\&quot;/g' -e "s/'/\&apos;/g"
}

# ============================================
# STRUCTURED HTML → PLAINTEXT
# Tuned for LocalGhost post structure. Known
# elements render to clean markdown-ish output.
# Noisy blocks (podcast player, post nav, link
# rows, repo link cards) are dropped entirely.
# ============================================
html_to_text() {
    local file="$1"

    # Stage 1: extract only the content we care about.
    # Keep the page-header (for H1 and date) and the manifesto-text body.
    # Drop interactive widgets and navigation.
    awk '
        BEGIN { in_page = 0; in_body = 0; in_drop = 0; drop_depth = 0 }

        /<div[^>]*class="[^"]*page-header[^"]*"/ { in_page = 1; print; next }
        in_page {
            print
            if (/<\/div>[[:space:]]*$/ && !/class="page-header"/) {
                # crude close: first line ending in </div> after page-header opens
                in_page = 0
            }
            next
        }

        /<(main|div)[^>]*class="[^"]*manifesto-text[^"]*"/ { in_body = 1; next }

        in_body && /<div[^>]*class="[^"]*(podcast-player|post-nav|link-row|repo-links)[^"]*"/ {
            in_drop = 1; drop_depth = 1; next
        }
        in_drop {
            n = gsub(/<div[^>]*>/, "&"); drop_depth += n
            n = gsub(/<\/div>/, "&");    drop_depth -= n
            if (drop_depth <= 0) in_drop = 0
            next
        }

        in_body && /<\/main>/ { in_body = 0; exit }
        in_body { print }
    ' "$file" | \
    # Stage 2: transform structural elements into markdown.
    # Order matters: specific classes before generic tag stripping.
    sed -E '
        # Drop script/style contents
        s|<script[^>]*>.*</script>||g
        s|<style[^>]*>.*</style>||g

        # Section headers: "> 1. TITLE" → H2 (strip the leading > marker)
        s|<div[^>]*class="[^"]*section-header[^"]*"[^>]*>[[:space:]]*&gt;[[:space:]]*([^<]*)</div>|\n\n## \1\n|g
        s|<div[^>]*class="[^"]*section-header[^"]*"[^>]*>([^<]*)</div>|\n\n## \1\n|g

        # Statement box pieces
        s|<p[^>]*class="[^"]*statement-label[^"]*"[^>]*>([^<]*)</p>||g
        s|<p[^>]*class="[^"]*statement-main[^"]*"[^>]*>([^<]*)</p>|\n> \1\n|g
        s|<p[^>]*class="[^"]*statement-sub[^"]*"[^>]*>([^<]*)</p>|> \1\n|g

        # Callouts → block quotes with label
        s|<div[^>]*class="[^"]*alarm[^"]*"[^>]*>|\n> [ALARM] |g
        s|<div[^>]*class="[^"]*signal[^"]*"[^>]*>|\n> [SIGNAL] |g
        s|<div[^>]*class="[^"]*insight-box[^"]*"[^>]*>|\n> |g

        # Conclusion box
        s|<p[^>]*class="[^"]*conclusion-lead[^"]*"[^>]*>([^<]*)</p>|\n**\1**\n|g
        s|<p[^>]*class="[^"]*conclusion-main[^"]*"[^>]*>([^<]*)</p>|\1\n|g
        s|<p[^>]*class="[^"]*conclusion-sub[^"]*"[^>]*>([^<]*)</p>|\1\n|g

        # Final words
        s|<div[^>]*class="[^"]*final-words[^"]*"[^>]*>|\n---\n|g
        s|<span[^>]*class="[^"]*small[^"]*"[^>]*>([^<]*)</span>|[\1]|g

        # Page header pieces
        s|<div[^>]*class="[^"]*section-label[^"]*"[^>]*>([^<]*)</div>|\1\n|g
        s|<div[^>]*class="[^"]*date[^"]*"[^>]*>([^<]*)</div>|\1\n|g
        s|<h1[^>]*>([^<]*)</h1>|\n# \1\n|g
        s|<p[^>]*class="[^"]*subtitle[^"]*"[^>]*>([^<]*)</p>|\1\n|g

        # Paragraph and line breaks
        s|</p>|\n\n|g
        s|<p[^>]*>||g
        s|<br[^>]*/?>|\n|g

        # Inline emphasis as markdown
        s|<strong>([^<]*)</strong>|**\1**|g
        s|<em>([^<]*)</em>|*\1*|g
        s|<code>([^<]*)</code>|`\1`|g

        # Links: keep text, drop href
        s|<a[^>]*>([^<]*)</a>|\1|g

        # Highlight spans: keep text plain
        s|<span[^>]*class="[^"]*highlight[^"]*"[^>]*>([^<]*)</span>|\1|g

        # Drop anything else
        s|<[^>]+>||g

        # Entity decode
        s|&amp;|\&|g
        s|&lt;|<|g
        s|&gt;|>|g
        s|&quot;|"|g
        s|&apos;|'"'"'|g
        s|&nbsp;| |g
        s|&mdash;|—|g
        s|&ndash;|–|g
        s|&hellip;|…|g
        s|&rsquo;|'"'"'|g
        s|&lsquo;|'"'"'|g
        s|&rdquo;|"|g
        s|&ldquo;|"|g
    ' | \
    # Stage 3: collapse whitespace.
    awk '
        {
            # Strip leading whitespace (source HTML is indented)
            sub(/^[ \t]+/, "", $0)
            # Strip trailing whitespace
            sub(/[ \t]+$/, "", $0)
            if ($0 ~ /^[ \t]+$/) $0 = ""
        }
        NF || !blank {
            print
            blank = ($0 == "")
        }
    '
}

# ============================================
# HTML BLOCK EXTRACTION FOR RSS
# Keeps the manifesto-text HTML intact but
# strips podcast players and post navigation.
# ============================================
extract_html_block() {
    local file="$1"

    awk '
        BEGIN { capture = 0; drop = 0; drop_depth = 0 }

        /<(main|div)[^>]*class="[^"]*manifesto-text[^"]*"/ { capture = 1 }

        capture && /<div[^>]*class="[^"]*(podcast-player|post-nav|link-row|repo-links)[^"]*"/ {
            drop = 1; drop_depth = 1; next
        }
        drop {
            n = gsub(/<div[^>]*>/, "&"); drop_depth += n
            n = gsub(/<\/div>/, "&");    drop_depth -= n
            if (drop_depth <= 0) drop = 0
            next
        }

        capture && /<\/main>/ { exit }
        capture { print }
    ' "$file"
}

# Ensure directories exist
mkdir -p "$DEST_DIR"
mkdir -p "$WORK_DIR/css"
mkdir -p "$WORK_DIR/js"

trap "rm -rf '$TEMP_FILE' '$WORK_DIR'" EXIT

echo "> DIFFERENTIAL ANALYSIS..."
echo ""

# 1. Sync static assets
ASSET_OUTPUT=$(rsync -av --checksum --delete \
    --exclude='*.html' \
    --exclude='*.css' \
    --exclude='*.js' \
    --exclude='sitemap.xml' \
    --exclude='llms.txt' \
    --exclude='llms-full.txt' \
    --exclude='feed.xml' \
    --exclude='robots.txt' \
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

# 2. Minify CSS
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

# 3. Sync JS
echo ""
echo "> SYNCING JS..."

while IFS= read -r -d '' js_file; do
    rel_path="${js_file#$SRC_DIR/}"
    dest_file="$DEST_DIR/$rel_path"
    mkdir -p "$(dirname "$dest_file")"
    cp "$js_file" "$dest_file"
    echo "  [↑] $rel_path"
done < <(find "$SRC_DIR" -name "*.js" -type f -print0)

# ============================================
# 3.5 PODCAST AUDIO TRANSCODING
# ============================================
echo ""
echo "> TRANSCODING PODCAST AUDIO..."

PODCAST_SRC_DIR="$SRC_DIR/assets/podcast"

if [ ! -d "$PODCAST_SRC_DIR" ]; then
    echo "  [—] No podcast directory, skipping"
elif ! command -v ffmpeg >/dev/null 2>&1; then
    echo "  [✗] ffmpeg not found in PATH — install with: apt install ffmpeg"
    echo "      Skipping transcode. Existing .mp3 files will still deploy."
else
    TRANSCODED_COUNT=0
    SKIPPED_COUNT=0
    
    while IFS= read -r -d '' m4a_file; do
        rel_path="${m4a_file#$SRC_DIR/}"
        slug=$(basename "$m4a_file" .m4a)
        mp3_file="$PODCAST_SRC_DIR/${slug}.mp3"
        mp3_rel_path="${mp3_file#$SRC_DIR/}"
        
        if [ -f "$mp3_file" ] && [ "$mp3_file" -nt "$m4a_file" ]; then
            ((SKIPPED_COUNT++))
            continue
        fi
        
        pretty_title=$(echo "$slug" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)} 1')
        
        echo "  [♪] Transcoding: $rel_path"
        
        FFMPEG_LOG="$WORK_DIR/ffmpeg_${slug}.log"
        ffmpeg -nostdin -hide_banner -loglevel error -y \
            -i "$m4a_file" \
            -codec:a libmp3lame \
            -b:a 64k \
            -ac 1 \
            -metadata title="$pretty_title" \
            -metadata artist="Vlad Cealicu" \
            -metadata album="LocalGhost Hard Truths" \
            -metadata genre="Podcast" \
            -metadata date="$(date +%Y)" \
            "$mp3_file" </dev/null >"$FFMPEG_LOG" 2>&1
        FFMPEG_RC=$?
        
        if [ "$FFMPEG_RC" -eq 0 ] && [ -f "$mp3_file" ]; then
            ORIG_SIZE=$(stat -c%s "$m4a_file" 2>/dev/null || stat -f%z "$m4a_file" 2>/dev/null)
            NEW_SIZE=$(stat -c%s "$mp3_file" 2>/dev/null || stat -f%z "$mp3_file" 2>/dev/null)
            ORIG_KB=$((ORIG_SIZE / 1024))
            NEW_KB=$((NEW_SIZE / 1024))
            echo "      [✓] $mp3_rel_path (${ORIG_KB}KB → ${NEW_KB}KB)"
            ((TRANSCODED_COUNT++))
        else
            echo "      [✗] Conversion failed for $rel_path (rc=$FFMPEG_RC)"
            if [ -s "$FFMPEG_LOG" ]; then
                sed 's/^/        /' "$FFMPEG_LOG"
            fi
        fi
    done < <(find "$PODCAST_SRC_DIR" -name "*.m4a" -type f -print0 2>/dev/null)
    
    if [ "$TRANSCODED_COUNT" -gt 0 ]; then
        echo "  [Σ] Transcoded: $TRANSCODED_COUNT file(s)"
        rsync -av --checksum \
            --include='*.mp3' \
            --include='*/' \
            --exclude='*' \
            "$PODCAST_SRC_DIR/" "$DEST_DIR/assets/podcast/" 2>&1 | \
            grep -E '\.mp3$' | while read -r f; do
                echo "  [↑] SYNC: assets/podcast/$f"
            done
    fi
    if [ "$SKIPPED_COUNT" -gt 0 ]; then
        echo "  [—] Up-to-date: $SKIPPED_COUNT file(s)"
    fi
    if [ "$TRANSCODED_COUNT" -eq 0 ] && [ "$SKIPPED_COUNT" -eq 0 ]; then
        echo "  [—] No .m4a sources found"
    fi
fi

# 4. Check HTML files for changes
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

while IFS= read -r -d '' dest_file; do
    rel_path="${dest_file#$DEST_DIR/}"
    src_file="$SRC_DIR/$rel_path"
    
    if [ ! -f "$src_file" ]; then
        echo "DEL:$rel_path" >> "$TEMP_FILE"
    fi
done < <(find "$DEST_DIR" -name "*.html" -type f -print0)

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

# 5. Process HTML: inline CSS, version JS
echo ""
echo "> INLINING CSS & VERSIONING JS..."

while IFS= read -r -d '' src_file; do
    rel_path="${src_file#$SRC_DIR/}"
    dest_file="$DEST_DIR/$rel_path"
    html_work="$WORK_DIR/html_$$.tmp"
    
    mkdir -p "$(dirname "$dest_file")"
    cp "$src_file" "$html_work"
    
    while IFS= read -r link_tag; do
        [ -z "$link_tag" ] && continue
        
        href=$(echo "$link_tag" | sed -n 's/.*href="\([^"]*\)".*/\1/p')
        [ -z "$href" ] && continue
        
        if [[ "$href" == /* ]]; then
            css_file="$WORK_DIR$href"
        else
            css_file="$WORK_DIR/$href"
        fi
        
        if [ -f "$css_file" ]; then
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
    
    sed -i "s|src=\"\([^\"]*\.js\)\"|src=\"\1?v=$BUILD_ID\"|g" "$html_work"
    
    cp "$html_work" "$dest_file"
    echo "  [⚡] $rel_path"
    
    rm -f "$html_work"
done < <(find "$SRC_DIR" -name "*.html" -type f -print0)

# 6. Generate sitemap.xml
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
    
    [[ "$rel_path" == error/* ]] && continue
    
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

# ============================================
# 6.5 LLMS.TXT GENERATION
# ============================================
echo ""
echo "> LLMS.TXT GENERATION..."

LLMS_FILE="$DEST_DIR/llms.txt"

{
    cat << 'EOF'
# LocalGhost.ai

> LocalGhost is a local-first, privacy-focused AI platform built on cypherpunk principles. All inference and data storage runs on user-owned hardware with no cloud dependency. Fully open-source. The project is currently in Phase 0, architecture and manifesto documented, first commits landing. Founder: Vlad Cealicu, former Co-Founder and CTO of CryptoCompare / CCData.

The site has three primary sections: the Manifesto (the philosophical and technical argument for local-first AI), Hard Truths (a long-form essay series on tech, power, privacy, and the skills pipeline), and Build (the public roadmap and contribution guide). The tone is direct and opinionated. Posts are labelled SIGNAL, ALARM, or WINDOW to indicate certainty level.

## Core

EOF

    for slug in manifesto build hard-truths directory; do
        src="$SRC_DIR/${slug}.html"
        [ ! -f "$src" ] && continue
        has_noindex "$src" && continue
        title=$(extract_title "$src")
        desc=$(extract_description "$src")
        echo "- [${title}](${SITE_URL}/${slug}): ${desc}"
    done

    echo ""
    echo "## Hard Truths Essays"
    echo ""

    declare -a HT_ENTRIES
    while IFS= read -r -d '' post_file; do
        has_noindex "$post_file" && continue
        title=$(extract_title "$post_file")
        desc=$(extract_description "$post_file")
        pubdate=$(extract_pubdate "$post_file")
        [ -z "$pubdate" ] && pubdate="1970-01-01"
        rel_path="${post_file#$SRC_DIR/}"
        url="${rel_path%.html}"
        HT_ENTRIES+=("${pubdate}	- [${title}](${SITE_URL}/${url}): ${desc}")
    done < <(find "$SRC_DIR/hard-truths" -name "*.html" -type f -print0 2>/dev/null)

    if [ "${#HT_ENTRIES[@]}" -gt 0 ]; then
        printf '%s\n' "${HT_ENTRIES[@]}" | sort -r | cut -f2-
    fi

    cat << EOF

## Optional

- [GitHub Organisation](https://github.com/LocalGhostDao): Source code, including the main localghost repository with README, SECURITY, and architecture docs.
- [Brand Guidelines](${SITE_URL}/brand-guidelines): Visual identity, colour palette, typography.
- [Writing Guidelines](${SITE_URL}/writing-guidelines): Editorial standards for the Hard Truths series.
- [llms-full.txt](${SITE_URL}/llms-full.txt): Full text of all published essays concatenated, for complete context ingestion.
EOF
} > "$LLMS_FILE"

LLMS_LINES=$(wc -l < "$LLMS_FILE")
echo "  [🤖] llms.txt (${LLMS_LINES} lines)"

# ============================================
# 6.6 LLMS-FULL.TXT GENERATION
# ============================================
echo ""
echo "> LLMS-FULL.TXT GENERATION..."

LLMS_FULL_FILE="$DEST_DIR/llms-full.txt"

{
    cat << EOF
# LocalGhost.ai, Full Content Archive

Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)
Build: ${BUILD_ID}
Source: ${SITE_URL}

This file contains the full prose content of every published essay on LocalGhost.ai, rendered from source HTML into structured plaintext. Section headers (## N. TITLE), callouts ([ALARM], [SIGNAL]), and conclusion boxes are preserved as markdown. Each section is delimited by a machine-readable header with canonical URL.

EOF

    MANIFESTO_FILE="$SRC_DIR/manifesto.html"
    if [ -f "$MANIFESTO_FILE" ] && ! has_noindex "$MANIFESTO_FILE"; then
        echo "================================================================"
        echo "# The Manifesto"
        echo "URL: ${SITE_URL}/manifesto"
        echo "================================================================"
        echo ""
        html_to_text "$MANIFESTO_FILE"
        echo ""
    fi

    declare -a HT_POSTS
    while IFS= read -r -d '' post_file; do
        has_noindex "$post_file" && continue
        pubdate=$(extract_pubdate "$post_file")
        [ -z "$pubdate" ] && pubdate="1970-01-01"
        HT_POSTS+=("${pubdate}	${post_file}")
    done < <(find "$SRC_DIR/hard-truths" -name "*.html" -type f -print0 2>/dev/null)

    if [ "${#HT_POSTS[@]}" -gt 0 ]; then
        while IFS=$'\t' read -r pubdate post_file; do
            rel_path="${post_file#$SRC_DIR/}"
            url="${rel_path%.html}"
            title=$(extract_title "$post_file")
            echo "================================================================"
            echo "# ${title}"
            echo "URL: ${SITE_URL}/${url}"
            echo "Published: ${pubdate}"
            echo "================================================================"
            echo ""
            html_to_text "$post_file"
            echo ""
        done < <(printf '%s\n' "${HT_POSTS[@]}" | sort)
    fi
} > "$LLMS_FULL_FILE"

LLMS_FULL_SIZE=$(stat -c%s "$LLMS_FULL_FILE" 2>/dev/null || stat -f%z "$LLMS_FULL_FILE" 2>/dev/null)
LLMS_FULL_KB=$((LLMS_FULL_SIZE / 1024))
echo "  [🤖] llms-full.txt (${LLMS_FULL_KB}KB)"

# ============================================
# 6.7 RSS FEED GENERATION
# ============================================
echo ""
echo "> RSS FEED GENERATION..."

RSS_FILE="$DEST_DIR/feed.xml"
RSS_NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)

declare -a RSS_POSTS
while IFS= read -r -d '' post_file; do
    has_noindex "$post_file" && continue
    pubdate=$(extract_pubdate "$post_file")
    [ -z "$pubdate" ] && continue
    RSS_POSTS+=("${pubdate}	${post_file}")
done < <(find "$SRC_DIR/hard-truths" -name "*.html" -type f -print0 2>/dev/null)

FEED_UPDATED="$RSS_NOW"
if [ "${#RSS_POSTS[@]}" -gt 0 ]; then
    FEED_UPDATED=$(printf '%s\n' "${RSS_POSTS[@]}" | sort -r | head -1 | cut -f1)
fi

{
    cat << EOF
<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>LocalGhost Hard Truths</title>
  <subtitle>Uncomfortable observations about tech, power, and what we broke along the way.</subtitle>
  <link href="${SITE_URL}/feed.xml" rel="self" type="application/atom+xml"/>
  <link href="${SITE_URL}/hard-truths" rel="alternate" type="text/html"/>
  <id>${SITE_URL}/</id>
  <updated>${FEED_UPDATED}</updated>
  <author>
    <name>Vlad Cealicu</name>
    <uri>${SITE_URL}</uri>
  </author>
  <rights>© $(date +%Y) LocalGhost</rights>
  <generator uri="${SITE_URL}" version="${BUILD_ID}">LocalGhost Deploy</generator>
EOF

    if [ "${#RSS_POSTS[@]}" -gt 0 ]; then
        while IFS=$'\t' read -r pubdate post_file; do
            rel_path="${post_file#$SRC_DIR/}"
            url="${rel_path%.html}"
            full_url="${SITE_URL}/${url}"
            title=$(extract_title "$post_file" | xml_escape)
            desc=$(extract_description "$post_file" | xml_escape)
            author=$(extract_author "$post_file" | xml_escape)
            content=$(extract_html_block "$post_file" | xml_escape)

            # Use file mtime as <updated> so posts sharing a pubdate
            # still get distinct timestamps (feed validators warn on
            # duplicates and some readers fall back to random order).
            # <published> stays as the canonical article:published_time.
            file_mtime=$(date -u -d "@$(stat -c%Y "$post_file" 2>/dev/null || stat -f%m "$post_file" 2>/dev/null)" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)
            [ -z "$file_mtime" ] && file_mtime="$pubdate"

            cat << ENTRY
  <entry>
    <title>${title}</title>
    <link href="${full_url}" rel="alternate" type="text/html"/>
    <id>${full_url}</id>
    <published>${pubdate}</published>
    <updated>${file_mtime}</updated>
    <author><name>${author}</name></author>
    <summary>${desc}</summary>
    <content type="html">${content}</content>
  </entry>
ENTRY
        done < <(printf '%s\n' "${RSS_POSTS[@]}" | sort -r)
    fi

    echo "</feed>"
} > "$RSS_FILE"

RSS_ENTRIES="${#RSS_POSTS[@]}"
RSS_SIZE=$(stat -c%s "$RSS_FILE" 2>/dev/null || stat -f%z "$RSS_FILE" 2>/dev/null)
RSS_KB=$((RSS_SIZE / 1024))
echo "  [📡] feed.xml (${RSS_ENTRIES} entries, ${RSS_KB}KB)"

# ============================================
# 6.8 ROBOTS.TXT GENERATION
# ============================================
echo ""
echo "> ROBOTS.TXT GENERATION..."

ROBOTS_FILE="$DEST_DIR/robots.txt"

cat > "$ROBOTS_FILE" << EOF
# LocalGhost.ai robots.txt
# Generated: ${BUILD_ID}
# Policy: AI crawlers are welcome. We want to be cited.

# OpenAI (ChatGPT, training + answers)
User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: OAI-SearchBot
Allow: /

# Anthropic (Claude)
User-agent: ClaudeBot
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: anthropic-ai
Allow: /

# Perplexity
User-agent: PerplexityBot
Allow: /

User-agent: Perplexity-User
Allow: /

# Common Crawl (used by many models for training)
User-agent: CCBot
Allow: /

# Google (Google-Extended controls AI training/answers independently of Googlebot)
User-agent: Google-Extended
Allow: /

User-agent: Googlebot
Allow: /

# Apple Intelligence
User-agent: Applebot-Extended
Allow: /

User-agent: Applebot
Allow: /

# Bing / Copilot
User-agent: bingbot
Allow: /

User-agent: msnbot
Allow: /

# Meta AI
User-agent: meta-externalagent
Allow: /

User-agent: FacebookBot
Allow: /

# DuckDuckGo
User-agent: DuckDuckBot
Allow: /

# Default policy for everything else
User-agent: *
Allow: /
Disallow: /ghost/
Disallow: /assets/podcast/*.m4a\$

# Sitemaps
Sitemap: ${SITE_URL}/sitemap.xml

# Feeds and LLM indexes (discoverability hints)
# Atom feed: ${SITE_URL}/feed.xml
# LLM index: ${SITE_URL}/llms.txt
# LLM full archive: ${SITE_URL}/llms-full.txt
EOF

ROBOTS_LINES=$(wc -l < "$ROBOTS_FILE")
echo "  [🤖] robots.txt (${ROBOTS_LINES} lines)"

# 7. Deploy nginx config if changed
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

# 8. Sign deployment manifest
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