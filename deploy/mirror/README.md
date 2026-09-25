# deploy/mirror/ , the LocalGhost setup mirror (operator notes)

What `https://www.localghost.ai/mirror/` serves: every file a LocalGhost box downloads once, at setup
(GeoNames, Natural Earth, OpenStreetMap's land polygons, the Go toolchain, and, once listed, a
pinned llama.cpp and the model weights), with the terms each one is
published under. Boxes fetch it with `tools/mirror_fetch.sh` from the server repo
(LocalGhostDao/localghost) and install nothing unless the gpg signature on `MANIFEST.txt` verifies
against the key in that repo and every file's SHA-256 matches the manifest.

The public explanation (what, why, how a box verifies it) is the page at
[`/mirror`](https://www.localghost.ai/mirror), `public/mirror/index.html`. This file is the runbook.

The scripts, conf, terms and public key live here in `deploy/`, so none of them is ever served. The
mirror is built into `public/mirror/`: the builds and the signed manifest are gigabytes and
`.gitignore` keeps them out of GitHub, while `index.html` is in git like any other page.
`deploy/deploy.sh` runs the publish on the web server's checkout, then copies new builds into the live
web root.

## Files

- `publish.sh` , fetches everything in `mirror.conf`, writes a new build directory, signs
  `MANIFEST.txt` with `gpg --local-user info@localghost.ai`.
- `mirror.conf` , one line per file: `set file terms source [check=godev]`.
- `terms/` , the terms each file is published under; copied beside it as `TERMS-<name>.txt`. A terms
  file that still says `EDIT-ME` stops the publish of anything that uses it.
- `mirror-key.asc` , the public key, exported by the first publish. Commit it here, and copy it to
  the server repo as `tools/mirror-key.asc` and commit it there too.
- `public/mirror/<build>/`, `public/mirror/MANIFEST.txt`, `.asc` , written by `publish.sh`,
  gitignored. `public/mirror/index.html` , the page, in git.

## On the web server, once

    sudo apt-get install -y curl gpg          # flock and sha256sum are already there

That's all. The mirror only proxies files, exactly as upstream publishes them. Nothing is cut or
converted here: a box cuts OpenStreetMap's land polygons into its own coastline tiles
(`cmd/ghost-landtiles` in the server repo).

## Publish

Every `./deploy/deploy.sh` publishes the mirror into `public/mirror/`, before it checks whether the
site changed, so a deploy always refreshes it. It then goes live in order: new build directories are
hard-linked into the web root (copied if that's another filesystem), then the signed manifest pair
is swapped in, then builds the publish pruned are removed. A box never sees a manifest that names
files that aren't there yet.

    ./deploy/deploy.sh                                   # site + every set in mirror.conf
    MIRROR_SETS="geo landpolygons" ./deploy/deploy.sh    # site + only those sets
    MIRROR=off ./deploy/deploy.sh                        # site only

Run it as the user whose gpg keyring holds the info@localghost.ai secret key (the same user that
already signs the deploy manifest). The first run pulls every file once (about 1.5 GB). After that a deploy only downloads what changed upstream and makes
no new build when nothing did. A failed publish never stops the site deploy; the last good build
stays up. With the checkout and `/var/www` on the same filesystem the web root's copy is hard links,
so the data takes its space on disk once.

By hand, or from a weekly cron to keep GeoNames and the coastline fresh between deploys:

    deploy/mirror/publish.sh geo landpolygons            # then ./deploy/deploy.sh to put it live

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
- `deploy.sh` puts `/mirror/` live itself (above) and keeps it out of its main `rsync --delete` and
  out of the deploy manifest (so the builds aren't hashed on every deploy). Its robots.txt disallows
  `/mirror/` (the builds and manifest) but not the page at `/mirror`, which is in the sitemap.
- The bare domain redirects to www, so boxes should use `https://www.localghost.ai/mirror` or
  follow redirects (`curl -L`).

## Check

    curl -sI https://www.localghost.ai/mirror/MANIFEST.txt | head -3
    curl -s  https://www.localghost.ai/mirror/MANIFEST.txt | head -4
    # from a box with the server repo: fetch and verify the smallest set end to end
    GHOST_MIRROR_STATE=/tmp/mirror-test-state sh tools/mirror_fetch.sh go /tmp/mirror-test
