# deploy/mirror/ , the LocalGhost setup mirror (operator notes)

What `https://www.localghost.ai/mirror/` serves: every file a LocalGhost box downloads once, at setup
(GeoNames, Natural Earth, OpenStreetMap's land polygons and road extracts, the Go toolchain, pinned
llama.cpp and whisper.cpp releases, and the model weights), with the terms each one is published
under. Boxes fetch it with `tools/mirror_fetch.sh` from the server repo
(LocalGhostDao/localghost) and install nothing unless the gpg signature on `MANIFEST.txt` verifies
against the key in that repo and every file's SHA-256 matches the manifest.

The public explanation (what, why, how a box verifies it) is the page at
[`/mirror`](https://www.localghost.ai/mirror), `public/mirror/index.html`. This file is the runbook.

The scripts, conf and terms live here in `deploy/`, so none of them is ever served. The data (the
download cache and the builds, gigabytes) lives on the big pool, `/bulk/localghost/mirror/{cache,data}`,
and the web root's `/mirror` is a symlink to `.../data`, so nothing is copied and nothing sits on the
root SSD. `public/mirror/` in the repo holds only `index.html`, the page. `deploy/deploy.sh` runs the
publish straight into the pool on every deploy, and asks upstream for changes at most once a month.

## Files

- `publish.sh` , fetches everything in `mirror.conf`, writes a new build directory, signs
  `MANIFEST.txt` with `gpg --local-user info@localghost.ai`.
- `mirror.conf` , one line per file: `set file terms source [check=godev] [check=sha256:<hex>]
  [check=sha256:?] [check=sumfile] [list=<url>] [manual]`. A `*` in a source's last part means the
  newest of a dated series, and `list=` makes one line stand for every name in an upstream list.
- `terms/` , the terms each file is published under; copied beside it as `TERMS-<name>.txt`. A terms
  file that still says `EDIT-ME` leaves its whole set out of the build until it's finished (see
  "Unfinished lines" below).
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

Every `./deploy/deploy.sh` runs `publish.sh --monthly` into `/bulk/localghost/mirror/data`, before it
checks whether the site changed. `publish.sh` writes the build directory first and the signed
manifest pair last, so a box never sees a manifest that names files that aren't there yet.
`MIRROR_DATA=<dir>` uses another pool; `MIRROR_DATA=local` is the old layout (builds in
`public/mirror/` in the checkout, copied into the web root).

    ./deploy/deploy.sh                                   # site + mirror, upstream at most monthly
    MIRROR=refresh ./deploy/deploy.sh                    # site + mirror, ask upstream now
    MIRROR_SETS="geo landpolygons" ./deploy/deploy.sh    # site + only those sets, upstream now
    MIRROR=off ./deploy/deploy.sh                        # site only

### Once a month

GeoNames regenerates its dumps every day, so a mirror that asked upstream on every deploy made a new
build (and asked for the key's passphrase) on nearly every deploy. `--monthly` asks upstream at most
once a calendar month (UTC):

- The first deploy on or after the 1st checks every set against upstream, as a plain publish does,
  and writes the date to `cache/upstream-checked`.
- Every other deploy that month is offline. A URL already in the cache is used as it is, without a
  request, so only lines new or changed in `mirror.conf` (a new set, a new pin, a new URL) and edits
  under `terms/` reach the network or make a new build. Most deploys print `nothing new in
  mirror.conf or terms/` and don't touch the key.
- The Go tarball's check against go.dev is remembered once it passes (`cache/godev.ok`), since a
  release's checksum never changes.
- Named sets (`MIRROR_SETS`, or `publish.sh geo`) and `MIRROR=refresh` always go upstream. A named
  run doesn't move the monthly date; a full one does.
- If the month's first run fails after its downloads (the signature, say), the date is already
  written and the next deploy rebuilds the same thing from the cache and signs it.

To force next deploy to go upstream, `rm /bulk/localghost/mirror/cache/upstream-checked`.

Run it as the user whose gpg keyring holds the info@localghost.ai secret key (the same user that
already signs the deploy manifest). The first run pulls every file once (about 12.5 GB, of which the
model weights are 10 GB; `roads` is on its own, below). After that a monthly check only downloads
what changed upstream and makes no new build when nothing did. A failed publish never stops the site deploy; the last good build
stays up. The builds are hard links onto the cache, so every file is on the pool once.

By hand, when one set needs to be fresher than the month (the pool is the default when it exists,
so no variables are needed):

    deploy/mirror/publish.sh geo landpolygons        # live at once, the web root points here

## Long publishes: progress, and signing later

On a terminal, every download shows curl's progress meter (size so far, speed, time left) and every
file being hashed for the first time says so (`hashing roads/europe-latest.osm.pbf (33G), once`), so
a publish never looks stuck. Piped into a deploy log it stays quiet.

The signature is the last step and needs the key's passphrase, and an hour of downloads that ends in
a pinentry nobody is there for is a wasted hour: the build is thrown away, only the cache keeps the
downloads. So a long publish is two steps:

    screen -S roads
    deploy/mirror/publish.sh --sign-later roads    # downloads, builds, hashes; asks for nothing
    # nothing is live yet. Any time later, in a minute or a day:
    deploy/mirror/publish.sh --sign                # passphrase, signature, live

`--sign-later` leaves the finished build in the pool with its manifest written but unsigned
(`.MANIFEST.txt.unsigned`, a dotfile, never served); the live manifest still names the previous
build, so boxes see nothing until `--sign`. `--sign` re-checks the build against that manifest (cheap,
the hashes are cached) and puts the pair in place. A plain publish or a deploy that finds a build
waiting starts from it and signs the result, so the waiting build is never lost or left behind; a
second `--sign-later` replaces it.

## Sets refreshed only by name (`manual`)

A set marked `manual` in `mirror.conf` is left alone by a plain publish and by every deploy; each
new build carries whatever the previous build had for it. It is refreshed only when named:

    deploy/mirror/publish.sh --sign-later roads   # in screen: an hour or more, every changed extract whole
    deploy/mirror/publish.sh --sign               # when it's done

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

## Phone

`phone` is Gemma 4 E2B instruct for the phone app, `gemma-4-E2B-it-qat-UD-Q2_K_XL.gguf`, Unsloth's
dynamic 2-bit quantisation of Google's quantisation-aware checkpoint
(huggingface.co/unsloth/gemma-4-E2B-it-qat-GGUF, Apache 2.0, not gated, 2.2 GB), pinned like the
12B. Its own set, so a phone fetches it and nothing else. The same repo has `mmproj-F16.gguf` (986
MB) if the phone build ever does vision; the sha256 is in the comment above its line in
`mirror.conf`.

## Embeddings

`embeddings` is EmbeddingGemma 300M for search over a box's own notes, as Google's quantisation-aware
Q8_0 checkpoint converted to GGUF by the llama.cpp maintainers
(huggingface.co/ggml-org/embeddinggemma-300m-qat-q8_0-GGUF, 329 MB, not gated), pinned by the SHA-256
on its file page. EmbeddingGemma is under the Gemma Terms of Use, not Apache 2.0, and section 3.1 of
those terms says every recipient gets a copy of the whole agreement, so `terms/gemma-terms.txt` has
to carry the full text: paste it from https://ai.google.dev/gemma/terms (all of it, title through the
Appendix) under the "in full:" line and delete the `EDIT-ME` paragraph. Until then the set is left out
of every build and the publish says so; nothing else waits for it.

## Time zones, elevation, Wikipedia

`tz` is timezone-boundary-builder's "with oceans, since 1970" boundaries (ODbL, 46 MB) and IANA's
tzdata (public domain), both from stable "latest" URLs, so the monthly check takes a new release by
itself. A box uses them to cut days at local midnight.

`elevation` is the Copernicus DEM GLO-90, about 26,000 one-degree tiles. It is one line in
`mirror.conf` with `list=` pointing at upstream's `tileList.txt`, expanded only when the set is
refreshed. It is `manual` and on the order of 100 GB (the first run's last line says how many files;
`du -sh --apparent-size` on the build says how big), so:

    deploy/mirror/publish.sh --sign-later elevation    # in screen, once
    deploy/mirror/publish.sh --sign

The tiles are downloaded 8 at a time (`GHOST_MIRROR_PARALLEL=16` for more) before the build, with a
progress line and an estimate, into `cache/list/elevation/`. A tile already there is never asked
about again, since tiles don't change within a Copernicus release; to take a new release, delete that
directory. Stopping a run and starting it again loses nothing.

The licence asks that everyone who receives the data is bound by it, so the licence PDF is a file in
the set. A box fetches only the tiles it needs.

`wikipedia` is English Wikipedia without pictures as Kiwix packages it (around 60 GB, its own
full-text index inside). The source ends in `wikipedia_en_all_nopic_*.zim`, so a named publish reads
Kiwix's directory listing and takes the newest dump, checks it against the `.sha256` Kiwix publishes
beside it (`check=sumfile`), and drops the older dump from the cache (the previous build keeps its
hard link until it is pruned). `manual`, so it moves only when you say:

    deploy/mirror/publish.sh --sign-later wikipedia    # every month or two
    deploy/mirror/publish.sh --sign

The lines for the version with pictures (about twice the size) and the introductions-only version
(a few GB, sized for a phone) are in `mirror.conf`, commented out.

## Speech

`whisper` is the source archive of whisper.cpp, pinned exactly like llama.cpp: release v1.9.4, commit
`927cfce34f31707e17f2bff35c349632fb9e2c3a`, fetched by commit, `check=sha256:?` until the first
publish on the server prints the hash to paste. `speech` is the model a box transcribes the daily
check-in's voice notes with, OpenAI's Whisper large-v3-turbo (multilingual) in the whisper.cpp
maintainers' ggml build quantised to q5_0, `ggml-large-v3-turbo-q5_0.bin`
(huggingface.co/ggerganov/whisper.cpp, 574 MB, MIT, not gated), pinned by the SHA-256 on its file
page. Both are MIT; the model file carries no licence of its own, so `terms/openai-whisper.txt` has the
full MIT text with OpenAI's copyright line. A box's `setup_whisper.sh` exits 3 ("not on the mirror
yet") until both sets are in the manifest, keeps voice notes waiting, and transcribes the backlog
after `sudo ./tools/update.sh speech`.

## llama.cpp

`llama` is one source archive of the inference engine, so every box builds the same llama.cpp:
release v0.5.0 (ggml-org's stable `vX.Y.Z` tags are the ones they recommend for downstream
distribution; the `b`-number tags are the bleeding edge), commit
`7fe450e19305b828c199d602c23a8337aaa1f03b`, fetched by commit so the URL can't move. GitHub publishes
no checksum for source archives, so the line starts life as `check=sha256:?` (next section). To move
the pin: new commit in the URL and the file name, `check=sha256:?` again, two publishes. The tarball
unpacks into one directory named after the commit (`tar xzf ... --strip-components=1`).

## Releases (`server` and `app`)

`server` is LocalGhost's own release, the set the phone offers as an update ("wisp 0.0.1 is out",
DEPLOY under SETTINGS › SERVER). Its three files are the GitHub release's, unmodified, each pinned by
the SHA-256 GitHub shows beside the asset: the bundle (`localghost-server-<version>-linux-amd64.tar.gz`,
the daemons and operator tools, `tools/mirror_fetch.sh` and the pinned key), `RELEASE.txt` (version,
name, commit, date, `bundle=`, the changes, which the phone shows before downloading) and `NOTES.md`.
The release's own `NOTICE.txt` and `SHA256SUMS` are left out on purpose: the set's `NOTICE.txt` is
the mirror's (a file of the same name would collide), and the signed manifest already carries every
hash. `terms/localghost-mit.txt` is the repo's LICENSE with a short header.

The box verifies the set with the release's own `mirror_fetch.sh` over a `file://` copy the phone hands
it, against the key it already holds, then unpacks the bundle and keeps the previous build for a
rollback. Tested on 2 October 2026: a scratch publish of wisp 0.0.1 (commit 86ee41c) signed with a throwaway
key, then the bundled `mirror_fetch.sh` for `server` and for `app` against it, every file matched.

`app` is the Android app from the same release: `localghost-app-0.0.1.apk`, signed with the app's
keystore (signing certificate SHA-256
`3dcc5e35718036a26cf36373ee53e79f512bf02d97f7017052996d55ddf0cdf4`, checked here by verifying the
APK's v2 signature and content digest), and `localghost-app-0.0.1.apk.asc`, the site key's detached
signature over it. The `.idsig` (APK signature scheme v4, for incremental adb installs) stays on
GitHub. A phone installs the app once by hand; on the mirror it means a USB copy sets up the phone as
well as the box. Its terms are `localghost-app` (what is inside under which licence), `apache-2.0`
(AndroidX, Compose, CameraX, Kotlin) and `localghost-mit`.

A new release is five lines replaced in `mirror.conf`: the new file names, the tag in the URLs, and
the pins from the release page (or `sha256sum` of a copy you cut yourself with
`tools/cut_release.sh <version>`, which gives the same server bytes). A plain deploy publishes it,
since a changed line is fetched even in a month whose upstream check has already run. If a release
is cut again under the same tag, the pins change and the publish stops on the old ones until they
are replaced, which is what happened with wisp 0.0.1 (commit 5354b9b, then 86ee41c with the app).

## Unfinished lines

Two things can leave a line unfinished, and neither stops the rest of the mirror: the set is left out
of the build, every publish says so (`!! <set> is left out: ...` and a summary line at the end), and
the other sets are published as usual. A set that had been published before is dropped from the new
build until its line is finished again.

- A terms file that still says `EDIT-ME`.
- `check=sha256:?`, a pin still to be taken. The publish downloads the file once, prints its SHA-256
  and the exact `check=sha256:<hex>` to put on the line, and keeps the copy in the cache under that
  hash. Paste the hash, publish again: the pinned publish finds the copy and downloads nothing. Use
  it for upstreams that publish no checksum (a GitHub source archive); where upstream does (a
  Hugging Face file page, go.dev), take the hash from there, so it's checked against something
  other than the server's own download.

## Disk

On the pool: the cache (every download once, the pinned weights, the road extracts, the elevation
tiles and the current Wikipedia dump, on the order of 260 GB with everything published) plus the last
two builds, which are hard links onto it and cost only what changed between them. A new Wikipedia
dump costs its size again until the build that still holds the old one is pruned. Nothing on the root
SSD.

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
