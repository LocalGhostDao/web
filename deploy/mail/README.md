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
  systemd/              ghost.maild.service, the user unit install.sh writes to ~/.config/systemd/user
  nginx/mail.conf       the /box/ location for the mx host
  scripts/root-once.sh  sudo, once: unprivileged ports from 25, the certbot hook, lingering
  scripts/install.sh    as the deploy user, no sudo: build, ~/ghost-mail, the key, the unit, start; idempotent
  scripts/certbot-hook.sh  the hook root-once.sh installs: copies the mx certificate into /var/lib/ghost-mail/tls
```

## What it is

One small Go daemon, `ghost.maild`, on port 25 and a loopback port behind nginx. It receives
mail for the boxes' addresses over TLS, seals every message to the box's own key as the bytes
arrive (it holds no key that opens anything in its queue), keeps the sealed files until the
box fetches them over HTTPS, and delivers what a box signed and sealed to it. It parses
nothing, logs no addresses, and refuses everything that is not for or from an enrolled box.
It runs as the deploy user (coder), from `~/ghost-mail`, as a systemd user unit; root is
needed once (port 25, the certificate files, lingering) and never for an update. Memory and
disk are small: the queue is capped at 200 MB per box, thirty days.

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
so when the relay's IP changes this one record changes and no box touches its DNS. The relay
dials receivers over IPv4 first and IPv6 only for a host with no IPv4 address, so a machine
that also carries a global IPv6 sends from the address the SPF names; the AAAA line is for a
relay whose IPv6 is in the SPF (`ip6:`) and has a reverse name too, and is otherwise left out
(the first message through the relay went to Gmail from an unlisted IPv6 and failed SPF). The `id` in the
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

As the deploy user, from a checkout with Go 1.25 or later:

```
cd deploy/mail && go test ./... && cd ../..
sudo ./deploy/mail/scripts/root-once.sh          # once (and again harmlessly): the user ghost-mail, /var/lib/ghost-mail, the system unit, the certbot hook, leave to restart
./deploy/mail/scripts/install.sh                 # every time: build into ~/ghost-mail/bin, the conf, restart (the one sudo)
```

The daemon runs as **ghost-mail**, a system user with no shell and no home, under a system unit
that lets it write one path, `/var/lib/ghost-mail` (the queue, its own key, the certificate
copies), and read the deploy user's `~/ghost-mail/{bin,etc}` (the binary, `maild.conf`,
`boxes.conf`; group-readable). A parser that takes bytes from any host on the internet has
nothing of the deploy user's to lose. `install.sh` writes `~/ghost-mail/etc/maild.conf` from
the example with the paths filled in (hostname `mx.localghost.ai`, SMTP `:25`, API
`127.0.0.1:8025`; edit if they differ) and restarts the service (`sudo systemctl restart
ghost.maild`, allowed without a password by root-once.sh). The daemon makes its X25519 key at
`/var/lib/ghost-mail/relay.key` on its first start. `~/ghost-mail/bin/ghost-maild` is a
wrapper that passes the conf (`ghost-maild -dns …`). Until the certificate exists the daemon
runs and logs "no certificate yet"; STARTTLS fails and senders retry. Then:

1. **The certificate.** `sudo certbot certonly --webroot -w /var/www/localghost.ai/public
   --cert-name mx.localghost.ai -d mx.localghost.ai -d mta-sts.localghost.ai` (the port-80
   block in `deploy/nginx.conf` serves the challenge). The deploy hook copies the PEMs into
   `/var/lib/ghost-mail/tls` at issue and at every renewal; the daemon reads them within ten
   minutes (or `sudo systemctl restart ghost.maild`).
2. **nginx.** The `server` blocks for `mx.localghost.ai` (HTTPS, `/box/` proxied to
   `127.0.0.1:8025`) and `mta-sts.localghost.ai` (the policy at `/.well-known/mta-sts.txt`,
   `text/plain`) in `deploy/nginx.conf`; `deploy.sh` syncs and reloads.
3. **Check.** `systemctl status ghost.maild` (`User=ghost-mail`); `openssl s_client -starttls
   smtp -connect mx.localghost.ai:25` shows the certificate; `curl -s
   https://mx.localghost.ai/box/xyz/in/` answers 401 (no token). The log is `journalctl -u
   ghost.maild` (the deploy user is in `systemd-journal`, from the login after root-once.sh).
4. **Open port 25, then prove it relays for nobody.** With the router's forward in place, from
   a connection that is not the box's (a phone on mobile data with Termux, or any VPS):
   `openssl s_client -starttls smtp -crlf -quiet -connect mx.localghost.ai:25`, then type
   `EHLO probe.example`, `MAIL FROM:<probe@example.com>`, `RCPT TO:<someone@gmail.com>` (must
   be `550`: not a box here), `RCPT TO:<vlad@ghost.localghost.ai>` (must be `250`), `QUIT`.
   A plain `nc` probe proves nothing: the relay answers `530 Must issue a STARTTLS command
   first` to `MAIL FROM` before TLS, so the relay question is never reached.

`~/ghost-mail/etc/maild.conf` (key=value): `hostname`, `smtp` (`:25`), `api` (`127.0.0.1:8025`),
`cert`, `key`, `data`, `boxes`, `relaykey`, `greylist` (off), `maxsize` (25 MB), `sendday`
(100) and `sendhour` (10), the default sending allowance per box.

## Enrolling a box

Each box makes its own keys and token, and shows the line to add (SETTINGS › MAIL › THE RELAY'S
LINE, or `ghost-cli ghost.noted mail-enrol` on the box):

```
box=vlad addresses=vlad@ghost.localghost.ai pub=<64 hex> token=<64 hex> dkim_rsa=<base64> dkim_ed=<base64>
```

Append it to `~/ghost-mail/etc/boxes.conf`; the daemon reloads the file within a minute. Then
`~/ghost-mail/bin/ghost-maild -dns ghost.localghost.ai` and add the box's two DKIM TXT records
to the zone (the MX, SPF and DMARC of the shared domain are there already). `token=` is the sha256 of the box's
bearer; the bearer itself never leaves the box.

A box with a domain of its own sends a line with `domains=` instead; before adding it, check
the domain's MX points at the relay (`dig +short MX ghost.ana.example` → `10 mx.localghost.ai.`),
which is the proof the person controls the domain. That box pastes its own five records.

To remove a box, remove its line and its two TXT records; its queue under
`/var/lib/ghost-mail/data/<box>/` can be deleted (root, or ghost-mail).

In the first version this is by hand. Later: a one-time invite code and a `/enrol` endpoint that
checks the MX itself (MAIL.md over there, "Who may use the relay").

## Running it

- `journalctl -u ghost.maild -f`: `received box=vlad bytes=… tls=…`, `delivered`,
  `delivery deferred`, `refused by receiver`, `queue swept`. Never an address.
- Disk: `sudo du -sh /var/lib/ghost-mail/data/*`; a box that never pulls holds up to 200 MB for thirty
  days, then the sweep removes the old files.
- A sending problem shows as `delivery deferred` repeating for one domain; after a day the box
  gets a bounce. The usual causes: the PTR missing, the IP young (Gmail greylists new IPs for
  a while), outbound 25 blocked at the provider.
- Updating: `./deploy/mail/scripts/install.sh` again (or with a new binary's path); it
  restarts the service. Senders retry for days, so a restart loses nothing. `deploy.sh` does not
  touch the relay; mail is its own step, deliberately.
- Greylisting: `greylist=on` in `~/ghost-mail/etc/maild.conf` and `sudo systemctl restart
  ghost.maild` if the boxes drown in bulk spam; a never-seen sender gets a 451 once and is
  taken on the retry.

## What the relay must never do

Accept a recipient not in `boxes.conf`; relay for anyone; speak plain SMTP (TLS is required
before `MAIL`); sign anything (the boxes sign, each with its own domain's key; the relay has
no DKIM key); keep a message in the clear; log an address; send for a box that did not sign
the message with the key in its domain's DNS; send past a box's allowance. All of these are
in the code, not in a setting.
- What stands between the internet and the box, in the daemon itself: 40 connections at once,
  5 per /24 or /64 (one host does not get a slot per alias), a session of ten minutes and
  twenty NOOPs at most, a per-prefix rate of messages, 25 MB a message, `530` before STARTTLS,
  `550` for any recipient not in `boxes.conf` (it relays for nobody), `452` when a box's queue
  is full, a command timeout, and no shell, exec or file name taken from the wire. An outbound
  message is read the way receivers read it (net/mail, one From with one address, no bare line
  break in the headers), so what the relay authorises is what a receiver attributes. A kernel-side
  rate limit on new connections to 25 (nftables, `limit rate over 10/minute burst 20` per
  source) is worth adding on top: it keeps a scanner's flood off the accept loop entirely.

