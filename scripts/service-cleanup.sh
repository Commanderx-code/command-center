#!/usr/bin/env bash
# Audit by default. No package removal, unit deletion, masking, or service stopping.
set -euo pipefail
export LC_ALL=C
scope=${1:-user}
case "$scope" in user|system) ;; *) echo 'Usage: bash service-cleanup.sh user|system [--disable NAME.service]' >&2; exit 2;; esac
shift "$(( $# > 0 ? 1 : 0 ))"
ctl=(systemctl "--$scope" --no-pager)
if [[ "$scope" == user && "$EUID" == 0 ]]; then echo 'Run user-service cleanup as your normal user, without sudo.' >&2; exit 2; fi
prop() { "${ctl[@]}" show --property="$2" --value -- "$1"; }
if (( $# == 0 )); then
  echo 'Audit only: inactive does not mean unused. No changes will be made.'
  echo 'Check descriptions, timers/sockets, dependencies, and logs before disabling anything.'
  printf '\n%-60s %-14s %s\n' SERVICE STATE ENABLEMENT
  files=$("${ctl[@]}" list-unit-files --type=service --no-legend --full)
  while read -r unit enabled rest; do
    [[ "$unit" == *.service && "$unit" != *@.service ]] || continue
    active=$(prop "$unit" ActiveState) || { echo "Cannot inspect $unit" >&2; continue; }
    if [[ "$active" == inactive || "$active" == failed ]]; then
      printf '%-60s %-14s %s\n' "$unit" "$active" "$enabled"
    fi
  done <<< "$files"
  echo
  echo 'To review one enabled, inactive service for disabling:'
  printf 'bash service-cleanup.sh %q --disable NAME.service\n' "$scope"
  [[ "$scope" != system ]] || echo 'For system changes, run that command with sudo after reviewing this script.'
  exit 0
fi
[[ $# == 2 && "$1" == --disable ]] || { echo 'Expected --disable NAME.service' >&2; exit 2; }
unit=$2
[[ "$unit" != -* && "$unit" =~ ^[a-zA-Z0-9_@.:+\\-]+\.service$ && "$unit" != *@.service ]] || { echo 'Invalid service name' >&2; exit 2; }
check() {
  [[ $(prop "$unit" LoadState) == loaded ]] || { echo 'Unit is not loaded.' >&2; return 1; }
  [[ $(prop "$unit" ActiveState) == inactive ]] || { echo 'Only inactive services can be disabled here. Investigate failed services separately.' >&2; return 1; }
  [[ $(prop "$unit" UnitFileState) == enabled ]] || { echo 'Only persistently enabled services are supported; disabled/static/masked/generated units need no action here.' >&2; return 1; }
}
check
"${ctl[@]}" show --property=Id,Description,FragmentPath,ActiveState,UnitFileState,TriggeredBy,RequiredBy,WantedBy -- "$unit"
"${ctl[@]}" list-dependencies --reverse --all -- "$unit"
echo 'Disabling removes enablement links. It does not uninstall or stop the service.'
echo 'Timers, sockets, dependencies, or applications can still activate it.'
printf 'To undo: '
[[ "$scope" != system ]] || printf 'sudo '
printf 'systemctl --%s enable -- %q\n' "$scope" "$unit"
[[ "$scope" != system || "$EUID" == 0 ]] || { echo 'Review the output above, then rerun with sudo to make this system change.' >&2; exit 1; }
printf 'Type the exact service name to confirm disabling: '
IFS= read -r answer
[[ "$answer" == "$unit" ]] || { echo 'Canceled; no changes made.'; exit 0; }
check
"${ctl[@]}" disable -- "$unit"
echo 'Disabled. Unit files and packages were kept.'
