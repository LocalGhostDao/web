#!/bin/sh
# certbot deploy hook, installed by root-once.sh with @DEST@ filled in: copies the renewed mx
# certificate where the relay's user (ghost-mail) can read it. ghost.maild reloads the files on
# its own within ten minutes; no restart. Does nothing for other certificates.
set -e
case " ${RENEWED_DOMAINS:-mx.localghost.ai} " in *" mx.localghost.ai "*) ;; *) exit 0 ;; esac
LIVE="/etc/letsencrypt/live/mx.localghost.ai"
[ -d "$LIVE" ] || exit 0
install -d -o ghost-mail -g ghost-mail -m 0750 @DEST@
install -o ghost-mail -g ghost-mail -m 0640 "$LIVE/fullchain.pem" @DEST@/fullchain.pem
install -o ghost-mail -g ghost-mail -m 0640 "$LIVE/privkey.pem" @DEST@/privkey.pem
