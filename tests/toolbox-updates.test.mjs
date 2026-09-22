import test from 'node:test';
import assert from 'node:assert/strict';
import {pinSources} from '../scripts/pin-toolbox.mjs';
import {catalogInstructions} from '../src/toolbox-updates.js';
test('catalog revisions are validated and changed pins stay aligned',()=>{
 const old='a'.repeat(40),next='b'.repeat(40);
 const cargo=`linutil_core = { git = "https://github.com/Commanderx-code/commander-toolbox.git", rev = "${old}" }\n`;
 const adapter=`pub const REVISION: &str = "${old}";`;
 const result=pinSources(cargo,adapter,next);assert.ok(result.cargo.includes(next));assert.ok(result.adapter.includes(next));
 assert.throws(()=>pinSources(cargo,adapter,'main; echo unsafe'));
 assert.throws(()=>pinSources(cargo,adapter.replace(old,next),old));
 assert.throws(()=>catalogInstructions({bundled:old,latest:'bad'}));
 assert.match(catalogInstructions({bundled:old,latest:old}),/matches/);
 assert.match(catalogInstructions({bundled:old,latest:next}),/toolbox:pin/);
});

import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
test('catalog pinning rolls back both pins and lockfile after a failed validation',()=>{
 const dir=mkdtempSync(join(tmpdir(),'cc-pin-test-')),old='a'.repeat(40),next='b'.repeat(40);
 const paths=['src-tauri/Cargo.toml','src-tauri/src/toolbox.rs','src-tauri/Cargo.lock'];
 const originals=[`linutil_core = { git = "https://github.com/Commanderx-code/commander-toolbox.git", rev = "${old}" }\n`,`pub const REVISION: &str = "${old}";`,'original lock'];
 for(const folder of ['scripts','src-tauri/src','bin'])mkdirSync(join(dir,folder),{recursive:true});
 copyFileSync(resolve('scripts/pin-toolbox.mjs'),join(dir,'scripts/pin-toolbox.mjs'));
 paths.forEach((path,i)=>writeFileSync(join(dir,path),originals[i]));
 writeFileSync(join(dir,'bin/git'),`#!/bin/sh
case "$1" in
 status) printf '%s' "$TEST_DIRTY";;
 rev-parse) printf '%s' "$TEST_SHA";;
esac
`,{mode:0o755});
 writeFileSync(join(dir,'bin/cargo'),'#!/bin/sh\nprintf changed > src-tauri/Cargo.lock\n',{mode:0o755});
 writeFileSync(join(dir,'bin/npm'),'#!/bin/sh\n[ "$TEST_FAIL" != "$2" ]\n',{mode:0o755});
 const run=extra=>spawnSync(process.execPath,[join(dir,'scripts/pin-toolbox.mjs'),next],{encoding:'utf8',env:{...process.env,PATH:`${join(dir,'bin')}:${process.env.PATH}`,TEST_SHA:next,TEST_FAIL:'test:rust',TEST_DIRTY:'',...extra}});
 const unchanged=()=>paths.forEach((path,i)=>assert.equal(readFileSync(join(dir,path),'utf8'),originals[i]));
 try{
  const failed=run({});assert.notEqual(failed.status,0);assert.match(failed.stderr,/original pins and Cargo.lock restored/);unchanged();
  const mismatch=run({TEST_SHA:old});assert.notEqual(mismatch.status,0);unchanged();
  const dirty=run({TEST_DIRTY:' M src-tauri/Cargo.toml'});assert.notEqual(dirty.status,0);unchanged();
  const success=run({TEST_FAIL:'never'});assert.equal(success.status,0,success.stderr);assert.ok(readFileSync(join(dir,paths[0]),'utf8').includes(next));assert.ok(readFileSync(join(dir,paths[1]),'utf8').includes(next));assert.equal(readFileSync(join(dir,paths[2]),'utf8'),'changed');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
