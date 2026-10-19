#!/usr/bin/env bash
set -euo pipefail
# Ubuntu 24 restricts user namespaces for downloaded Chromium builds.
# Allow only the installed executable; keep the global AppArmor restriction enabled.
if [[ ! -f /proc/sys/kernel/apparmor_restrict_unprivileged_userns ]]; then exit 0; fi
adsnapBrowser=$(find "$HOME/.cache/ms-playwright" -type f \( -name chrome-headless-shell -o -name headless_shell \) -print -quit)
if [[ -z "$adsnapBrowser" || ! -x "$adsnapBrowser" ]]; then
  echo 'Installed capture Chromium executable not found' >&2
  exit 1
fi
sudo tee /etc/apparmor.d/adsnap-capture-chromium > /dev/null <<EOF
abi <abi/4.0>,
include <tunables/global>
profile adsnap-capture-chromium "$adsnapBrowser" flags=(unconfined) {
  userns,
}
EOF
sudo apparmor_parser -r /etc/apparmor.d/adsnap-capture-chromium
