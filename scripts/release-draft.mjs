import {readFileSync,writeFileSync,rmSync,mkdtempSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=new URL('../',import.meta.url);
const repo='Commanderx-code/command-center';
function run(program,args,cwd=root){const r=spawnSync(program,args,{cwd,encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr||`${program} failed`);return r.stdout.trim();}
const version=JSON.parse(readFileSync(new URL('package.json',root),'utf8')).version;
const tag=`v${version}`;
if(process.argv[2]!==tag)throw new Error(`Use npm run release:draft -- ${tag}`);
if(run('git',['status','--porcelain']))throw new Error('Commit or stash changes before preparing a release.');
const head=run('git',['rev-parse','HEAD']);
if(run('git',['rev-parse',`${tag}^{commit}`])!==head)throw new Error('Check out the release tag before preparing its draft.');
const remote=run('git',['ls-remote',`https://github.com/${repo}.git`,`refs/tags/${tag}`,`refs/tags/${tag}^{}`]);
const refs=remote.split('\n').map(line=>line.split(/\s+/));
const sha=refs.find(r=>r[1]===`refs/tags/${tag}^{}`)?.[0]||refs.find(r=>r[1]===`refs/tags/${tag}`)?.[0];
if(sha!==head)throw new Error('Push the matching release tag to GitHub first.');
for(const script of ['check','test','test:rust']){
 const r=spawnSync('npm',['run',script],{cwd:root,stdio:'inherit'});if(r.status!==0)throw new Error(`${script} failed; no draft created.`);
}
// Publish the packages CI built on the oldest base and install-tested on each distribution.
const runs=JSON.parse(run('gh',['run','list','--repo',repo,'--workflow','linux-packages.yml','--commit',head,'--json','databaseId,conclusion,url','--limit','20']));
const passed=runs.find(r=>r.conclusion==='success');
if(!passed)throw new Error(`No successful Linux packages run for ${head.slice(0,7)}. Wait for CI on ${tag} to pass; no draft created.`);
const out=new URL('artifacts/release/',root).pathname;
rmSync(out,{recursive:true,force:true});
run('gh',['run','download',String(passed.databaseId),'--repo',repo,'--name','packages','--dir',out]);
const packages=[`command-center_${version}_amd64.deb`,`command-center-${version}-1.x86_64.rpm`];
const sums=readFileSync(join(out,'SHA256SUMS'),'utf8');
for(const asset of packages)if(!sums.includes(`  ${asset}\n`))throw new Error(`${asset} is missing from the CI artifact`);
run('sha256sum',['--check','--strict','SHA256SUMS'],out);
// The Arch package is built from the release tag by the same run's arch job.
const pkgrel=readFileSync(new URL('packaging/aur/PKGBUILD',root),'utf8').match(/^pkgrel=(\d+)$/m)?.[1];
const arch=`command-center-${version}-${pkgrel}-x86_64.pkg.tar.zst`;
const archDir=mkdtempSync(join(tmpdir(),'command-center-arch-'));
run('gh',['run','download',String(passed.databaseId),'--repo',repo,'--name','arch-package','--dir',archDir]);
if(!readFileSync(join(archDir,'SHA256SUMS'),'utf8').includes(`  ${arch}\n`))throw new Error(`${arch} is missing from the CI artifact`);
run('sha256sum',['--check','--strict','SHA256SUMS'],archDir);
copyFileSync(join(archDir,arch),join(out,arch));
const assets=[...packages,arch];
// Each package must carry build provenance signed by this repository's packages workflow for this tag.
for(const asset of assets)run('gh',['attestation','verify',join(out,asset),'--repo',repo,'--signer-workflow',`${repo}/.github/workflows/linux-packages.yml`,'--source-ref',`refs/tags/${tag}`,'--source-digest',head,'--deny-self-hosted-runners']);
writeFileSync(join(out,'SHA256SUMS'),run('sha256sum',assets,out)+'\n');
const notes=join(mkdtempSync(join(tmpdir(),'command-center-release-')),'notes.md');
writeFileSync(notes,`${readFileSync(new URL('docs/release-notes.md',root),'utf8').trimEnd()}\n\n### Build and validation\n\nBoth packages were built once on Ubuntu 22.04 (glibc 2.35), then installed and launched as a normal user on Ubuntu 22.04, Debian 12, Ubuntu 24.04 and Fedora 43. The Arch package was built from the release tag with packaging/aur/PKGBUILD in a clean container, linted with namcap, installed and launched. Workflow run: ${passed.url}\n\nEach package carries signed build provenance from that workflow. To confirm a download was built by this repository's CI from the ${tag} tag, run \`gh attestation verify <file> --repo ${repo}\`.\n`);
console.log(run('gh',['release','create',tag,...assets.map(a=>join(out,a)),join(out,'SHA256SUMS'),'--repo',repo,'--verify-tag','--draft','--title',`Command Center ${tag}`,'--notes-file',notes]));
console.log(`Draft created from ${passed.url}. Download and verify the hosted assets, test the app on your machine, then publish on GitHub.`);
