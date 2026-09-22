#!/usr/bin/env bash
# CI launch check, with temporary display/session; it does not invoke app actions.
set -euo pipefail
binary=${1:?Pass the installed executable path}
log=$(mktemp)
trap 'rm -f -- "$log"' EXIT
set +e
timeout --signal=TERM 20s dbus-run-session -- xvfb-run -a "$binary" >"$log" 2>&1
status=$?
set -e
cat "$log"
if [ "$status" -ne 124 ]; then
  printf 'Application exited before the 20-second launch check (status %s).\n' "$status" >&2
  exit 1
fi
if grep -Ei 'panicked at|error while loading shared libraries|error while running Command Center' "$log"; then exit 1; fi
printf 'Installed application stayed running for 20 seconds.\n'
