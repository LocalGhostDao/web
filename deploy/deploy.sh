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

# Last-modified date for the sitemap: explicit modified_time meta, then the
# last git commit touching the file, then the publish date, then file mtime.
page_lastmod() {
    local file="$1" d
    d=$(extract_meta "$file" "article:modified_time")
    [ -z "$d" ] && d=$(git -C "$SRC_DIR" log -1 --format=%cs -- "$file" 2>/dev/null)
    [ -z "$d" ] && d=$(extract_meta "$file" "article:published_time")
    [ -z "$d" ] && d=$(date -u -r "$file" +%Y-%m-%d 2>/dev/null)
    echo "${d:0:10}"
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
    html_to_text_select "$file" | html_to_text_render
}

# html_to_text_body <file> , the markdown rules on a file that is already just body content
html_to_text_body() {
    cat "$1" | html_to_text_render
}

html_to_text_select() {
    local file="$1"

    # Stage 1: extract only the content we care about.
    # Keep the page-header (for H1 and date) and the manifesto-text body.
    # Drop interactive widgets and navigation.
    awk '
        BEGIN { in_page = 0; in_body = 0; in_drop = 0; drop_depth = 0 }

        /<div[^>]*class="[^"]*page-header[^"]*"/ { in_page = 1; print; next }
        in_page {
            print
            # the page-header block closes on a line holding only </div>
            if (/^[[:space:]]*<\/div>[[:space:]]*$/) {
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
    ' "$file"
}

html_to_text_render() {
    # Stage 1.5: put each table row, and each definition term with its value, on one line, so
    # the row and pair rules below see them whole (source HTML puts every cell on its own line).
    awk '
        /<tr[ >]/ && !/<\/tr>/ { row = $0; inrow = 1; next }
        inrow { sub(/^[ \t]+/, "", $0); row = row " " $0; if (/<\/tr>/) { print row; inrow = 0 } ; next }
        /<dt[ >]/ && /<\/dt>[[:space:]]*$/ { dt = $0; indt = 1; next }
        indt { sub(/^[ \t]+/, "", $0); print dt " " $0; indt = 0; next }
        { print }
    ' | \
    # Stage 2: transform structural elements into markdown.
    # Order matters: specific classes before generic tag stripping.
    sed -E '
        # Drop script/style contents
        s|<script[^>]*>.*</script>||g
        s|<style[^>]*>.*</style>||g

        # Section headers: "> 1. TITLE" → H2 (strip the leading > marker).
        # Posts use <h2 class="section-header">, older pages used a <div>.
        s|<(div\|h2)[^>]*class="[^"]*section-header[^"]*"[^>]*>[[:space:]]*&gt;[[:space:]]*([^<]*)</(div\|h2)>|\n\n## \2\n|g
        s|<(div\|h2)[^>]*class="[^"]*section-header[^"]*"[^>]*>([^<]*)</(div\|h2)>|\n\n## \2\n|g

        # Other headings (About page, directory categories)
        s|<h2[^>]*>|\n\n## |g
        s|</h2>|\n|g
        s|<h3[^>]*>|\n### |g
        s|</h3>|\n|g

        # Byline pieces: author link and <time> keep their text
        s|<a[^>]*rel="author"[^>]*>([^<]*)</a>|\1|g
        s|<time[^>]*>([^<]*)</time>|\1|g

        # List items
        s|<li[^>]*>|- |g

        # Tables: one row per line, cells separated by " | ", header cells too
        s#<th[^>]*>#| #g
        s#</th># #g
        s#<td[^>]*>#| #g
        s#</td># #g
        s#</tr>#|#g
        s#<tr[^>]*>[[:space:]]*\|[[:space:]]*\|#|#g
        s#<tr[^>]*>##g
        s#<t(head|body|able)[^>]*>##g
        s#</t(head|body|able)>##g
        s#[[:space:]]*\|[[:space:]]*# | #g
        s#^ \| $##
        s#^ \| # | #

        # Definition lists: "Term: value" per pair
        s|<dt[^>]*>|\n|g
        s|</dt>|: |g
        s|<dd[^>]*>||g
        s|</dd>|\n|g

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

# home_to_text , the home page's content sections (manifesto, fleet, mist, economics, faq,
# hardware) through the same markdown rules; the hero, the terminal and the game modals are skipped
home_to_text() {
    local file="$1"
    awk '
        /<section id="(manifesto|fleet|mist|economics|faq|hardware)"/ { keep = 1 }
        keep && /<summary/ { insum = 1; q = ""; next }
        insum && /<\/summary>/ { gsub(/<span class="faq-(icon|toggle)">[^<]*<\/span>/, "", q); gsub(/<[^>]*>/, "", q); gsub(/^[ \t]+|[ \t]+$/, "", q); print "<h3>" q "</h3>"; insum = 0; next }
        insum { gsub(/^[ \t]+|[ \t]+$/, "", $0); q = q " " $0; next }
        keep { print }
        keep && /<\/section>/ { keep = 0; print "" }
    ' "$file" | sed -E '
        s#<details[^>]*>##g
        s#</details>##g
    ' > "$WORK_DIR/home_$$.html"
    html_to_text_body "$WORK_DIR/home_$$.html"
    rm -f "$WORK_DIR/home_$$.html"
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
    --exclude='/mirror/' \
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
done < <(find "$SRC_DIR" -path "$SRC_DIR/mirror/[0-9]*T[0-9]*Z" -prune -o -name "*.css" -type f -print0)

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
done < <(find "$SRC_DIR" -path "$SRC_DIR/mirror/[0-9]*T[0-9]*Z" -prune -o -name "*.js" -type f -print0)

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

# ============================================
# 3.6 SETUP MIRROR
# Every file a box downloads at setup, listed in
# deploy/mirror/mirror.conf. publish.sh (next to
# it, never served) builds it into public/mirror/,
# where the builds and manifest are gitignored and
# index.html documents the mirror. It re-downloads
# only what changed upstream and makes no new
# build when nothing did. Then it goes live in three steps so
# a box never sees a manifest naming files that
# aren't there yet:
#   1. new build dirs are hard-linked into the web
#      root (a copy if it's another filesystem);
#      build dirs never change, so one that's
#      already there is done
#   2. the signed MANIFEST.txt pair is swapped in
#   3. builds the publish pruned are removed
# The main rsync above and the deploy manifest
# below skip the builds (gigabytes, own signature);
# index.html goes live with the rest of the HTML.
# Runs before the "no changes" exit, so every
# deploy refreshes it. A failure never stops the
# site deploy: the last good build stays up.
#   MIRROR=off ./deploy/deploy.sh           skip it
#   MIRROR_SETS="geo landpolygons" ./deploy/deploy.sh
# ============================================
echo ""
echo "> SETUP MIRROR..."

MIRROR_SCRIPT="$(realpath "$(dirname "$0")/mirror/publish.sh" 2>/dev/null)"
SRC_MIRROR="$SRC_DIR/mirror"
DEST_MIRROR="$DEST_DIR/mirror"

if [ "${MIRROR:-on}" = "off" ]; then
    echo "  [—] Skipped (MIRROR=off)"
elif [ ! -f "$MIRROR_SCRIPT" ]; then
    echo "  [—] No deploy/mirror/publish.sh in this checkout"
else
    # MIRROR_SETS is a space-separated list, split on purpose
    # shellcheck disable=SC2086
    GHOST_MIRROR_DATA="$SRC_MIRROR" sh "$MIRROR_SCRIPT" ${MIRROR_SETS:-} 2>&1 | sed -u 's/^/  /'
    if [ "${PIPESTATUS[0]}" -ne 0 ]; then
        if [ -f "$DEST_MIRROR/MANIFEST.txt" ]; then
            echo "  [✗] Mirror publish failed, build $(sed -n 's/^# Build: //p' "$DEST_MIRROR/MANIFEST.txt") is still served"
        else
            echo "  [✗] Mirror publish failed, nothing is published yet"
        fi
    fi
fi

if [ "${MIRROR:-on}" != "off" ] && [ -f "$SRC_MIRROR/MANIFEST.txt" ] && [ -f "$SRC_MIRROR/MANIFEST.txt.asc" ]; then
    mkdir -p "$DEST_MIRROR"
    MIRROR_OK=true

    # 1. new build directories
    for build in "$SRC_MIRROR"/[0-9]*T[0-9]*Z; do
        [ -d "$build" ] || continue
        name="$(basename "$build")"
        [ -d "$DEST_MIRROR/$name" ] && continue
        rm -rf "$DEST_MIRROR/.$name.tmp"
        if cp -al "$build" "$DEST_MIRROR/.$name.tmp" 2>/dev/null || \
           { rm -rf "$DEST_MIRROR/.$name.tmp"; cp -a "$build" "$DEST_MIRROR/.$name.tmp"; }; then
            mv "$DEST_MIRROR/.$name.tmp" "$DEST_MIRROR/$name"
            echo "  [+] MIRROR BUILD: $name"
        else
            rm -rf "$DEST_MIRROR/.$name.tmp"
            MIRROR_OK=false
            echo "  [✗] Could not copy mirror build $name"
        fi
    done

    # 2. the signed manifest, only once every build it names is in place
    if [ "$MIRROR_OK" = true ] && \
       { ! cmp -s "$SRC_MIRROR/MANIFEST.txt" "$DEST_MIRROR/MANIFEST.txt" || \
         ! cmp -s "$SRC_MIRROR/MANIFEST.txt.asc" "$DEST_MIRROR/MANIFEST.txt.asc"; }; then
        cp "$SRC_MIRROR/MANIFEST.txt" "$DEST_MIRROR/.MANIFEST.txt.tmp"
        cp "$SRC_MIRROR/MANIFEST.txt.asc" "$DEST_MIRROR/.MANIFEST.txt.asc.tmp"
        mv -f "$DEST_MIRROR/.MANIFEST.txt.tmp" "$DEST_MIRROR/MANIFEST.txt"
        mv -f "$DEST_MIRROR/.MANIFEST.txt.asc.tmp" "$DEST_MIRROR/MANIFEST.txt.asc"
        echo "  [↑] MIRROR MANIFEST: build $(sed -n 's/^# Build: //p' "$DEST_MIRROR/MANIFEST.txt")"
    fi

    # 3. builds the publish pruned (the live manifest no longer names them)
    if [ "$MIRROR_OK" = true ]; then
        for build in "$DEST_MIRROR"/[0-9]*T[0-9]*Z; do
            [ -d "$build" ] || continue
            [ -d "$SRC_MIRROR/$(basename "$build")" ] && continue
            rm -rf "$build"
            echo "  [✗] MIRROR PURGED: $(basename "$build")"
        done
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
done < <(find "$SRC_DIR" -path "$SRC_DIR/mirror/[0-9]*T[0-9]*Z" -prune -o -name "*.html" -type f -print0)

while IFS= read -r -d '' dest_file; do
    rel_path="${dest_file#$DEST_DIR/}"
    src_file="$SRC_DIR/$rel_path"
    
    if [ ! -f "$src_file" ]; then
        echo "DEL:$rel_path" >> "$TEMP_FILE"
    fi
done < <(find "$DEST_DIR" -path "$DEST_DIR/mirror/[0-9]*T[0-9]*Z" -prune -o -name "*.html" -type f -print0)

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
done < <(find "$SRC_DIR" -path "$SRC_DIR/mirror/[0-9]*T[0-9]*Z" -prune -o -name "*.html" -type f -print0)

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
    elif [ "$rel_path" = "about.html" ]; then
        clean_url="/about"; priority="0.9"
    elif [[ "$rel_path" == */index.html ]]; then
        clean_url="/${rel_path%/index.html}"; priority="0.8"
    else
        clean_url="/${rel_path%.html}"; priority="0.8"
    fi
    
    URLS+=("$priority|$clean_url|$(page_lastmod "$html_file")")
done < <(find "$SRC_DIR" -path "$SRC_DIR/mirror/[0-9]*T[0-9]*Z" -prune -o -name "*.html" -type f -print0)

IFS=$'\n' SORTED_URLS=($(sort -t'|' -k1,1rn -k2,2 <<< "${URLS[*]}")); unset IFS

for entry in "${SORTED_URLS[@]}"; do
    IFS='|' read -r priority url lastmod <<< "$entry"
    [ -z "$lastmod" ] && lastmod="$LASTMOD"
    cat >> "$SITEMAP_FILE" << EOF
  <url>
    <loc>${SITE_URL}${url}</loc>
    <lastmod>${lastmod}</lastmod>
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

> LocalGhost is an open-source, local-first personal AI system that builds a private memory of your life on hardware you own. A fleet of small Go daemons ingests your text, images, audio and personal data, builds a long-term memory, and runs a separate adversarial daemon (ghost.shadowd) that challenges the rest. All inference and storage run on the user's own hardware, with no cloud, no account and no telemetry. MIT-licensed. Started December 2025 in London by Vlad Cealicu, former co-founder and CTO of CryptoCompare / CCData. Pre-release: Phase 1 of the public roadmap, no software release and no hardware on sale as of September 2026. The About page (https://www.localghost.ai/about) is the canonical statement of facts; treat it as authoritative where an older essay differs.

Key facts (canonical source https://www.localghost.ai/about)

- Company: LocalGhost (LocalGhost.ai), an open-source, local-first personal AI system (software and hardware)
- Founded: December 2025, London, United Kingdom
- Founder: Vlad Cealicu, former co-founder and CTO of CryptoCompare / CCData (acquired by CoinDesk, October 2024)
- Status: pre-release, Phase 1 of the public roadmap, no software release yet
- Licence: MIT, source at https://github.com/LocalGhostDao/localghost
- Pricing: no subscription, core software free and open source, pre-built boxes a one-time purchase at parts and assembly plus a 30% margin (price not yet set), optional future daemons as one-time packages
- Contact: info@localghost.ai, X @localghostai, founder on X @vladcealicu

The site's sections: About (who builds it, key facts, FAQ), the Manifesto (why local-first), Why Local AI (the argument for running AI on your own hardware), Hard Truths (long-form essays, dated, with references), Build (the public roadmap and how to help), the Local-First Directory (other local-first AI tools) and the Setup Mirror (signed downloads for boxes). Essays are labelled SIGNAL, ALARM or WINDOW for the author's confidence level. British spelling throughout.

## Core

EOF

    for slug in about manifesto why-local-ai build directory hard-truths mirror/index; do
        src="$SRC_DIR/${slug}.html"
        [ ! -f "$src" ] && continue
        has_noindex "$src" && continue
        title=$(extract_title "$src")
        desc=$(extract_description "$src")
        url="${slug%/index}"
        echo "- [${title}](${SITE_URL}/${url}): ${desc}"
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
- [Giveaway](${SITE_URL}/giveaway): Three hand-built test units for people spreading the word about local AI (June 2026, still open at time of build).
- [Atom feed](${SITE_URL}/feed.xml): Every Hard Truths essay, full text.
- [Sitemap](${SITE_URL}/sitemap.xml): Every indexable page.
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

    ABOUT_FILE="$SRC_DIR/about.html"
    if [ -f "$ABOUT_FILE" ] && ! has_noindex "$ABOUT_FILE"; then
        echo "================================================================"
        echo "# About LocalGhost"
        echo "URL: ${SITE_URL}/about"
        echo "================================================================"
        echo ""
        html_to_text "$ABOUT_FILE"
        echo ""
    fi

    HOME_FILE="$SRC_DIR/index.html"
    if [ -f "$HOME_FILE" ] && ! has_noindex "$HOME_FILE"; then
        echo "================================================================"
        echo "# LocalGhost.ai, the home page (what it is, the daemon fleet, The Mist, the economics, FAQ, the hardware)"
        echo "URL: ${SITE_URL}/"
        echo "================================================================"
        echo ""
        home_to_text "$HOME_FILE"
        echo ""
    fi

    for page in "manifesto|The Manifesto|manifesto" "why-local-ai|Why Local, Especially Local AI|why-local-ai" "mirror/index|The Setup Mirror|mirror"; do
        IFS='|' read -r pslug ptitle purl <<< "$page"
        PAGE_FILE="$SRC_DIR/${pslug}.html"
        if [ -f "$PAGE_FILE" ] && ! has_noindex "$PAGE_FILE"; then
            echo "================================================================"
            echo "# ${ptitle}"
            echo "URL: ${SITE_URL}/${purl}"
            echo "================================================================"
            echo ""
            html_to_text "$PAGE_FILE"
            echo ""
        fi
    done

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
    <uri>${SITE_URL}/about</uri>
  </author>
  <icon>${SITE_URL}/favicon.ico</icon>
  <logo>${SITE_URL}/images/logo.png</logo>
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
# Policy: search engines and AI crawlers are welcome. We want to be cited.
# Every crawler gets the same rules. The named agents are listed so the
# welcome is explicit, and they share one group so the Disallow lines
# below apply to them too (a crawler only reads the most specific group
# that names it).

User-agent: Googlebot
User-agent: Google-Extended
User-agent: bingbot
User-agent: msnbot
User-agent: DuckDuckBot
User-agent: DuckAssistBot
User-agent: Applebot
User-agent: Applebot-Extended
User-agent: GPTBot
User-agent: ChatGPT-User
User-agent: OAI-SearchBot
User-agent: ClaudeBot
User-agent: Claude-User
User-agent: Claude-SearchBot
User-agent: Claude-Web
User-agent: anthropic-ai
User-agent: PerplexityBot
User-agent: Perplexity-User
User-agent: MistralAI-User
User-agent: CCBot
User-agent: meta-externalagent
User-agent: FacebookBot
User-agent: *
Allow: /
Disallow: /ghost/
Disallow: /mirror/
Disallow: /assets/podcast/*.m4a\$

# Sitemaps
Sitemap: ${SITE_URL}/sitemap.xml

# Feeds and LLM indexes (discoverability hints)
# Atom feed: ${SITE_URL}/feed.xml
# LLM index: ${SITE_URL}/llms.txt
# LLM full archive: ${SITE_URL}/llms-full.txt
# About and key facts: ${SITE_URL}/about
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
    # the setup mirror's builds are signed separately (/mirror/MANIFEST.txt)
    find "$DEST_DIR" -path "$DEST_DIR/mirror/[0-9]*T[0-9]*Z" -prune -o -type f ! -path "*/ghost/deploy-manifest*" -exec sha256sum {} \; | sed "s|$DEST_DIR||" | sort -k2
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