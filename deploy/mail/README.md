# The mail relay on localghost.ai

`deploy/mail/` is `ghost.maild`, the mail relay for LocalGhost boxes, and this page is what the
operator of `localghost.ai` does with it. The design and the box's side are
[`server/docs/MAIL.md`](https://github.com/LocalGhostDao/localghost/blob/main/server/docs/MAIL.md)
in the localghost repository; [PROTOCOL.md](PROTOCOL.md) here is the contract the boxes hold the
relay to. The daemon is one Go module with no dependency beyond the standard library
(`go.mod` here); `internal/seal` and `internal/wire` are the same files as the box's
`server/internal/mailseal` and `server/internal/mailwire`, and must stay so.

```
deploy/mail/
  cmd/ghost.maild/      the daemon: main (config, boxes, certs), smtp (receiving), queue,
                        api (the boxes' HTTPS calls), deliver (sending, bounces); a test that
                        runs an SMTP session over loopback TLS
  internal/seal/        the envelope (X25519, HKDF-SHA256, AES-256-GCM, 64 KB chunks)
  internal/wire/        the note, the listing entry, the outbound envelope, the name patterns
  etc/                  maild.conf.example, boxes.conf.example, mta-sts.txt
  systemd/              ghost.maild.service (one capability: port 25)
  nginx/mail.conf       the /box/ location for the mx host
  scripts/install.sh    build, user, dirs, key, unit, hook, start; idempotent
  scripts/certbot-hook.sh  copies the renewed certificate where ghost-mail can read it
```

## What it is

One small Go daemon, `ghost.maild`, on port 25 and a loopback port behind nginx. It receives
mail for the boxes' domains over TLS, seals every message to the box's own key as the bytes
arrive (it holds no key that opens anything in its queue), keeps the sealed files until the
box fetches them over HTTPS, and delivers what a box signed and sealed to it. It parses
nothing, logs no addresses, and refuses everything that is not for or from an enrolled box.
It runs as its own user with one capability (binding port 25). Memory and disk are small: the
queue is capped at 200 MB per box, thirty days.

## The machine

Either the site's machine or a small separate one. A separate IP is cleaner for reputation
(the site's web traffic and the mail's are then unrelated) but not required; what is required:

- A fixed public IP with **port 25 open both ways** at the provider. Several providers block
  outbound 25 by default and open it on request (Hetzner after a month and a ticket; OVH,
  Scaleway and most VPS providers on request; the large clouds grudgingly or never). Check
  before anything else: `nc -vz gmail-smtp-in.l.google.com 25` from the machine.
- **Reverse DNS** (PTR) for that IP set to `mx.localghost.ai` at the provider's panel. Without
  it Gmail and Outlook refuse or spam-fold everything the relay sends.
- Debian or Ubuntu, systemd, nginx, certbot already there for the site.

## DNS, on localghost.ai

```
mx.localghost.ai.          A      <the relay's IPv4>
mx.localghost.ai.          AAAA   <the relay's IPv6, if it has one with a PTR; else leave out>
_spf.localghost.ai.        TXT    "v=spf1 ip4:<the relay's IPv4> -all"
_mta-sts.localghost.ai.    TXT    "v=STSv1; id=20261012"
mta-sts.localghost.ai.     A/CNAME → the web host that serves https://mta-sts.localghost.ai/.well-known/mta-sts.txt

ghost.localghost.ai.          MX   10 mx.localghost.ai.                       the shared mail domain
ghost.localghost.ai.          TXT  "v=spf1 include:_spf.localghost.ai -all"
_dmarc.ghost.localghost.ai.   TXT  "v=DMARC1; p=reject; adkim=s; aspf=r"

localghost.ai.             TXT    "v=spf1 include:_spf.localghost.ai -all"       (if localghost.ai sends no other mail)
_dmarc.localghost.ai.      TXT    "v=DMARC1; p=reject"                            (if localghost.ai sends no other mail)
```

`_spf.localghost.ai` is the one record every box's domain includes (`include:_spf.localghost.ai`),
so when the relay's IP changes this one record changes and no box touches its DNS. The `id` in the
MTA-STS record changes whenever the policy file does. The last two lines are for `localghost.ai`
itself and only make sense if nothing else sends as `@localghost.ai`.

**The shared mail domain, `ghost.localghost.ai`,** is where most boxes have their address
(`vlad@ghost.localghost.ai`): a sender learns LocalGhost's zone and LocalGhost's machine and
nothing of the person's. Its MX, SPF and DMARC are the three lines above, once. Each box on it
has two more records, its DKIM public keys under its own selectors, which the relay prints from
`boxes.conf`:

```
ghost.maild -dns ghost.localghost.ai
```

gives the zone lines for every box whose line has an address on that domain
(`vlad-rsa._domainkey.ghost.localghost.ai TXT …`, `vlad-ed._domainkey… TXT …`). Add them when
you add the box's line. The private keys are on the box; these are keys the relay cannot use,
published so that receivers can check the box's signature, and with `p=reject` and strict
alignment only the box can send as its address.

## Install

From a checkout of this repository with Go 1.25 or later (or copy a built `ghost.maild` binary
over and give its path as the first argument):

```
cd deploy/mail && go test ./... && cd ../..
sudo ./deploy/mail/scripts/install.sh
```

It creates the `ghost-mail` user, `/var/lib/ghost-mail`, `/etc/ghost-mail/{maild.conf,boxes.conf}`
from the examples, makes the relay's own X25519 key at `/etc/ghost-mail/relay.key`, installs
the unit, the certbot deploy hook and starts the service. Then:

1. **The certificate.** `certbot certonly --nginx -d mx.localghost.ai` (or add the name to the
   site's certificate). The deploy hook copies `fullchain.pem` and `privkey.pem` to
   `/etc/ghost-mail/tls/` readable by `ghost-mail`; run it once by hand after the first
   issue: `RENEWED_DOMAINS=mx.localghost.ai /etc/letsencrypt/renewal-hooks/deploy/ghost-maild.sh`.
   The daemon reloads the files within ten minutes.
2. **nginx.** A `server` block for `mx.localghost.ai` on 443 (its own certificate or the site's
   with the name added) that includes `deploy/mail/nginx/mail.conf`: it proxies `/box/` to
   `127.0.0.1:8025`. Nothing else needs to be served on that name. Reload nginx.
3. **MTA-STS.** Serve `deploy/mail/etc/mta-sts.txt` at
   `https://mta-sts.localghost.ai/.well-known/mta-sts.txt` as `text/plain` (a `server` block
   for `mta-sts.localghost.ai` with one `location`). Static file; bump the `id` in the
   `_mta-sts` TXT record whenever it changes.
4. **Check.** `systemctl status ghost.maild`; `openssl s_client -starttls smtp -connect
   mx.localghost.ai:25` shows the certificate; `curl -s https://mx.localghost.ai/box/x/in/`
   answers 401 (no token). The log is `journalctl -u ghost.maild`.

`/etc/ghost-mail/maild.conf` (key=value): `hostname`, `smtp` (`:25`), `api` (`127.0.0.1:8025`),
`cert`, `key`, `data`, `boxes`, `relaykey`, `greylist` (off), `maxsize` (25 MB), `sendday`
(100) and `sendhour` (10), the default sending allowance per box.

## Enrolling a box

Each box makes its own keys and token, and shows the line to add (SETTINGS › MAIL › THE RELAY'S
LINE, or `ghost-cli ghost.noted mail-enrol` on the box):

```
box=vlad addresses=vlad@ghost.localghost.ai pub=<64 hex> token=<64 hex> dkim_rsa=<base64> dkim_ed=<base64>
```

Append it to `/etc/ghost-mail/boxes.conf`; the daemon reloads the file within a minute. Then
`ghost.maild -dns ghost.localghost.ai` and add the box's two DKIM TXT records to the zone (the
MX, SPF and DMARC of the shared domain are there already). `token=` is the sha256 of the box's
bearer; the bearer itself never leaves the box.

A box with a domain of its own sends a line with `domains=` instead; before adding it, check
the domain's MX points at the relay (`dig +short MX ghost.ana.example` → `10 mx.localghost.ai.`),
which is the proof the person controls the domain. That box pastes its own five records.

To remove a box, remove its line and its two TXT records; its queue under
`/var/lib/ghost-mail/<box>/` can be deleted.

In the first version this is by hand. Later: a one-time invite code and a `/enrol` endpoint that
checks the MX itself (MAIL.md over there, "Who may use the relay").

## Running it

- `journalctl -u ghost.maild -f`: `received box=vlad bytes=… tls=…`, `delivered`, `delivery
  deferred`, `refused by receiver`, `queue swept`. Never an address.
- Disk: `du -sh /var/lib/ghost-mail/*`; a box that never pulls holds up to 200 MB for thirty
  days, then the sweep removes the old files.
- A sending problem shows as `delivery deferred` repeating for one domain; after a day the box
  gets a bounce. The usual causes: the PTR missing, the IP young (Gmail greylists new IPs for
  a while), outbound 25 blocked at the provider.
- Updating: `sudo ./deploy/mail/scripts/install.sh` again (or with a new binary's path); it
  restarts the service. Senders retry for days, so a restart loses nothing. `deploy.sh` does not
  touch the relay; mail is its own step, deliberately.
- Greylisting: `greylist=on` in `maild.conf` and `systemctl restart ghost.maild` if the boxes
  drown in bulk spam; a never-seen sender gets a 451 once and is taken on the retry.

## What the relay must never do

Accept a recipient not in `boxes.conf`; relay for anyone; speak plain SMTP (TLS is required
before `MAIL`); sign anything (the boxes sign, each with its own domain's key; the relay has
no DKIM key); keep a message in the clear; log an address; send for a box that did not sign
the message with the key in its domain's DNS; send past a box's allowance. All of these are
in the code, not in a setting.
