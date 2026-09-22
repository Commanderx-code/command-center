#!/usr/bin/env bash
set -euo pipefail
[[ $(id -u) != 0 ]] || { echo 'Run as your normal user, without sudo.' >&2; exit 1; }
tag=${1:-}
[[ $# == 1 && "$tag" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || { echo 'Usage: bash update-desktop.sh vMAJOR.MINOR.PATCH' >&2; exit 2; }
for tool in git npm node cargo; do command -v "$tool" >/dev/null || { echo "Install $tool first." >&2; exit 1; }; done
echo "Build and install Command Center $tag from Commanderx-code/command-center."
echo 'Close Command Center first. Requires the same Linux build dependencies as development.'
echo 'Your project checkout and app settings are kept. The installed binary is saved as command-center.previous.'
printf 'Type the release tag to continue: '
IFS= read -r answer
[[ "$answer" == "$tag" ]] || { echo 'Canceled.'; exit 0; }
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
git init -q "$work"
git -C "$work" remote add origin https://github.com/Commanderx-code/command-center.git
git -C "$work" fetch --depth=1 origin "refs/tags/$tag:refs/tags/$tag"
git -C "$work" checkout --detach "$tag"
cd "$work"
node --input-type=module - "$tag" <<'JS'
import {readFileSync} from 'node:fs';
const pkg=JSON.parse(readFileSync('package.json','utf8'));
if(`v${pkg.version}`!==process.argv[2])throw new Error('Release tag and package version differ');
JS
npm ci
npm run check
npm test
npm run test:rust
npm run desktop:install
echo 'Update installed. Open Command Center from your application menu.'
echo 'To roll back the local installation, close the app and run:'
echo 'cp -- ~/.local/bin/command-center.previous ~/.local/bin/command-center.rollback'
echo 'chmod +x ~/.local/bin/command-center.rollback'
echo 'mv -- ~/.local/bin/command-center.rollback ~/.local/bin/command-center'
