#!/bin/sh
# certbot deploy hook: copy the renewed certificate where ghost-mail can read it. Install with
#   cp deploy/mail/scripts/certbot-hook.sh /etc/letsencrypt/renewal-hooks/deploy/ghost-maild.sh && chmod +x ...
# ghost.maild reloads the files on its own within ten minutes; no restart.
set -e
NAME="${RENEWED_DOMAINS:-mx.localghost.ai}"
NAME="${NAME%% *}"
LIVE="/etc/letsencrypt/live/$NAME"
[ -d "$LIVE" ] || exit 0
install -d -o ghost-mail -g ghost-mail -m 0750 /etc/ghost-mail/tls
install -o ghost-mail -g ghost-mail -m 0640 "$LIVE/fullchain.pem" /etc/ghost-mail/tls/fullchain.pem
install -o ghost-mail -g ghost-mail -m 0640 "$LIVE/privkey.pem" /etc/ghost-mail/tls/privkey.pem
