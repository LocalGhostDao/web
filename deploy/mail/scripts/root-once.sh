#!/bin/sh
# The three things only root can do, once; after this every update is the deploy user's.
#   sudo ./deploy/mail/scripts/root-once.sh [deploy user, default: the sudo caller; never root]
#
# 1. Port 25. A port under 1024 needs root or a capability; a capability on the binary would
#    have to be re-set by root at every update, so instead the kernel's unprivileged-port floor
#    is lowered to 25 on this machine. Ports 25..1023 become bindable by any local user; on a
#    machine with one user and nginx already holding 80 and 443, that is the trade.
# 2. The certificate. certbot keeps /etc/letsencrypt/live root-only; a deploy hook copies the
#    mx certificate's PEMs into the deploy user's ~/ghost-mail/tls at every renewal, owned by
#    them. The hook is installed here and run once (it does nothing until the certificate exists).
# 3. Lingering, so the deploy user's systemd user units run without a login and after a reboot.
set -e
[ "$(id -u)" -eq 0 ] || { echo "run with sudo"; exit 1; }
U="${1:-${SUDO_USER:-}}"
[ -n "$U" ] && id "$U" >/dev/null 2>&1 || { echo "deploy user? run as  sudo $0 <user>  from that user, or name it"; exit 1; }
[ "$U" != "root" ] || { echo "the deploy user is not root; name it:  sudo $0 coder"; exit 1; }
H="$(getent passwd "$U" | cut -d: -f6)"
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "net.ipv4.ip_unprivileged_port_start = 25" > /etc/sysctl.d/90-ghost-mail.conf
sysctl -q -p /etc/sysctl.d/90-ghost-mail.conf
echo "1. unprivileged ports start at 25 (/etc/sysctl.d/90-ghost-mail.conf)"

install -d -o "$U" -g "$U" -m 0750 "$H/ghost-mail" "$H/ghost-mail/tls"
if [ -d /etc/letsencrypt/renewal-hooks/deploy ]; then
  sed -e "s|@USER@|$U|g" -e "s|@DEST@|$H/ghost-mail/tls|g" "$HERE/certbot-hook.sh" > /etc/letsencrypt/renewal-hooks/deploy/ghost-maild.sh
  chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/ghost-maild.sh
  RENEWED_DOMAINS="mx.localghost.ai" /etc/letsencrypt/renewal-hooks/deploy/ghost-maild.sh || true
  echo "2. certbot deploy hook installed (copies the mx certificate into $H/ghost-mail/tls)"
else
  echo "2. certbot is not installed here; the hook was not placed"
fi

loginctl enable-linger "$U"
echo "3. lingering on for $U (user units run without a login and after reboot)"
echo "done; everything from here on is $U's: ./deploy/mail/scripts/install.sh"
