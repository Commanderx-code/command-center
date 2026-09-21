import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {filterServices} from '../src/system-workflows.js';

test('service state filters distinguish inactive, failed and unloaded units and compose with search',()=>{
  const rows=['active','inactive','failed','not loaded'].map(active=>({unit:`backup-${active}.service`,description:'Personal backup',active}));
  assert.equal(filterServices(rows,'BACKUP','all').length,4);
  for(const state of ['active','inactive','failed','not loaded'])assert.deepEqual(filterServices(rows,'personal',state),[rows.find(r=>r.active===state)]);
  assert.equal(filterServices(rows,'missing','inactive').length,0);
});

test('cleanup audits without mutation, cancels, rejects unsafe states, and disables only a confirmed named unit',()=>{
  const dir=mkdtempSync(join(tmpdir(),'cc-cleanup-'));const log=join(dir,'log');
  writeFileSync(join(dir,'systemctl'),`#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$TEST_LOG"
case "$*" in
 *list-unit-files*) echo 'example.service enabled enabled';;
 *--property=LoadState*) echo loaded;;
 *--property=ActiveState*) echo "\${TEST_STATE:-inactive}";;
 *--property=UnitFileState*) echo enabled;;
esac
`,{mode:0o755});
  const run=(args,input='',extra={})=>spawnSync('bash',[resolve('scripts/service-cleanup.sh'),'system',...args],{encoding:'utf8',input,env:{...process.env,PATH:`${dir}:${process.env.PATH}`,TEST_LOG:log,...extra}});
  const changed=()=>readFileSync(log,'utf8').split('\n').filter(l=>l.includes(' disable '));
  try {
    assert.equal(run([]).status,0);assert.equal(changed().length,0);
    assert.equal(run(['--disable','example.service'],'no\n').status,process.getuid()===0?0:1);assert.equal(changed().length,0);
    assert.notEqual(run(['--disable','example.service'],'example.service\n',{TEST_STATE:'active'}).status,0);assert.equal(changed().length,0);
    assert.notEqual(run(['--disable','example.service'],'example.service\n',{TEST_STATE:'failed'}).status,0);assert.equal(changed().length,0);
    assert.notEqual(run(['--disable','../evil.service']).status,0);assert.equal(changed().length,0);
    const result=run(['--disable','example.service'],'example.service\n');
    if(process.getuid()===0){assert.equal(result.status,0,result.stderr);assert.deepEqual(changed(),['--system --no-pager disable -- example.service']);}
    else {assert.equal(result.status,1);assert.equal(changed().length,0);}
  }finally{rmSync(dir,{recursive:true,force:true});}
});
