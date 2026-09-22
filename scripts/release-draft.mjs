import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const root=new URL('../',import.meta.url);
function run(program,args){const r=spawnSync(program,args,{cwd:root,encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr||`${program} failed`);return r.stdout.trim();}
const version=JSON.parse(readFileSync(new URL('package.json',root),'utf8')).version;
const tag=`v${version}`;
if(process.argv[2]!==tag)throw new Error(`Use npm run release:draft -- ${tag}`);
if(run('git',['status','--porcelain']))throw new Error('Commit or stash changes before preparing a release.');
if(run('git',['rev-parse',`${tag}^{commit}`])!==run('git',['rev-parse','HEAD']))throw new Error('Check out the release tag before preparing its draft.');
const remote=run('git',['ls-remote','https://github.com/Commanderx-code/command-center.git',`refs/tags/${tag}`,`refs/tags/${tag}^{}`]);
const refs=remote.split('\n').map(line=>line.split(/\s+/));
const sha=refs.find(r=>r[1]===`refs/tags/${tag}^{}`)?.[0]||refs.find(r=>r[1]===`refs/tags/${tag}`)?.[0];
if(sha!==run('git',['rev-parse','HEAD']))throw new Error('Push the matching release tag to GitHub first.');
for(const script of ['check','test','test:rust','desktop:build']){
 const r=spawnSync('npm',['run',script],{cwd:root,stdio:'inherit'});if(r.status!==0)throw new Error(`${script} failed; no draft created.`);
}
console.log(run('gh',['release','create',tag,'--repo','Commanderx-code/command-center','--verify-tag','--draft','--title',`Command Center ${tag}`,'--notes-file','docs/release-notes.md']));
console.log('Draft created. Review it on GitHub and publish when ready. Source archives are supplied by GitHub; no portable binary is claimed.');
