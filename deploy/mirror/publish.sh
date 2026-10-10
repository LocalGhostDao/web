#!/bin/sh
# deploy/mirror/publish.sh [set ...] , build the LocalGhost setup mirror, served at
# https://www.localghost.ai/mirror, signed the same way as the site deploys: a sha256sum manifest,
# detach-signed with gpg by info@localghost.ai.
#
#   deploy/mirror/publish.sh                   # everything in mirror.conf
#   deploy/mirror/publish.sh geo landpolygons  # refresh those, keep the rest
#   deploy/mirror/publish.sh --sign-later roads   # download and build, but don't sign: nothing goes
#                                                 # live, no passphrase asked (an hour of downloads
#                                                 # shouldn't end in a pinentry nobody is there for)
#   deploy/mirror/publish.sh --sign               # sign the waiting build and put it live, any time
#                                                 # later (a plain publish or a deploy does that too)
#   deploy/mirror/publish.sh --monthly            # what deploy.sh runs: upstream is checked on the
#                                                 # first run of each month (UTC) and never again that
#                                                 # month; the other runs publish only what mirror.conf
#                                                 # or terms/ added or changed, from the cache
#
# With a terminal, every download shows curl's progress meter (size, speed, time left) and every file
# hashed for the first time says so, so a long publish never looks stuck.
#
# The scripts, conf and terms live here in deploy/mirror/ (never served). deploy/deploy.sh runs this
# (with --monthly) on every deploy with GHOST_MIRROR_DATA=/bulk/localghost/mirror/data and
# GHOST_MIRROR_CACHE=/bulk/localghost/mirror/cache, and the web root's /mirror is a symlink to that
# data dir, so a build goes live the moment its manifest is written and nothing is copied. Without
# those variables it builds into public/mirror/ in this checkout (gitignored) and caches in
# ~/.cache/localghost-mirror. A data dir inside the repo is refused unless git ignores it, so the
# data (gigabytes) can never reach GitHub.
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
# The manifest is signed with the site's own key, the one published at
# https://www.localghost.ai/.well-known/pgp-key.asc (public/.well-known/pgp-key.asc in this repo).
# Before anything is downloaded, the signing key's fingerprint is checked against that file, so the
# mirror can never be signed with a key the site doesn't publish. Boxes check the signature against
# a pinned copy of that same key, tools/mirror-key.asc in the LocalGhost server repo
# (LocalGhostDao/localghost), with tools/mirror_fetch.sh.
#
# Needs on this machine: curl, gpg with the info@localghost.ai secret key, sha256sum and flock. The
# mirror proxies files: nothing is cut or converted here, and boxes do their own processing (the
# coastline tiles, for one) from the files they fetch. One exception, a set whose list= line says
# pack=heights (elevation): its tiles go into the build as packs, one file per 30-degree block, each
# tile's bytes unchanged behind a small index, made here with ghost-heights from the release the
# server set pins (a linux-amd64 binary, so this machine has to run one). 26,000 loose tiles made a
# manifest every box and phone had to read; the same tiles and the same tool give the same bytes.
set -eu
umask 022
HERE="$(cd "$(dirname "$0")" && pwd)"
# Where the data goes: GHOST_MIRROR_DATA, else the pool deploy.sh uses (MIRROR_DATA, default
# /bulk/localghost/mirror) when it exists, else public/mirror/ in this checkout.
MIRROR_DATA="${MIRROR_DATA:-/bulk/localghost/mirror}"
if [ -z "${GHOST_MIRROR_DATA:-}" ] && [ -d "$MIRROR_DATA" ] && [ -w "$MIRROR_DATA" ]; then
    GHOST_MIRROR_DATA="$MIRROR_DATA/data"
    GHOST_MIRROR_CACHE="${GHOST_MIRROR_CACHE:-$MIRROR_DATA/cache}"
fi
ROOT="$(realpath -m "${GHOST_MIRROR_DATA:-$HERE/../../public/mirror}")"
SETS=""; MODE=publish; SIGN_LATER=""; MONTHLY=""
for a in "$@"; do
    case "$a" in
        --sign) MODE=sign ;;
        --sign-later) SIGN_LATER=1 ;;
        --monthly) MONTHLY=1 ;;
        -*) echo "!! unknown option $a (this takes set names, --sign-later, --sign or --monthly)" >&2; exit 1 ;;
        *) SETS="$SETS $a" ;;
    esac
done
SETS="${SETS# }"
[ "$MODE" = sign ] && [ -n "$SETS$SIGN_LATER" ] && { echo "!! --sign takes nothing else: it signs the build that is waiting" >&2; exit 1; }
# curl: the progress meter (size, speed, time left) when someone is watching, quiet when a deploy
# log is
if [ -t 2 ]; then CURL="curl -fSL --retry 3"; else CURL="curl -fsSL --retry 3"; fi
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
PUBKEY="${GHOST_MIRROR_PUBKEY:-$HERE/../../public/.well-known/pgp-key.asc}"
# the key that signs must be the key the site publishes
_pub="$(gpg --batch --with-colons --import-options show-only --import "$PUBKEY" 2>/dev/null | awk -F: '$1=="fpr"{print $10; exit}')"
_sec="$(gpg --batch --with-colons --list-secret-keys "$GPG_USER" 2>/dev/null | awk -F: '$1=="fpr"{print $10; exit}')"
if [ -z "$_pub" ]; then
    echo "!! cannot read the published key $PUBKEY" >&2
    exit 1
fi
if [ "$_sec" != "$_pub" ]; then
    echo "!! the secret key for $GPG_USER (${_sec:-none in this keyring}) is not the key published in $PUBKEY ($_pub) , not signing with it" >&2
    exit 1
fi
CACHE="${GHOST_MIRROR_CACHE:-$HOME/.cache/localghost-mirror}"
GODEV="${GHOST_MIRROR_GODEV_URL:-https://go.dev/dl/?mode=json&include=all}"
KEEP="${GHOST_MIRROR_KEEP:-2}"
mkdir -p "$CACHE"
touch "$CACHE/sha256.cache"
exec 9>"$CACHE/publish.lock"      # one publish at a time (kept out of the web root)
if ! flock -n 9; then
    echo "!! another publish is running (lock: $CACHE/publish.lock)" >&2
    exit 1
fi
# --monthly: upstream is asked at most once a calendar month (UTC). The first run of the month (the
# first deploy on or after the 1st) checks every set as usual and writes the date to
# $CACHE/upstream-checked. Every other run that month is OFFLINE: a URL already in the cache is used as
# it is, without asking upstream, so only lines new or changed in mirror.conf (a new set, a new pin, a
# new URL) and edits under terms/ reach the network or make a new build. Named sets always go upstream.
STAMP="$CACHE/upstream-checked"
MONTH="$(date -u +%Y-%m)"
LAST_CHECK="$(head -1 "$STAMP" 2>/dev/null || true)"
OFFLINE=""
if [ -n "$MONTHLY" ] && [ -z "$SETS" ] && [ "$MODE" = publish ]; then
    case "$LAST_CHECK" in "$MONTH"-*) OFFLINE=1 ;; esac
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
# want <set> , is this set refreshed in this run? Named sets always; with no sets named, every set
# except the ones marked "manual" in mirror.conf (they keep whatever the previous build had)
want() { for s in $REFRESH; do [ "$s" = "$1" ] && return 0; done; return 1; }

# cached <url> , where fetch keeps its copy of <url>
cached() {
    echo "$CACHE/dl-$(printf '%s' "$1" | sha256sum | cut -c1-16)-$(basename "${1%%\?*}")"
}

# fetch <url> , the cached copy's path; downloaded again only when upstream says it changed, and
# never asked at all in an OFFLINE run when the cache already has it
fetch() {
    _f="$(cached "$1")"
    rm -f "$_f.tmp"
    if [ -n "$OFFLINE" ] && [ -s "$_f" ]; then
        echo "$_f"; return 0
    fi
    if [ -s "$_f" ]; then
        # on a terminal, ask with a HEAD first, so an unchanged file doesn't print an empty meter
        if [ -t 2 ] && [ "$(curl -fsSL --retry 3 -I -z "$_f" -o /dev/null -w '%{http_code}' "$1" 2>/dev/null)" = 304 ]; then
            echo "$_f"; return 0
        fi
        $CURL -R -z "$_f" -o "$_f.tmp" "$1" || return 1
    else
        say "downloading $1${OFFLINE:+ (new in mirror.conf)}"
        $CURL -R -o "$_f.tmp" "$1" || return 1
    fi
    if [ -s "$_f.tmp" ]; then mv -f "$_f.tmp" "$_f"; else rm -f "$_f.tmp"; fi   # a 304 writes nothing
    [ -s "$_f" ] || return 1
    echo "$_f"
}

# pinned <source> <sha256> <file> , a file whose SHA-256 is fixed in mirror.conf (check=sha256:...).
# Downloaded (resuming a partial download) or copied into the cache once, checked, and from then on
# never downloaded or hashed again: the cache name carries the hash. Used for big files that must not
# change under us, like model weights.
pinned() {
    _p="$CACHE/pin-$2-$3"
    if [ ! -s "$_p" ]; then
        case "$1" in
            http://*|https://*) say "downloading $1"; $CURL -C - -o "$_p.tmp" "$1" || return 1 ;;
            *) [ -f "$1" ] || return 1; cp "$1" "$_p.tmp" || return 1 ;;
        esac
        _got="$(sha256sum "$_p.tmp" | cut -d' ' -f1)"
        if [ "$_got" != "$2" ]; then
            rm -f "$_p.tmp"
            say "$3 has sha256 $_got, mirror.conf pins $2"
            return 1
        fi
        mv -f "$_p.tmp" "$_p"
    fi
    echo "$_p"
}

# sha_cached <file> , "<sha256>  <file>", from $CACHE/sha256.cache when the file's device, inode,
# size and mtime are already there. Build files are hard links onto cache files that never change
# in place (a new download is a new inode), so the 80 GB road extracts are hashed once, not at
# every publish.
SHACACHE="$CACHE/sha256.cache"
sha_cached() {
    _k="$(stat -c '%d:%i:%s:%Y' "$1")"
    _h="$(grep -m1 "^$_k " "$SHACACHE" 2>/dev/null | cut -d' ' -f2)"
    if [ -z "$_h" ]; then
        # a big file is read once here, and that can take minutes on 33 GB: say so
        [ "$(stat -c %s "$1")" -gt 268435456 ] && say "hashing ${1#$ROOT/} ($(du -h --apparent-size "$1" | cut -f1)), once"
        _h="$(sha256sum "$1" | cut -d' ' -f1)"
        echo "$_k $_h" >> "$SHACACHE"
    fi
    echo "$_h  $1"
}

# godev <name> <file> , the file's SHA-256 is the one go.dev publishes for that name. A release's
# checksum never changes, so a match is remembered ($CACHE/godev.ok) and not asked again.
GODEV_OK="$CACHE/godev.ok"
godev() {
    _got="$(sha_cached "$2" | cut -d' ' -f1)"
    grep -qx "$_got $1" "$GODEV_OK" 2>/dev/null && return 0
    _want="$(curl -fsSL "$GODEV" | tr ',' '\n' | grep -A8 "\"filename\": \"$1\"" | grep '"sha256"' | head -1 | sed 's/.*"sha256": *"\([0-9a-f]*\)".*/\1/')"
    [ -n "$_want" ] && [ "$_want" = "$_got" ] || return 1
    echo "$_got $1" >> "$GODEV_OK"
}

# resolve <source> , the URL to fetch. A source whose last part has a * in it names the newest of a
# dated series (wikipedia_en_all_nopic_*.zim): the directory listing is read and the last match in
# sort order wins. The answer is remembered in $CACHE/resolved, so an OFFLINE run uses the file it
# already has instead of asking upstream.
RESOLVED="$CACHE/resolved"
resolve() {
    case "${1##*/}" in *'*'*) ;; *) echo "$1"; return 0 ;; esac
    _prev="$(awk -v g="$1" '$1 == g { u = $2 } END { print u }' "$RESOLVED" 2>/dev/null || true)"
    if [ -n "$OFFLINE" ] && [ -n "$_prev" ]; then echo "$_prev"; return 0; fi
    _dir="${1%/*}/"
    _re="$(printf '%s' "${1##*/}" | sed 's/[.]/\\./g; s/[*]/[^"\/]*/g')"
    _name="$(curl -fsSL --retry 3 "$_dir" 2>/dev/null | grep -o "href=\"\([^\"]*/\)\{0,1\}$_re\"" | sed 's/^href="//; s/"$//; s|.*/||' | sort | tail -1)"
    if [ -z "$_name" ]; then
        [ -n "$_prev" ] || return 1
        say "could not list $_dir, keeping ${_prev##*/}"
        echo "$_prev"; return 0
    fi
    [ "$_dir$_name" = "$_prev" ] || echo "$1 $_dir$_name" >> "$RESOLVED"
    echo "$_dir$_name"
}

# sumfile <url> <file> , the file's SHA-256 is the one upstream publishes beside it at <url>.sha256
# (download.kiwix.org does this for every ZIM). A match is remembered ($CACHE/sums.ok).
SUMS_OK="$CACHE/sums.ok"
sumfile() {
    _got="$(sha_cached "$2" | cut -d' ' -f1)"
    grep -qx "$_got $1" "$SUMS_OK" 2>/dev/null && return 0
    _want="$(curl -fsSL --retry 3 "$1.sha256" 2>/dev/null | awk '{ print $1; exit }')"
    [ -n "$_want" ] && [ "$_want" = "$_got" ] || return 1
    echo "$_got $1" >> "$SUMS_OK"
}

# terms <name> <dest> , a terms file into the build; "#fetch <url>" on its first line means the text
# comes from that URL (cached like any download)
terms() {
    _t="$TERMS/$1.txt"
    [ -f "$_t" ] || return 1
    _first="$(head -1 "$_t")"
    case "$_first" in
        "#fetch "*)
            # a licence text rarely changes: if its host is down, the copy fetched last time will do
            _u="${_first#\#fetch }"
            _src="$(fetch "$_u")" || _src="$(cached "$_u")"
            [ -s "$_src" ] || return 1
            cp "$_src" "$2" ;;
        *) cp "$_t" "$2" ;;
    esac
}

# --- the manifest, exactly as the releases do it ---
PENDING="$ROOT/.MANIFEST.txt.unsigned"    # a build that is complete but not signed: not live
write_manifest() { # <dir> <build> , the manifest for that build directory, on stdout
    echo "# LocalGhost Mirror Manifest"
    echo "# Build: $2"
    echo "# Signed: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo ""
    # one find and one pass over the hash cache (the elevation set alone is tens of thousands of
    # files, and a lookup per file would read the cache once per file); only new inodes are hashed.
    # The key is the same as sha_cached's: device:inode:size:mtime
    find "$1" -type f ! -name '.*' -printf '%D:%i:%s:%T@ %p\n' \
    | awk -v cache="$SHACACHE" '
        BEGIN { while ((getline l < cache) > 0) { split(l, a, " "); h[a[1]] = a[2] } }
        { k = $1; sub(/\.[0-9]*$/, "", k); p = substr($0, length($1) + 2)
          if (k in h) print h[k] "  " p; else print "? " k " " p }' \
    | while read -r _a _b _c; do
        if [ "$_a" = "?" ]; then
            [ "$(stat -c %s "$_c")" -gt 268435456 ] && say "hashing ${_c#$ROOT/} ($(du -h --apparent-size "$_c" | cut -f1)), once"
            _h="$(sha256sum "$_c" | cut -d' ' -f1)"
            echo "$_b $_h" >> "$SHACACHE"
            echo "$_h  $_c"
        else
            echo "$_a  $_b"
        fi
    done | sed "s|$ROOT||" | sort -k2
}
body() { # the manifest's file lines with the build directory taken out, to compare two builds
    sed -n 's|^\([0-9a-f]\{64\}\)  /[^/]*/|\1  |p' "$1" | grep -v '/NOTICE.txt$' | sort -k2
}
go_live() { # <manifest tmp> <build> , sign it and put the pair in place: the moment a build goes live
    gpg --batch --yes --armor --local-user "$GPG_USER" --output "$ROOT/.MANIFEST.txt.asc.tmp" --detach-sign "$1" \
        || die "gpg could not sign as $GPG_USER"
    # the pair, back to back; a box that reads between the two sees a signature that does not match
    # and tries again a few seconds later (tools/mirror_fetch.sh)
    mv -f "$1" "$ROOT/MANIFEST.txt"
    mv -f "$ROOT/.MANIFEST.txt.asc.tmp" "$ROOT/MANIFEST.txt.asc"
    rm -f "$PENDING"
    PUBLISHED=1
    echo "  [signed] MANIFEST.txt ($(grep -c "^[a-f0-9]" "$ROOT/MANIFEST.txt") files, build $2)"
    echo "  [signed] MANIFEST.txt.asc"
}
prune() { # keep the last $KEEP builds
    ls -1d "$ROOT"/[0-9]*T[0-9]*Z 2>/dev/null | sort | head -n "-$KEEP" | while read -r old; do
        rm -rf "$old"
        say "pruned $(basename "$old")"
    done
}

# --- --sign: the build that --sign-later left waiting goes live now, and nothing is fetched ---
if [ "$MODE" = sign ]; then
    [ -f "$PENDING" ] || die "nothing is waiting to be signed (no build was made with --sign-later, or it went live already)"
    WAITING="$(sed -n 's/^# Build: //p' "$PENDING" | head -1)"
    if [ -z "$WAITING" ] || [ ! -d "$ROOT/$WAITING" ]; then
        rm -f "$PENDING"
        die "the unsigned build ${WAITING:-?} is gone; publish again"
    fi
    MAN="$ROOT/.MANIFEST.txt.tmp"
    write_manifest "$ROOT/$WAITING" "$WAITING" > "$MAN"     # cheap: the hashes are cached by inode
    [ "$(body "$MAN")" = "$(body "$PENDING")" ] || die "build $WAITING no longer matches the manifest written for it; publish again"
    echo "> SIGNING build $WAITING"
    go_live "$MAN" "$WAITING"
    prune
    exit 0
fi

# --- pack=heights: a listed set's tiles go into the build as packs, one per 30-degree block       ---
# --- (GLO-90_N30_W030.heights is 30 to 60 north, 30 west to 0), each tile's bytes as they were    ---
# --- behind a small index, which is what a box from wisp 0.0.6 on reads. They are made with        ---
# --- ghost-heights out of the server set's pinned bundle, kept in $CACHE/pack/<set>/ and made     ---
# --- again only when the tiles or the tool change (.stamp). The tiles stay in $CACHE/list/<set>/,  ---
# --- so the cache holds the set twice.                                                             ---
PACKED=""
heights_tool() { # the ghost-heights binary out of the server set's pinned bundle, its path on stdout
    _hl="$(awk '$1 == "server" && $2 ~ /^localghost-server-.*\.tar\.gz$/ { print $2, $4; for (i = 5; i <= NF; i++) if ($i ~ /^check=sha256:/) print substr($i, 14); exit }' "$CACHE/conf.tmp")"
    _hf="$(echo "$_hl" | awk 'NR == 1 { print $1 }')"; _hu="$(echo "$_hl" | awk 'NR == 1 { print $2 }')"
    _hp="$(echo "$_hl" | awk 'NR == 2')"
    [ -n "$_hf" ] && [ -n "$_hp" ] || return 1
    _hb="$(pinned "$_hu" "$_hp" "$_hf")" || return 1
    _hd="$CACHE/tools/$_hp"
    if [ ! -x "$_hd/ghost-heights" ]; then
        rm -rf "${_hd:?}.tmp"; mkdir -p "$_hd.tmp"
        tar -xzf "$_hb" -C "$_hd.tmp" --wildcards '*bin/ghost-heights' 2>/dev/null || { rm -rf "${_hd:?}.tmp"; return 1; }
        _hg="$(find "$_hd.tmp" -type f -name ghost-heights | head -1)"
        [ -n "$_hg" ] || { rm -rf "${_hd:?}.tmp"; return 1; }
        mkdir -p "$_hd"
        mv -f "$_hg" "$_hd/ghost-heights"
        chmod 755 "$_hd/ghost-heights"
        rm -rf "${_hd:?}.tmp"
    fi
    echo "$_hd/ghost-heights"
}
pack_heights() { # <set> , the set's tiles from $LISTDIR/<set> into packs, linked into the build
    _ps="$1"
    _pt="$(heights_tool)" || die "$_ps: pack=heights needs ghost-heights from the server set's bundle (its localghost-server-*.tar.gz line with check=sha256:), and it could not be had"
    HEIGHTS_FROM="$(awk '$1 == "server" && $2 ~ /^localghost-server-/ { print $2; exit }' "$CACHE/conf.tmp" | sed 's/^localghost-server-\([^-]*\)-.*/wisp \1/')"
    _pin="$LISTDIR/$_ps"
    _pout="$CACHE/pack/$_ps"
    _pstamp="$( { sha256sum "$_pt" | cut -d' ' -f1; find "$_pin" -type f -name '*.tif' -printf '%f %s\n' | sort; } | sha256sum | cut -d' ' -f1)"
    if [ "$(cat "$_pout/.stamp" 2>/dev/null)" != "$_pstamp" ] || ! ls "$_pout"/*.heights >/dev/null 2>&1; then
        say "$_ps: packing $(find "$_pin" -type f -name '*.tif' | wc -l) tiles by 30-degree block with ghost-heights from $HEIGHTS_FROM, once per set of tiles and tool"
        rm -rf "${_pout:?}.tmp"; mkdir -p "$_pout.tmp"
        _pt0="$(date +%s)"
        "$_pt" pack "$_pin" "$_pout.tmp" >&2 || { rm -rf "${_pout:?}.tmp"; die "$_ps: ghost-heights pack failed"; }
        ls "$_pout.tmp"/*.heights >/dev/null 2>&1 || { rm -rf "${_pout:?}.tmp"; die "$_ps: ghost-heights pack wrote no .heights files"; }
        for _pp in "$_pout.tmp"/*.heights; do
            "$_pt" check "$_pp" >/dev/null 2>&1 || { rm -rf "${_pout:?}.tmp"; die "$_ps: ghost-heights check failed on $(basename "$_pp")"; }
        done
        echo "$_pstamp" > "$_pout.tmp/.stamp"
        rm -rf "${_pout:?}"
        mv "$_pout.tmp" "$_pout"
        say "$_ps: $(ls "$_pout"/*.heights | wc -l) packs made and checked in $(( ($(date +%s) - _pt0) / 60 )) min"
    fi
    mkdir -p "$NEW/$_ps"
    eval "_pterms=\${PACK_TERMS_$_ps:-} _phost=\${PACK_HOST_$_ps:-}"
    for _pp in "$_pout"/*.heights; do
        _pf="$(basename "$_pp")"
        case "$_pf" in .*|*[!A-Za-z0-9._+-]*) die "$_ps: ghost-heights wrote a bad file name '$_pf'" ;; esac
        ln -f "$_pp" "$NEW/$_ps/$_pf" 2>/dev/null || cp "$_pp" "$NEW/$_ps/$_pf"
        printf '%s\n    terms: %s\n    from:  %s\n' "$_pf" "$_pterms" "the tiles of its 30-degree block in tileList.txt${_phost:+, from https://$_phost/}, each tile's bytes unchanged, packed with ghost-heights from LocalGhost $HEIGHTS_FROM" >> "$NEW/$_ps/NOTICE.txt"
    done
    say "$_ps: $(ls "$_pout"/*.heights | wc -l) packs in the build (the tiles stay in the cache)"
}

# --- the sets this run refreshes ---
grep -v '^[[:space:]]*#' "$CONF" | awk 'NF' > "$CACHE/conf.tmp"
ALL="$(awk '{print $1}' "$CACHE/conf.tmp" | sort -u)"
MANUAL="$(awk '{ for (i = 5; i <= NF; i++) if ($i == "manual") print $1 }' "$CACHE/conf.tmp" | sort -u)"
for s in $SETS; do
    echo "$ALL" | grep -qx "$s" || die "no set '$s' in $CONF (it has: $(echo $ALL))"
done
if [ -n "$SETS" ]; then
    REFRESH="$SETS"
else
    REFRESH="$ALL"
    for m in $MANUAL; do REFRESH="$(echo "$REFRESH" | grep -vx "$m" || true)"; done
    [ -n "$MANUAL" ] && say "manual sets kept as they are ($(echo $MANUAL)); name one to refresh it"
fi

if [ -n "$OFFLINE" ]; then
    echo "> upstream last checked $LAST_CHECK, next on the first deploy of next month; this run publishes only what mirror.conf or terms/ added or changed"
fi

# --- list=<url>: one line in mirror.conf stands for every name in a list upstream publishes (the ---
# --- Copernicus DEM's tileList.txt, 26,000 tiles). {name} in the file and the source is replaced ---
# --- by each name. Only sets this run refreshes are expanded, so a manual set costs nothing.     ---
if grep -q 'list=' "$CACHE/conf.tmp"; then
    : > "$CACHE/conf.exp"
    while read -r set file tnames source opt; do
        _list=""
        for o in ${opt:-}; do case "$o" in list=*) _list="${o#list=}" ;; esac; done
        if [ -z "$_list" ] || ! want "$set"; then
            echo "$set $file $tnames $source ${opt:-}" >> "$CACHE/conf.exp"
            continue
        fi
        _lf="$(fetch "$_list")" || die "$set: could not get the list $_list"
        _rest="$(for o in ${opt:-}; do case "$o" in list=*) ;; *) printf '%s ' "$o" ;; esac; done)"
        tr -d '\r' < "$_lf" | awk -v s="$set" -v f="$file" -v t="$tnames" -v u="$source" -v r="$_rest" '
            NF && $1 ~ /^[A-Za-z0-9._+-]+$/ { ff = f; uu = u; gsub(/\{name\}/, $1, ff); gsub(/\{name\}/, $1, uu)
                                            print s, ff, t, uu, r "listed" }' >> "$CACHE/conf.exp"
        say "$set: $(grep -c . "$_lf") names in ${_list##*/}"
    done < "$CACHE/conf.tmp"
    mv -f "$CACHE/conf.exp" "$CACHE/conf.tmp"
fi

# --- lines that aren't finished yet: a terms file that still says EDIT-ME, or a pin still to be ---
# --- taken (check=sha256:?). Their whole set is left out of this build, loudly, and the rest is  ---
# --- published as usual, so an unfinished line never holds up the maps or the Go toolchain.      ---
SKIP=""
skip() { echo "$SKIP" | grep -qx "$1"; }
while read -r set file tnames source opt; do
    want "$set" || continue
    case " ${opt:-} " in *" listed "*)
        # the lines of one list share their terms and options: check the first, skip the rest
        [ "$set|$tnames" = "${_pp_last:-}" ] && continue
        _pp_last="$set|$tnames" ;;
    esac
    skip "$set" && continue
    for t in $(echo "$tnames" | tr ',' ' '); do
        [ -f "$TERMS/$t.txt" ] || continue           # a missing file stops the publish, below
        if grep -q 'EDIT-ME' "$TERMS/$t.txt"; then
            say "!! $set is left out: $TERMS/$t.txt still says EDIT-ME (finish it, then publish again)"
            SKIP="$SKIP
$set"
        fi
    done
    skip "$set" && continue
    for o in ${opt:-}; do
        [ "$o" = "check=sha256:?" ] || continue
        # take the pin: the file is downloaded (or copied) once, hashed, and kept in the cache under
        # that hash, so the publish that carries the pin finds it there and fetches nothing
        case "$source" in *'<'*) die "$set/$file: the source still has a placeholder: $source" ;; esac
        case "$source" in
            http://*|https://*)
                _url="$(resolve "$source")" || die "$set/$file: nothing upstream matches $source"
                _src="$(fetch "$_url")" || die "$set/$file: download failed: $_url" ;;
            *) _src="$source"; [ -f "$_src" ] || die "$set/$file: no such file $_src" ;;
        esac
        _h="$(sha256sum "$_src" | cut -d' ' -f1)"
        [ -s "$CACHE/pin-$_h-$file" ] || ln -f "$_src" "$CACHE/pin-$_h-$file" 2>/dev/null || cp "$_src" "$CACHE/pin-$_h-$file"
        say "!! $set is left out: $file is not pinned yet. The copy in the cache has SHA-256"
        say "!!     $_h"
        say "!!   so its line in mirror.conf wants  check=sha256:$_h  in place of  check=sha256:?"
        say "!!   (the copy is kept in the cache under that hash; the next publish fetches nothing)"
        SKIP="$SKIP
$set"
    done
done < "$CACHE/conf.tmp"
SKIP="$(echo "$SKIP" | awk 'NF' | sort -u)"
for s in $SKIP; do REFRESH="$(echo "$REFRESH" | grep -vx "$s" || true)"; done

# the build this one starts from: the one waiting to be signed if there is one, else the live one
PREV_MAN="$ROOT/MANIFEST.txt"
if [ -f "$PENDING" ]; then
    _w="$(sed -n 's/^# Build: //p' "$PENDING" | head -1)"
    if [ -n "$_w" ] && [ -d "$ROOT/$_w" ]; then
        PREV_MAN="$PENDING"
        say "build $_w is complete but not signed; this publish starts from it"
    else
        rm -f "$PENDING"
    fi
fi
PREV="$(sed -n 's/^# Build: //p' "$PREV_MAN" 2>/dev/null | head -1)"
if [ -n "$PREV" ] && [ -d "$ROOT/$PREV" ]; then
    cp -al "$ROOT/$PREV" "$NEW"                    # hard links: the old build is never touched
else
    mkdir -p "$NEW"
fi
for s in $ALL; do
    want "$s" && rm -rf "${NEW:?}/$s"              # a refreshed set is rebuilt from the conf alone
done
# sets no longer in the conf are dropped, and so is a set whose lines aren't finished
for d in "$NEW"/*/; do
    [ -d "$d" ] || continue
    echo "$ALL" | grep -qx "$(basename "$d")" || rm -rf "$d"
    skip "$(basename "$d")" && rm -rf "$d"
done

echo "> PUBLISHING ${SETS:-every set} as build $BUILD"

# --- listed files (the elevation tiles) are fetched first, $PAR at a time, with progress. They    ---
# --- don't change within an upstream release, so one already in $CACHE/list/<set>/ is never asked ---
# --- about again (to take a new release, delete that directory). Stopping and running again loses ---
# --- nothing: what was downloaded stays.                                                         ---
LISTDIR="$CACHE/list"
PAR="${GHOST_MIRROR_PARALLEL:-8}"
: > "$CACHE/list.want"
while read -r set file tnames source opt; do
    case " ${opt:-} " in *" listed "*) ;; *) continue ;; esac
    want "$set" || continue
    echo "$set $file $source" >> "$CACHE/list.want"
done < "$CACHE/conf.tmp"
if [ -s "$CACHE/list.want" ]; then
    for s in $(awk '{ print $1 }' "$CACHE/list.want" | sort -u); do mkdir -p "$LISTDIR/$s"; done
    # copies an older publish.sh kept under its own cache names (dl-<hash>-<file>) move over
    ls "$CACHE" | grep '^dl-[0-9a-f]\{16\}-' > "$CACHE/dl.names" || true
    awk 'NR == FNR { n = $0; sub(/^dl-[0-9a-f]+-/, "", n); old[n] = $0; next }
         ($2 in old) { print old[$2], $1 "/" $2 }' "$CACHE/dl.names" "$CACHE/list.want" \
    | while read -r _o _n; do [ -s "$LISTDIR/$_n" ] || mv -f "$CACHE/$_o" "$LISTDIR/$_n"; done
    while read -r _s _f _u; do
        [ -s "$LISTDIR/$_s/$_f" ] || echo "$_u $LISTDIR/$_s/$_f"
    done < "$CACHE/list.want" > "$CACHE/list.todo"
    _total="$(grep -c . "$CACHE/list.want")"
    _todo="$(grep -c . "$CACHE/list.todo" || true)"
    if [ "$_todo" -gt 0 ]; then
        say "$_todo of $_total listed files to download, $PAR at a time"
        _count() { find "$LISTDIR" -type f ! -name '*.tmp' | wc -l; }
        _base="$(_count)"; _t0="$(date +%s)"; _last=0
        xargs -P "$PAR" -L 1 sh -c 'curl -fsSL --retry 5 --retry-delay 3 -R -o "$2.tmp" "$1" && mv -f "$2.tmp" "$2" || { rm -f "$2.tmp"; echo "  !! failed: $1" >&2; }' _ < "$CACHE/list.todo" &
        _xp=$!
        while kill -0 "$_xp" 2>/dev/null; do
            sleep 5
            _done=$(( $(_count) - _base )); _el=$(( $(date +%s) - _t0 ))
            _eta=""; [ "$_done" -gt 0 ] && _eta=", about $(( (_todo - _done) * _el / _done / 60 )) min left"
            if [ -t 2 ]; then
                printf '\r  %s/%s downloaded (%s%%)%s   ' "$_done" "$_todo" $((_done * 100 / _todo)) "$_eta" >&2
            elif [ $((_el - _last)) -ge 60 ]; then
                _last=$_el; say "$_done/$_todo downloaded$_eta"
            fi
        done
        wait "$_xp" || true
        [ -t 2 ] && echo >&2
        _miss=0
        while read -r _u _p; do [ -s "$_p" ] || _miss=$((_miss + 1)); done < "$CACHE/list.todo"
        [ "$_miss" -eq 0 ] || die "$_miss of $_todo listed files could not be downloaded; run it again, the rest are kept"
        say "all $_total listed files are in the cache"
    fi
fi

while read -r set file tnames source opt; do
    want "$set" || continue
    case "$file" in
        .*|*[!A-Za-z0-9._+-]*) die "line for $set: bad file name '$file'" ;;
    esac
    case " ${opt:-} " in *" listed "*)
        # fast path: one terms check per list, then a hard link and a NOTICE line per file
        if [ "$set|$tnames" != "${_ml_last:-}" ]; then
            for t in $(echo "$tnames" | tr ',' ' '); do
                [ -f "$TERMS/$t.txt" ] || die "$set/$file: no terms file $TERMS/$t.txt"
                grep -q 'EDIT-ME' "$TERMS/$t.txt" && die "$set/$file: $TERMS/$t.txt still says EDIT-ME , finish it first"
            done
            mkdir -p "$NEW/$set"
            for t in $(echo "$tnames" | tr ',' ' '); do
                [ -f "$NEW/$set/TERMS-$t.txt" ] || terms "$t" "$NEW/$set/TERMS-$t.txt" || die "$set/$file: could not get terms $t"
            done
            _ml_terms="$(echo "$tnames" | sed 's/\([^,]*\)/TERMS-\1.txt/g; s/,/ /g')"
            _ml_last="$set|$tnames"
            case " ${opt:-} " in *" pack=heights "*)
                # the tiles stay in the cache; pack_heights puts the set's packs in the build below
                echo "$PACKED" | grep -qx "$set" || PACKED="$PACKED
$set"
                _mlh="$(echo "$source" | sed 's#^[a-z]*://\([^/]*\)/.*#\1#')"
                eval "PACK_TERMS_$set=\$_ml_terms PACK_HOST_$set=\$_mlh" ;;
            esac
        fi
        case " ${opt:-} " in *" pack=heights "*)
            [ -s "$LISTDIR/$set/$file" ] || die "$set/$file: not in $LISTDIR/$set"
            continue ;;
        esac
        ln -f "$LISTDIR/$set/$file" "$NEW/$set/$file" 2>/dev/null || cp "$LISTDIR/$set/$file" "$NEW/$set/$file" \
            || die "$set/$file: not in $LISTDIR/$set"
        printf '%s\n    terms: %s\n    from:  %s\n' "$file" "$_ml_terms" "$source" >> "$NEW/$set/NOTICE.txt"
        LISTED_N=$((${LISTED_N:-0} + 1))
        [ $((LISTED_N % 5000)) -ne 0 ] || say "$set: $LISTED_N files linked into the build"
        continue ;;
    esac
    case "$source" in *'<'*) die "$set/$file: the source still has a placeholder: $source" ;; esac
    for t in $(echo "$tnames" | tr ',' ' '); do
        [ -f "$TERMS/$t.txt" ] || die "$set/$file: no terms file $TERMS/$t.txt"
        grep -q 'EDIT-ME' "$TERMS/$t.txt" && die "$set/$file: $TERMS/$t.txt still says EDIT-ME , finish it first"
    done
    pin=""; godev_check=""; sum_check=""; listed=""
    for o in ${opt:-}; do
        case "$o" in
            check=sumfile) sum_check=1 ;;
            listed) listed=1 ;;
            check=sha256:*)
                pin="${o#check=sha256:}"
                case "$pin" in *[!0-9a-f]*|"") die "$set/$file: check=sha256: needs 64 lowercase hex characters" ;; esac
                [ "${#pin}" -eq 64 ] || die "$set/$file: check=sha256: needs 64 lowercase hex characters" ;;
            check=godev) godev_check=1 ;;
            manual) ;;
            pack=*) die "$set/$file: $o goes on a list= line" ;;
            *) die "$set/$file: unknown option '$o' (check=godev, check=sha256:<hex>, check=sumfile, list=<url>, pack=heights, manual)" ;;
        esac
    done
    url="$source"
    case "$source" in http://*|https://*)
        url="$(resolve "$source")" || die "$set/$file: nothing upstream matches $source" ;;
    esac
    if [ -n "$pin" ]; then
        src="$(pinned "$url" "$pin" "$file")" || die "$set/$file: could not get a copy matching its pinned sha256 from $url"
        say "$file matches its pinned sha256"
    else
        case "$url" in
            http://*|https://*) src="$(fetch "$url")" || die "$set/$file: download failed: $url" ;;
            *) src="$url"; [ -f "$src" ] || die "$set/$file: no such file $src" ;;
        esac
    fi
    if [ -n "$sum_check" ]; then
        sumfile "$url" "$src" || die "$set/$file does not match the SHA-256 published at $url.sha256 , not publishing it"
        say "$file matches ${url##*/}.sha256"
    fi
    if [ "$url" != "$source" ]; then
        # a dated series moved on: the older copy leaves the cache (builds keep their hard links
        # until they are pruned)
        _old="$(awk -v g="$source" -v u="$url" '$1 == g && $2 != u { print $2 }' "$RESOLVED" 2>/dev/null | sort -u || true)"
        if [ -n "$_old" ]; then
            for _o in $_old; do rm -f "$(cached "$_o")"; say "${_o##*/} superseded by ${url##*/}, dropped from the cache"; done
            awk -v g="$source" -v u="$url" '!($1 == g && $2 != u)' "$RESOLVED" > "$RESOLVED.tmp"
            mv -f "$RESOLVED.tmp" "$RESOLVED"
        fi
    fi
    if [ -n "$godev_check" ]; then
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
    upstream="$url"
    case "$source" in /*|./*) upstream="(provided by LocalGhost)" ;; esac
    printf '%s\n    terms: %s\n    from:  %s\n' "$file" "$(echo "$tnames" | sed 's/\([^,]*\)/TERMS-\1.txt/g; s/,/ /g')" "$upstream" >> "$NEW/$set/NOTICE.txt"
    say "$set/$file: $(du -h --apparent-size "$NEW/$set/$file" | cut -f1)"
done < "$CACHE/conf.tmp"
[ -z "${LISTED_N:-}" ] || say "listed files in this build: $LISTED_N"
for s in $PACKED; do pack_heights "$s"; done
for s in $ALL; do
    if want "$s" && [ -f "$NEW/$s/NOTICE.txt" ]; then
        { echo "LocalGhost mirror, build $BUILD , set '$s'. Each file below is published under the terms named."; echo ""; cat "$NEW/$s/NOTICE.txt"; } > "$NEW/$s/.notice.tmp"
        mv -f "$NEW/$s/.notice.tmp" "$NEW/$s/NOTICE.txt"
    fi
done
# every set was checked against upstream just now: that is this month's check, whatever happens next
# (if the signature fails, the next run this month rebuilds the same thing from the cache)
if [ -z "$OFFLINE" ] && [ -z "$SETS" ]; then
    date -u +%Y-%m-%d > "$STAMP"
fi

# --- the manifest, then the signature, or not yet ---
MAN="$ROOT/.MANIFEST.txt.tmp"
write_manifest "$NEW" "$BUILD" > "$MAN"
left_out() {
    if [ -n "$SKIP" ]; then
        echo "!! left out of the mirror until their lines are finished: $(echo $SKIP) (see above)" >&2
    fi
}
if [ -f "$PREV_MAN" ] && [ "$(body "$MAN")" = "$(body "$PREV_MAN")" ]; then
    if [ "$PREV_MAN" = "$PENDING" ]; then
        # nothing new since the build that is waiting: that one is the build to sign, not a copy of it
        rm -rf "$NEW"
        if [ -n "$SIGN_LATER" ]; then
            echo "> nothing changed since build $PREV, which is complete and still waiting to be signed ($0 --sign)"
        else
            echo "> nothing changed since build $PREV, which was waiting to be signed"
            write_manifest "$ROOT/$PREV" "$PREV" > "$MAN"
            go_live "$MAN" "$PREV"
            prune
        fi
    else
        if [ -n "$OFFLINE" ]; then
            echo "> nothing new in mirror.conf or terms/ , the mirror stays at build $PREV (upstream last checked $LAST_CHECK)"
        else
            echo "> nothing changed upstream , the mirror stays at build $PREV"
        fi
    fi
    left_out
    exit 0
fi
if [ -n "$SIGN_LATER" ]; then
    mv -f "$MAN" "$PENDING"
    PUBLISHED=1                                      # the build stays; it just isn't live
    if [ "$PREV_MAN" = "$PENDING" ]; then rm -rf "${ROOT:?}/$PREV"; fi   # the one it replaces was never live
    echo "> build $BUILD is complete and NOT live (unsigned). Sign it and put it live with:  $0 --sign"
    left_out
    exit 0
fi
go_live "$MAN" "$BUILD"
if [ "$PREV_MAN" = "$PENDING" ]; then rm -rf "${ROOT:?}/$PREV"; fi       # the waiting build, never live, now folded in
prune
left_out
exit 0
