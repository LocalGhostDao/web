#!/bin/sh
# deploy/mirror/publish.sh [set ...] , build the LocalGhost setup mirror, served at
# https://www.localghost.ai/mirror, signed the same way as the site deploys: a sha256sum manifest,
# detach-signed with gpg by info@localghost.ai.
#
#   deploy/mirror/publish.sh                   # everything in mirror.conf
#   deploy/mirror/publish.sh geo landpolygons  # refresh those, keep the rest
#
# The scripts, conf and terms live here in deploy/mirror/ (never served). The mirror itself is built
# into public/mirror/, where the builds and the manifest are gitignored and only index.html (the page
# that explains the mirror) is in git. deploy/deploy.sh runs this on every deploy, then copies new
# builds into the web root (hard links, build dirs first, the signed manifest after).
# GHOST_MIRROR_DATA=<dir> builds somewhere else; a dir inside the repo is refused unless git ignores
# it, so the data (gigabytes) can never reach GitHub.
#
# Layout under the data dir:
#   MANIFEST.txt, MANIFEST.txt.asc     the signed list: "<sha256>  /<build>/<set>/<file>", one per file
#   <build>/<set>/<file>               the files, in a directory per publish (20260924T120000Z)
#   <build>/<set>/TERMS-<name>.txt     the terms each file travels under (signed with everything else)
#   <build>/<set>/NOTICE.txt           which file is under which terms, and where it came from
#
# A build directory never changes once published: a box halfway through a download when the next
# publish lands still gets the bytes its manifest named, and a CDN can cache it forever. Unchanged
# sets are hard-linked from the previous build (no copies); the last two builds are kept. The manifest
# and its signature are the last thing written. Nothing changed upstream = no new build.
#
# Boxes check the signature against tools/mirror-key.asc in the LocalGhost server repo
# (LocalGhostDao/localghost), with tools/mirror_fetch.sh. The first run here exports the public key
# to deploy/mirror/mirror-key.asc: commit it, and copy it to the server repo's tools/ too.
#
# Needs on this machine: curl, gpg with the info@localghost.ai secret key, sha256sum and flock. The
# mirror only proxies files: nothing is cut, converted or rebuilt here. Boxes do their own processing
# (the coastline tiles, for one) from the files they fetch.
set -eu
umask 022
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(realpath -m "${GHOST_MIRROR_DATA:-$HERE/../../public/mirror}")"
SETS="$*"
CONF="${GHOST_MIRROR_CONF:-$HERE/mirror.conf}"
TERMS="$HERE/terms"
TOP="$(git -C "$HERE" rev-parse --show-toplevel 2>/dev/null || (cd "$HERE/../.." && pwd))"
case "$ROOT/" in "$TOP"/*)
    # inside the repo only where git ignores it (public/mirror/'s builds and manifest are in .gitignore)
    if ! git -C "$TOP" check-ignore -q "$ROOT/MANIFEST.txt" 2>/dev/null; then
        echo "!! $ROOT is inside the repo ($TOP) and git does not ignore it , the data would end up on GitHub; add it to .gitignore or use a directory outside the repo" >&2
        exit 1
    fi ;;
esac
mkdir -p "$ROOT"
GPG_USER="${GHOST_MIRROR_GPG_USER:-info@localghost.ai}"
CACHE="${GHOST_MIRROR_CACHE:-$HOME/.cache/localghost-mirror}"
GODEV="${GHOST_MIRROR_GODEV_URL:-https://go.dev/dl/?mode=json&include=all}"
KEEP="${GHOST_MIRROR_KEEP:-2}"
mkdir -p "$CACHE"
exec 9>"$CACHE/publish.lock"      # one publish at a time (kept out of the web root)
if ! flock -n 9; then
    echo "!! another publish is running (lock: $CACHE/publish.lock)" >&2
    exit 1
fi
BUILD="$(date -u +%Y%m%dT%H%M%SZ)"
while [ -e "$ROOT/$BUILD" ]; do   # two publishes in one second: a build directory is never reused
    sleep 1
    BUILD="$(date -u +%Y%m%dT%H%M%SZ)"
done
NEW="$ROOT/$BUILD"
# anything that stops the publish before the manifest moves leaves no half-built directory behind
PUBLISHED=0
trap '[ "$PUBLISHED" = 1 ] || rm -rf "$NEW" "$ROOT/.MANIFEST.txt.tmp" "$ROOT/.MANIFEST.txt.asc.tmp"' EXIT

say() { echo "  $*" >&2; }
die() { echo "!! $*" >&2; exit 1; }
want() { [ -z "$SETS" ] && return 0; for s in $SETS; do [ "$s" = "$1" ] && return 0; done; return 1; }

# fetch <url> , the cached copy's path; downloaded again only when upstream says it changed
fetch() {
    _f="$CACHE/dl-$(printf '%s' "$1" | sha256sum | cut -c1-16)-$(basename "${1%%\?*}")"
    rm -f "$_f.tmp"
    if [ -s "$_f" ]; then
        curl -fsSL --retry 3 -R -z "$_f" -o "$_f.tmp" "$1" || return 1
    else
        say "downloading $1"
        curl -fsSL --retry 3 -R -o "$_f.tmp" "$1" || return 1
    fi
    if [ -s "$_f.tmp" ]; then mv -f "$_f.tmp" "$_f"; else rm -f "$_f.tmp"; fi   # a 304 writes nothing
    [ -s "$_f" ] || return 1
    echo "$_f"
}

# godev <name> <file> , the file's SHA-256 is the one go.dev publishes for that name
godev() {
    _want="$(curl -fsSL "$GODEV" | tr ',' '\n' | grep -A8 "\"filename\": \"$1\"" | grep '"sha256"' | head -1 | sed 's/.*"sha256": *"\([0-9a-f]*\)".*/\1/')"
    _got="$(sha256sum "$2" | cut -d' ' -f1)"
    [ -n "$_want" ] && [ "$_want" = "$_got" ]
}

# terms <name> <dest> , a terms file into the build; "#fetch <url>" on its first line means the text
# comes from that URL (cached like any download)
terms() {
    _t="$TERMS/$1.txt"
    [ -f "$_t" ] || return 1
    _first="$(head -1 "$_t")"
    case "$_first" in
        "#fetch "*) _src="$(fetch "${_first#\#fetch }")" || return 1; cp "$_src" "$2" ;;
        *) cp "$_t" "$2" ;;
    esac
}

# --- the sets this run refreshes ---
grep -v '^[[:space:]]*#' "$CONF" | awk 'NF' > "$CACHE/conf.tmp"
ALL="$(awk '{print $1}' "$CACHE/conf.tmp" | sort -u)"
for s in $SETS; do
    echo "$ALL" | grep -qx "$s" || die "no set '$s' in $CONF (it has: $(echo $ALL))"
done

PREV="$(sed -n 's/^# Build: //p' "$ROOT/MANIFEST.txt" 2>/dev/null | head -1)"
if [ -n "$PREV" ] && [ -d "$ROOT/$PREV" ]; then
    cp -al "$ROOT/$PREV" "$NEW"                    # hard links: the old build is never touched
else
    mkdir -p "$NEW"
fi
for s in $ALL; do
    want "$s" && rm -rf "${NEW:?}/$s"              # a refreshed set is rebuilt from the conf alone
done
# sets no longer in the conf are dropped
for d in "$NEW"/*/; do
    [ -d "$d" ] || continue
    echo "$ALL" | grep -qx "$(basename "$d")" || rm -rf "$d"
done

echo "> PUBLISHING ${SETS:-every set} as build $BUILD"
while read -r set file tnames source opt; do
    want "$set" || continue
    case "$file" in
        .*|*[!A-Za-z0-9._+-]*) die "line for $set: bad file name '$file'" ;;
    esac
    case "$source" in *'<'*) die "$set/$file: the source still has a placeholder: $source" ;; esac
    for t in $(echo "$tnames" | tr ',' ' '); do
        [ -f "$TERMS/$t.txt" ] || die "$set/$file: no terms file $TERMS/$t.txt"
        grep -q 'EDIT-ME' "$TERMS/$t.txt" && die "$set/$file: $TERMS/$t.txt still says EDIT-ME , finish it first"
    done
    case "$source" in
        http://*|https://*) src="$(fetch "$source")" || die "$set/$file: download failed: $source" ;;
        *) src="$source"; [ -f "$src" ] || die "$set/$file: no such file $src" ;;
    esac
    if [ "${opt:-}" = "check=godev" ]; then
        godev "$file" "$src" || die "$set/$file does not match go.dev's published checksum , not publishing it"
        say "$file matches go.dev's checksum"
    fi
    mkdir -p "$NEW/$set"
    # a download or a cut from the cache is hard-linked (same disk, no copy); a file of yours is copied
    case "$src" in
        "$CACHE"/*) ln -f "$src" "$NEW/$set/$file" 2>/dev/null || cp "$src" "$NEW/$set/$file" ;;
        *) cp "$src" "$NEW/$set/$file" ;;
    esac
    for t in $(echo "$tnames" | tr ',' ' '); do
        [ -f "$NEW/$set/TERMS-$t.txt" ] || terms "$t" "$NEW/$set/TERMS-$t.txt" || die "$set/$file: could not get terms $t"
    done
    upstream="$source"
    case "$source" in /*|./*) upstream="(provided by LocalGhost)" ;; esac
    printf '%s\n    terms: %s\n    from:  %s\n' "$file" "$(echo "$tnames" | sed 's/\([^,]*\)/TERMS-\1.txt/g; s/,/ /g')" "$upstream" >> "$NEW/$set/NOTICE.txt"
    say "$set/$file: $(du -h "$NEW/$set/$file" | cut -f1)"
done < "$CACHE/conf.tmp"
for s in $ALL; do
    if want "$s" && [ -f "$NEW/$s/NOTICE.txt" ]; then
        { echo "LocalGhost mirror, build $BUILD , set '$s'. Each file below is published under the terms named."; echo ""; cat "$NEW/$s/NOTICE.txt"; } > "$NEW/$s/.notice.tmp"
        mv -f "$NEW/$s/.notice.tmp" "$NEW/$s/NOTICE.txt"
    fi
done

# --- the manifest, exactly as the releases do it ---
body() { # the manifest's file lines with the build directory taken out, to compare two builds
    sed -n 's|^\([0-9a-f]\{64\}\)  /[^/]*/|\1  |p' "$1" | grep -v '/NOTICE.txt$' | sort -k2
}
MAN="$ROOT/.MANIFEST.txt.tmp"
{
    echo "# LocalGhost Mirror Manifest"
    echo "# Build: ${BUILD}"
    echo "# Signed: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo ""
    find "$NEW" -type f ! -name '.*' -exec sha256sum {} \; | sed "s|$ROOT||" | sort -k2
} > "$MAN"
if [ -f "$ROOT/MANIFEST.txt" ] && [ "$(body "$MAN")" = "$(body "$ROOT/MANIFEST.txt")" ]; then
    echo "> nothing changed upstream , the mirror stays at build $PREV"
    exit 0
fi
gpg --batch --yes --armor --local-user "$GPG_USER" --output "$ROOT/.MANIFEST.txt.asc.tmp" --detach-sign "$MAN" \
    || die "gpg could not sign as $GPG_USER"
# the pair, back to back; a box that reads between the two sees a signature that does not match and
# tries again a few seconds later (tools/mirror_fetch.sh)
mv -f "$MAN" "$ROOT/MANIFEST.txt"
mv -f "$ROOT/.MANIFEST.txt.asc.tmp" "$ROOT/MANIFEST.txt.asc"
PUBLISHED=1
FILE_COUNT=$(grep -c "^[a-f0-9]" "$ROOT/MANIFEST.txt")
echo "  [signed] MANIFEST.txt (${FILE_COUNT} files, build ${BUILD})"
echo "  [signed] MANIFEST.txt.asc"

# --- keep the last $KEEP builds ---
ls -1d "$ROOT"/[0-9]*T[0-9]*Z 2>/dev/null | sort | head -n "-$KEEP" | while read -r old; do
    rm -rf "$old"
    say "pruned $(basename "$old")"
done

# --- the key boxes check against ---
if [ ! -s "$HERE/mirror-key.asc" ]; then
    gpg --armor --export "$GPG_USER" > "$HERE/mirror-key.asc"
    echo "> exported the public key to deploy/mirror/mirror-key.asc , commit it, and copy it to the SERVER repo as tools/mirror-key.asc"
    echo "  and commit it there: boxes trust the key in their own repo"
    gpg --fingerprint "$GPG_USER" 2>/dev/null | sed -n '2p' | sed 's/^ */  fingerprint: /'
fi
