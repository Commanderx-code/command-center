#!/usr/bin/env python3
"""Validate metadata and ELF payloads, then prepare versioned release assets."""
from pathlib import Path
import hashlib, io, json, re, shutil, struct, subprocess, tarfile
root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'package.json').read_text())['version']
bundles = root / 'src-tauri/target/release/bundle'
deb = bundles / f'deb/Command Center_{version}_amd64.deb'
rpm = bundles / f'rpm/Command Center-{version}-1.x86_64.rpm'

def member(archive, name):
    with tarfile.open(fileobj=io.BytesIO(subprocess.check_output(['ar', 'p', str(deb), archive]))) as tar:
        return tar.extractfile(next(m for m in tar.getmembers() if m.name.lstrip('./') == name)).read()

def glibc(text):
    return tuple(int(n) for n in text.split('.'))

# The declared glibc floor must cover every symbol version the binary requires.
linux = json.loads((root / 'src-tauri/tauri.conf.json').read_text())['bundle']['linux']
floor = re.fullmatch(r'libc6 \(>= ([0-9.]+)\)', linux['deb']['depends'][0])[1]
assert linux['rpm']['depends'][0] == f'libc.so.6(GLIBC_{floor})(64bit)', 'deb and rpm glibc floors differ'
control = member('control.tar.gz', 'control').decode()
assert f'Version: {version}\n' in control and 'Architecture: amd64' in control
for dependency in [f'libc6 (>= {floor})', 'libwebkit2gtk-4.1-0', 'libgtk-3-0', 'libayatana-appindicator3-1']:
    assert dependency in control, dependency
raw = rpm.read_bytes()

def header(offset):
    assert raw[offset:offset+3] == b'\x8e\xad\xe8'
    n, size = struct.unpack_from('>II', raw, offset+8)
    start = offset+16+n*16
    values = {}
    for i in range(n):
        tag, kind, index, count = struct.unpack_from('>IIII', raw, offset+16+i*16)
        if kind in (6, 8, 9):
            values[tag] = [x.decode() for x in raw[start+index:start+size].split(b'\0')[:count]]
    return values, start+size

_, end = header(96)
values, _ = header((end+7)//8*8)
assert values[1001] == [version] and values[1022] == ['x86_64']
for dependency in [f'libc.so.6(GLIBC_{floor})(64bit)', 'libwebkit2gtk-4.1.so.0()(64bit)', 'libgtk-3.so.0()(64bit)', 'libappindicator3.so.1()(64bit)']:
    assert dependency in values[1049], dependency
# The MIT notice and third-party notices must ship with every binary package.
license = (root / 'LICENSE').read_bytes()
assert member('data.tar.gz', 'usr/share/doc/command-center/copyright') == license
assert member('data.tar.gz', 'usr/share/doc/command-center/THIRD_PARTY.md') == (root / 'THIRD_PARTY.md').read_bytes()
assert subprocess.check_output(['bsdtar', '-xOf', str(rpm), './usr/share/licenses/command-center/LICENSE']) == license
assert subprocess.check_output(['bsdtar', '-xOf', str(rpm), './usr/share/doc/command-center/THIRD_PARTY.md']) == (root / 'THIRD_PARTY.md').read_bytes()
assert values[1014] == ['MIT'], values.get(1014)
pin = re.search(r'REVISION: &str = "([a-f0-9]+)"', (root/'src-tauri/src/toolbox.rs').read_text())[1]
for binary in [member('data.tar.gz', 'usr/bin/command-center'), subprocess.check_output(['bsdtar', '-xOf', str(rpm), './usr/bin/command-center'])]:
    assert binary[:4] == b'\x7fELF' and struct.unpack_from('<H', binary, 18)[0] == 62
    assert pin.encode() in binary
    required = max(re.findall(rb'GLIBC_(2\.[0-9]+(?:\.[0-9]+)?)\0', binary), key=lambda v: glibc(v.decode())).decode()
    assert glibc(required) <= glibc(floor), f'Binary requires glibc {required}, but packages declare {floor}; build on an older base'
out = root / 'artifacts/release'
out.mkdir(parents=True, exist_ok=True)
lines = []
for source, name in [(deb, f'command-center_{version}_amd64.deb'), (rpm, f'command-center-{version}-1.x86_64.rpm')]:
    target = out / name
    shutil.copy2(source, target)
    lines.append(hashlib.sha256(target.read_bytes()).hexdigest() + '  ' + name)
(out / 'SHA256SUMS').write_text('\n'.join(lines) + '\n')
print(f'Validated {version} package metadata and ELF payloads (glibc {required} required, {floor} declared); checksums prepared in {out}.')
