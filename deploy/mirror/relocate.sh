#!/bin/sh
# deploy/mirror/relocate.sh [<mirror-root>] , move the setup mirror off the root SSD, once.
#
#   deploy/mirror/relocate.sh                         # to /bulk/localghost/mirror
#   deploy/mirror/relocate.sh /some/other/pool/mirror
#
# What it does, in order, and each step is skipped if already done:
#   1. creates <root>/cache and <root>/data
#   2. moves the publish cache from ~/.cache/localghost-mirror into <root>/cache (the pinned model
#      weights and the last downloads, so nothing is fetched again)
#   3. deletes the builds and manifest publish.sh left in public/mirror/ of this checkout (they were
#      hard links onto that cache, and are rebuilt from it on the next deploy)
#   4. replaces the web root's mirror directory with a symlink to <root>/data (index.html is
#      rewritten by the next deploy)
#   5. makes <root> and <root>/data world-readable so nginx can serve them
# Then run ./deploy/deploy.sh: it publishes into <root>/data from the moved cache with no downloads.
#
# Nothing here touches the mirror's sources of truth (mirror.conf, terms) or anything outside the
# three mirror locations. Run it as the deploy user. sudo is used only for the web root symlink if
# the web root isn't yours.
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="${1:-/bulk/localghost/mirror}"
DEST_DIR="${DEST_DIR:-/var/www/localghost.ai/public}"
OLD_CACHE="${GHOST_MIRROR_CACHE:-$HOME/.cache/localghost-mirror}"
CHECKOUT_MIRROR="$(realpath -m "$HERE/../../public/mirror")"

say() { echo "  $*"; }
size() { du -sh "$1" 2>/dev/null | cut -f1; }

echo "> RELOCATING THE SETUP MIRROR TO $ROOT"

# 1. the destination
if [ ! -d "$ROOT" ]; then
    mkdir -p "$ROOT" 2>/dev/null || { echo "!! cannot create $ROOT (try: sudo mkdir -p $ROOT && sudo chown $USER $ROOT)" >&2; exit 1; }
fi
[ -w "$ROOT" ] || { echo "!! $ROOT is not writable by $USER (try: sudo chown $USER $ROOT)" >&2; exit 1; }
mkdir -p "$ROOT/cache" "$ROOT/data"
case "$(realpath -m "$ROOT")/" in "$(realpath -m "$HERE/../..")"/*) echo "!! $ROOT is inside the repo" >&2; exit 1 ;; esac

# 2. the cache: move file by file, keep whatever is already there
if [ -d "$OLD_CACHE" ] && [ "$(realpath -m "$OLD_CACHE")" != "$(realpath -m "$ROOT/cache")" ]; then
    n=0
    for f in "$OLD_CACHE"/*; do
        [ -e "$f" ] || continue
        b="$(basename "$f")"
        case "$b" in publish.lock|conf.tmp|*.tmp) rm -rf "$f"; continue ;; esac
        if [ -e "$ROOT/cache/$b" ]; then
            rm -rf "$f"           # already moved on an earlier run
        else
            mv "$f" "$ROOT/cache/$b"
            n=$((n + 1))
        fi
    done
    rmdir "$OLD_CACHE" 2>/dev/null || true
    say "cache: moved $n file(s) from $OLD_CACHE ($(size "$ROOT/cache") now in $ROOT/cache)"
else
    say "cache: nothing to move"
fi

# 3. builds in the checkout
n=0
for d in "$CHECKOUT_MIRROR"/[0-9]*T[0-9]*Z; do
    [ -d "$d" ] || continue
    rm -rf "$d"; n=$((n + 1))
done
rm -f "$CHECKOUT_MIRROR/MANIFEST.txt" "$CHECKOUT_MIRROR/MANIFEST.txt.asc" "$CHECKOUT_MIRROR"/.MANIFEST.txt*.tmp
say "checkout: removed $n build(s) from $CHECKOUT_MIRROR (index.html stays)"

# 4. the web root
if [ -L "$DEST_DIR/mirror" ] && [ "$(readlink -f "$DEST_DIR/mirror")" = "$(readlink -f "$ROOT/data")" ]; then
    say "web root: $DEST_DIR/mirror already points at $ROOT/data"
elif [ -e "$DEST_DIR/mirror" ] || [ -L "$DEST_DIR/mirror" ]; then
    s="$(size "$DEST_DIR/mirror")"
    if [ -w "$DEST_DIR" ]; then
        rm -rf "$DEST_DIR/mirror"; ln -s "$ROOT/data" "$DEST_DIR/mirror"
    else
        sudo rm -rf "$DEST_DIR/mirror"; sudo ln -s "$ROOT/data" "$DEST_DIR/mirror"
    fi
    say "web root: replaced $DEST_DIR/mirror (${s}) with a symlink to $ROOT/data"
else
    if [ -w "$DEST_DIR" ]; then ln -s "$ROOT/data" "$DEST_DIR/mirror"; else sudo ln -s "$ROOT/data" "$DEST_DIR/mirror"; fi
    say "web root: $DEST_DIR/mirror -> $ROOT/data"
fi

# 5. nginx must be able to read it: the data dir, and every directory above it
chmod 755 "$ROOT" "$ROOT/data"
p="$(dirname "$ROOT")"
while [ "$p" != "/" ]; do
    perm="$(stat -c %a "$p" 2>/dev/null || echo 755)"
    case "$perm" in *[1357]) ;; *) say "!! $p is mode $perm, nginx needs x on it (sudo chmod o+x $p)" ;; esac
    p="$(dirname "$p")"
done

echo "> DONE. Now run ./deploy/deploy.sh (publishes into $ROOT/data from the moved cache, no downloads)"
