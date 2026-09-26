# deploy/mirror/ , the LocalGhost setup mirror (operator notes)

What `https://www.localghost.ai/mirror/` serves: every file a LocalGhost box downloads once, at setup
(GeoNames, Natural Earth, OpenStreetMap's land polygons, the Go toolchain, and, once listed, a
pinned llama.cpp and the model weights), with the terms each one is
published under. Boxes fetch it with `tools/mirror_fetch.sh` from the server repo
(LocalGhostDao/localghost) and install nothing unless the gpg signature on `MANIFEST.txt` verifies
against the key in that repo and every file's SHA-256 matches the manifest.

The public explanation (what, why, how a box verifies it) is the page at
[`/mirror`](https://www.localghost.ai/mirror), `public/mirror/index.html`. This file is the runbook.

The scripts, conf and terms live here in `deploy/`, so none of them is ever served. The data (the
download cache and the builds, gigabytes) lives on the big pool, `/bulk/localghost/mirror/{cache,data}`,
and the web root's `/mirror` is a symlink to `.../data`, so nothing is copied and nothing sits on the
root SSD. `public/mirror/` in the repo holds only `index.html`, the page. `deploy/deploy.sh` runs the
publish straight into the pool on every deploy.

## Files

- `publish.sh` , fetches everything in `mirror.conf`, writes a new build directory, signs
  `MANIFEST.txt` with `gpg --local-user info@localghost.ai`.
- `mirror.conf` , one line per file: `set file terms source [check=godev]`.
- `terms/` , the terms each file is published under; copied beside it as `TERMS-<name>.txt`. A terms
  file that still says `EDIT-ME` stops the publish of anything that uses it.
- No key file here. The mirror is signed with the site's key, the one already published at
  `/.well-known/pgp-key.asc` (`public/.well-known/pgp-key.asc`), fingerprint
  `DCE9 A3D1 4EB4 6197 1DD5  F393 706E 4194 F08A 09A0`. `publish.sh` checks the signing key against
  that file before it downloads anything and refuses to sign with any other key. The server repo
  pins a copy of it as `tools/mirror-key.asc`.
- `relocate.sh` , one-off: moves an older layout (cache in `~/.cache`, builds in the checkout, a
  copy in the web root) onto the pool and puts the symlink in place.
- `/bulk/localghost/mirror/cache` , downloads and pinned files, kept so a deploy re-fetches nothing.
- `/bulk/localghost/mirror/data/<build>/`, `MANIFEST.txt`, `.asc` , the published mirror. Builds are
  hard links onto the cache, so each file is on disk once. `public/mirror/index.html` , the page, in git.

## On the web server, once

    sudo apt-get install -y curl gpg          # flock and sha256sum are already there
    sudo mkdir -p /bulk/localghost/mirror && sudo chown "$USER" /bulk/localghost/mirror
    # moving from the old layout (cache in ~/.cache, builds in the checkout and the web root):
    deploy/mirror/relocate.sh                 # then ./deploy/deploy.sh

nginx needs to read the pool: `/bulk` and `/bulk/localghost` must have `o+x`, the data dir is made
755 by the deploy. nginx follows symlinks by default, so no config changes.

That's all. The mirror only proxies files, exactly as upstream publishes them. Nothing is cut or
converted here: a box cuts OpenStreetMap's land polygons into its own coastline tiles
(`cmd/ghost-landtiles` in the server repo).

## Publish

Every `./deploy/deploy.sh` publishes the mirror into `/bulk/localghost/mirror/data`, before it checks
whether the site changed, so a deploy always refreshes it. `publish.sh` writes the build directory
first and the signed manifest pair last, so a box never sees a manifest that names files that
aren't there yet. `MIRROR_DATA=<dir>` uses another pool; `MIRROR_DATA=local` is the old layout
(builds in `public/mirror/` in the checkout, copied into the web root).

    ./deploy/deploy.sh                                   # site + every set in mirror.conf
    MIRROR_SETS="geo landpolygons" ./deploy/deploy.sh    # site + only those sets
    MIRROR=off ./deploy/deploy.sh                        # site only

Run it as the user whose gpg keyring holds the info@localghost.ai secret key (the same user that
already signs the deploy manifest). The first run pulls every file once (about 1.5 GB). After that a deploy only downloads what changed upstream and makes
no new build when nothing did. A failed publish never stops the site deploy; the last good build
stays up. The builds are hard links onto the cache, so every file is on the pool once.

By hand, or from a weekly cron to keep GeoNames and the coastline fresh between deploys:

    GHOST_MIRROR_DATA=/bulk/localghost/mirror/data GHOST_MIRROR_CACHE=/bulk/localghost/mirror/cache \
        deploy/mirror/publish.sh geo landpolygons        # live at once, the web root points here

## Sets refreshed only by name (`manual`)

A set marked `manual` in `mirror.conf` is left alone by a plain publish and by every deploy; each
new build carries whatever the previous build had for it. It is refreshed only when named:

    deploy/mirror/publish.sh roads        # in screen: an hour or more, every changed extract whole

`roads` is the reason: Geofabrik republishes each continent extract every day, so a freshness check
would find all 80 GB changed at every deploy. Refresh it about monthly. Builds are hard links onto
the cache, so a refresh where Europe changed costs 33 GB until the older build is pruned, and one
where nothing changed costs nothing. The manifest step hashes a file once and remembers the result
by inode (`cache/sha256.cache`), so a deploy doesn't re-read 80 GB to sign the same files again.

## Models

`models` is the build every box runs: Gemma 4 12B instruct `gemma-4-12b-it-Q4_K_M.gguf` and its
vision projector `mmproj-F16.gguf`, as quantised and published by Unsloth
(huggingface.co/unsloth/gemma-4-12b-it-GGUF, Apache 2.0), fetched with plain HTTPS (no account, no
CLI) and pinned with `check=sha256:<hex>` in `mirror.conf`. A pinned file is downloaded once (about
7.3 GB, resumable), checked, kept in the
cache under its hash, and never fetched or hashed again, so later deploys cost nothing and a
changed file upstream stops the publish instead of reaching a box.

If Hugging Face isn't reachable, a copy you already have works: put it on the server and replace the
URL in its line with the path. It's published only if its `sha256sum` matches the pin; a different
hash is a different file, and then it needs its own line, its own pin and a terms file that says
where it came from.

EmbeddingGemma has its own `embeddings` set, commented out until `terms/gemma-terms.txt` holds the
full Gemma Terms of Use.

## Disk

On the pool: the cache (every download once, the pinned weights, the road extracts, about 90 GB
today) plus the last two builds, which are hard links onto it and cost only what changed between
them. Nothing on the root SSD.

## Serving `/mirror/`

No mirror-specific nginx config: the page, the builds and the manifest sit in the web root and the
site's normal static rules serve them. `/mirror/` and `/mirror/index.html` redirect to `/mirror`,
like every other page.
What that gives, and what `deploy.sh` does around it:

- Range requests work on static files by default, so a box resumes a 7 GB model.
- No access log: `access_log off` is server-wide, including the http and bare-domain redirects
  (a log of /mirror/ would list the IP of everyone who set up a box).
- No directory listings (autoindex is off).
- publish.sh's temp files (`.MANIFEST.txt.tmp`, `.notice.tmp`) are dotfiles, which the site already
  refuses to serve.
- Every response carries the site's `Cache-Control: no-store`. curl on a box ignores it, and the
  manifest is always fresh.
- `deploy.sh` keeps `/mirror/` out of its main `rsync --delete` (so a deploy never touches the
  symlink) and out of the deploy manifest apart from `index.html` (the builds carry their own
  signature). Its robots.txt disallows `/mirror/` (the builds and manifest) but not the page at
  `/mirror`, which is in the sitemap.
- The bare domain redirects to www, so boxes should use `https://www.localghost.ai/mirror` or
  follow redirects (`curl -L`).

## Check

    curl -sI https://www.localghost.ai/mirror/MANIFEST.txt | head -3
    curl -s  https://www.localghost.ai/mirror/MANIFEST.txt | head -4
    # from a box with the server repo: fetch and verify the smallest set end to end
    GHOST_MIRROR_STATE=/tmp/mirror-test-state sh tools/mirror_fetch.sh go /tmp/mirror-test
