import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,chmodSync,rmSync,copyFileSync,symlinkSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
test('source updater cancels without fetching and stops before installation when validation fails',()=>{
 const dir=mkdtempSync(join(tmpdir(),'cc-update-'));chmodSync(dir,0o777);
 const script=join(dir,'update.sh');copyFileSync(resolve('scripts/update-desktop.sh'),script);chmodSync(script,0o755);
 const log=join(dir,'commands');
 writeFileSync(join(dir,'git'),`#!/bin/bash
printf 'git %s\\n' "$*" >> "$TEST_LOG"
if [[ "$1" == init ]]; then printf '{"version":"%s"}' "$TEST_VERSION" > "$3/package.json"; fi
`,{mode:0o755});
 writeFileSync(join(dir,'npm'),`#!/bin/bash
printf 'npm %s\\n' "$*" >> "$TEST_LOG"
[[ "$*" != "$TEST_FAIL" ]]
`,{mode:0o755});
 writeFileSync(join(dir,'cargo'),'#!/bin/bash\nexit 0\n',{mode:0o755});
 writeFileSync(join(dir,'id'),'#!/bin/bash\necho 1000\n',{mode:0o755});
 symlinkSync(process.execPath,join(dir,'node'));
 const run=(tag,input,extra={})=>spawnSync('/bin/bash',[script,tag],{cwd:dir,encoding:'utf8',input,env:{...process.env,PATH:`${dir}:/usr/bin:/bin`,TEST_LOG:log,TEST_VERSION:'0.4.0',TEST_FAIL:'never',...extra}});
 const reset=()=>{if(existsSync(log))rmSync(log);};
 try{
  assert.equal(run('v0.4.0','no\n').status,0);assert.equal(existsSync(log),false);
  assert.notEqual(run('main','main\n').status,0);assert.equal(existsSync(log),false);
  const failed=run('v0.4.0','v0.4.0\n',{TEST_FAIL:'run test:rust'});assert.notEqual(failed.status,0);assert.doesNotMatch(readFileSync(log,'utf8'),/desktop:install/);reset();
  const mismatch=run('v0.4.0','v0.4.0\n',{TEST_VERSION:'0.3.3'});assert.notEqual(mismatch.status,0);assert.doesNotMatch(readFileSync(log,'utf8'),/npm/);reset();
  const good=run('v0.4.0','v0.4.0\n');assert.equal(good.status,0,good.stderr);const commands=readFileSync(log,'utf8');assert.match(commands,/npm run desktop:install/);
  const work=commands.match(/git init -q (.+)/)[1];assert.equal(existsSync(work),false);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
