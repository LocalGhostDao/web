# The relay protocol, as the boxes speak it

What a LocalGhost box (`ghost.noted` in the localghost repository) expects of `mx.localghost.ai`.
Every item here is load-bearing: a box built from the localghost repository talks to a relay
built from this directory, and neither can change this page alone. The two copies of
`internal/seal` and `internal/wire` (here and in `server/internal/mailseal`,
`server/internal/mailwire` over there) are the same files.

## 1. The seal

Every file the relay stores and every file it hands the box is sealed to the box's X25519
public key; every message a box sends is sealed to the relay's. One format:

```
"GHSTML1" (7 bytes) || ephemeral X25519 public key (32 bytes) || chunks…
chunk: uint32 big-endian ciphertext length || AES-256-GCM ciphertext (plaintext ≤ 65536 bytes, 16-byte tag)
```

Key: `HKDF-SHA256(ikm = X25519(ephemeral, recipient), salt = ephemeralPub || recipientPub,
info = "ghost-mail-v1")`, 32 bytes. Nonce, 12 bytes: bytes 0..7 the chunk index, big-endian,
from 0; byte 11 is 1 on the final chunk and 0 otherwise. The final chunk may be empty. A stream
without a final chunk does not open; a chunk whose tag fails does not open. Standard library
only (`crypto/ecdh`, `crypto/hkdf`, `crypto/aes`, `crypto/cipher`).

Keys on disk and in configuration are 64 lower-case hex characters, one line.

## 2. The queue files

`<data>/<box>/in/<name>` where `<name>` is `<unix nanoseconds>-<16 hex>.seal`; beside it the
note, `<unix nanoseconds>-<16 hex>.note.seal`. Both appear under their final names only once
both are complete (written as `.part`, renamed note first, then message). The API refuses any
name not matching `^[0-9]{10,20}-[0-9a-f]{16}(\.note)?\.seal$`.

The **message** is the bytes as received, dot-unstuffed, CRLF, with one line prepended:

```
Received: from <helo> (<ptr or unknown> [<ip>])\r\n\tby <relay hostname> with ESMTPS (<tls>)\r\n\tfor <<first rcpt at this box>>; <RFC 1123Z date>\r\n
```

The **note** is JSON, sealed the same way:

```json
{"name":"<name>","box":"<box id>","ip":"203.0.113.9","port":51234,"helo":"mail.example.org",
 "mailFrom":"paul@example.org","rcptTo":["agent@lgs.example"],"tls":"TLS 1.3 TLS_AES_128_GCM_SHA256",
 "received":1760000100,"size":4321,"ptr":"mail.example.org","ptrState":"ok","relay":"mx.localghost.ai"}
```

`mailFrom` is `""` for a bounce (`MAIL FROM:<>`). `ptrState` is `ok` (the PTR resolves back to
the IP; `ptr` is the name), `none`, `mismatch` or `error`; a delivery report the relay writes
itself has `ptrState: "relay"`, `ip: ""`, `tls: "relay"`. The box computes SPF, DKIM, DMARC and
the rest from the message and the note; the relay computes nothing else.

## 3. The API

Behind the host's HTTPS, every call with `Authorization: Bearer <token>`. The box id is in the
path and must be the one the token belongs to; a mismatch, a missing or wrong token is `401`.

| call | answer |
|---|---|
| `GET /box/<id>/in/` | `200` JSON `[{"name":"…seal","size":4321,"note":true}, …]`, oldest first, notes not listed as entries |
| `GET /box/<id>/in/<name>` | `200` the sealed bytes (`application/octet-stream`); `404` when gone |
| `DELETE /box/<id>/in/<name>` | `204`; removes the note too; `204` also when already gone |
| `GET /box/<id>/key` | `200` `{"pub":"<64 hex>","hostname":"mx.localghost.ai"}`; `503` when the relay has no outbound key |
| `POST /box/<id>/out` | body `{"from":"agent@lgs.example","to":["paul@example.org"],"sealed":"<base64>"}`; `200` `{"name":"…seal"}`; `422` with a plain-text reason when refused |
| `GET /box/<id>/out/<name>` | `200` the job JSON (below); `404` when unknown |

The box fetches the note first, then the message, stores both, then deletes. A box that
already holds a name deletes it on the relay without fetching. The box pulls every two minutes
while it is unlocked and never otherwise; the relay keeps a file thirty days.

`sealed` in `POST …/out` is the complete RFC 5322 message, CRLF, DKIM-signed by the box, sealed
to the relay's public key from `GET …/key`. The relay unseals it in memory and refuses (`422`)
when: the envelope `from` is not an address of the box (one of its `addresses=`, or on one of
its `domains=`); there are no recipients or more than twenty; a recipient does not parse; the
message does not open with the relay's key; the `From` header is not an address of the box;
there is no `DKIM-Signature` header with `d=` the `From` address's domain; the box's allowance
is spent. It verifies no signature (receivers do) and signs
nothing.

The job JSON:

```json
{"name":"…seal","box":"vlad","from":"agent@lgs.example","to":["paul@example.org"],"pending":[],
 "failed":{"x@y.example":"550 5.1.1 no such user"},"tries":3,"next":0,"accepted":1760000200,
 "updated":1760000900,"state":"sent|queued|bounced","lastErr":""}
```

The box reads `state`, `failed` and `lastErr`. On `bounced` the relay has also written a
delivery report into the box's inbound queue, from `mailer-daemon@<relay hostname>` to the
envelope sender, `Auto-Submitted: auto-replied`, listing the failed recipients and reasons.

## 4. boxes.conf

```
box=<id> [addresses=<a1>[,<a2>…]] [domains=<d1>[,<d2>…]] pub=<64 hex X25519> token=<64 hex sha256 of the bearer> dkim_rsa=<base64 DER> dkim_ed=<base64> [sendday=<n>]
```

`box` matches `^[a-z0-9][a-z0-9-]{2,31}$`. `addresses=` are single addresses on a shared
domain of the relay's (`ghost.localghost.ai`); `domains=` are domains the box owns whole; a line
has one or both. A `RCPT TO` is matched by exact address first, then by domain, so a stranger's
local part on the shared domain is `550`. `dkim_rsa=` and `dkim_ed=` are the box's DKIM public
keys; the relay never uses them, it prints them for the zone with `ghost.maild -dns <shared
domain>` (every box with an address on that domain, under the selectors `<box>-rsa` and
`<box>-ed`, which are the selectors the box signs with). The relay reloads the file when its
mtime changes. The box prints its own line (`ghost-cli ghost.noted mail-enrol`, SETTINGS ›
MAIL); the operator appends it, and for an own domain first checks `dig MX <domain>` points at
the relay.

The outbound check is against the line: the envelope sender and the `From` header must be one
of the box's addresses or on one of its domains, and a `DKIM-Signature` must carry `d=` the
`From` address's domain.

## 5. SMTP, what a sender meets

Greeting `220 <hostname> ESMTP ghost.maild`. `EHLO` advertises `STARTTLS` (before TLS), `SIZE
26214400`, `8BITMIME`, `PIPELINING`, `ENHANCEDSTATUSCODES`. `MAIL` before `STARTTLS` is `530
5.7.0 Must issue a STARTTLS command first`. A `RCPT TO` whose domain is in no box's line is `550
5.1.1 no such mailbox here`. More than four messages a minute from one IP is `421 4.7.0`. A box
over 200 MB queued is `452 4.2.2 mailbox full, try later`. A message over the size is `552
5.3.4` after `DATA`. With `greylist=on`, a never-seen (IP /24, sender, recipient) is `451 4.7.1`
and taken two minutes later. No `AUTH`, no `SMTPUTF8`, no `VRFY` answers (252).

## 6. Delivery, what a receiver meets

`EHLO <hostname>`, `STARTTLS` with the certificate verified against the MX host's name (retried
once unverified if verification fails; a host offering no STARTTLS is skipped and the message
eventually bounces), `MAIL FROM:<the box's envelope sender>`, `RCPT TO`, `DATA`. The message's
`From`, `Date`, `Message-ID` and DKIM signatures are the box's; the relay adds nothing to the
message. Retries at 1, 5, 15, 60, 120, 240 minutes and then every four hours, for a day.
