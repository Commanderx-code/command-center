import test from 'node:test';
import assert from 'node:assert/strict';
import {normalize,readBrowserSettings} from '../src/preferences.js';
import {selectRepositories,statusParts} from '../src/repository-view.js';

test('old preferences preserve apps and folders while gaining display defaults',()=>{
  const s=normalize({displayName:'Matt',editor:'kate',terminal:'ghostty',roots:['~/work']});
  assert.equal(s.editor,'kate'); assert.equal(s.terminal,'ghostty');
  assert.deepEqual(s.roots,['~/work']); assert.equal(s.theme,'dark');
  assert.equal(s.showPaths,true); assert.equal(s.repoLayout,'cards');
});
test('invalid preferences and corrupted browser data recover safely',()=>{
  const s=normalize({theme:'invalid',repoSort:'other',scanDepth:999,roots:['relative','~/work','~/work']});
  assert.equal(s.theme,'dark'); assert.equal(s.repoSort,'name'); assert.equal(s.scanDepth,3);
  assert.deepEqual(s.roots,['~/work']);
  assert.equal(readBrowserSettings({getItem(){return '{broken'}}).editor,'auto');
});
test('false visibility preferences and empty roots survive normalization',()=>{
  const s=normalize({showPaths:false,showHero:false,roots:[]});
  assert.equal(s.showPaths,false); assert.equal(s.showHero,false); assert.deepEqual(s.roots,[]);
});
test('dirty files never hide ahead and behind commits',()=>{
  const parts=statusParts({dirty:true,modified_files:2,ahead:3,behind:1,has_upstream:true});
  assert.deepEqual(parts.map(p=>p.text),['2 changed','↑ 3 ahead','↓ 1 behind']);
});
test('failed inspection is never shown as a clean working tree',()=>{
  const repo={name:'unknown',path:'/tmp/unknown',status_error:true};
  assert.equal(statusParts(repo)[0].text,'Status unavailable');
  assert.equal(selectRepositories([repo],'','clean','name').length,0);
  assert.equal(selectRepositories([repo],'','dirty','name').length,1);
});
test('filter and sort compose without mutating the source list',()=>{
  const repos=[{name:'z',path:'/z',branch:'main'},{name:'a',path:'/a',branch:'dev',ahead:1}];
  assert.equal(selectRepositories(repos,'','all','attention')[0].name,'a');
  assert.equal(selectRepositories(repos,'','all','name-desc')[0].name,'z');
  assert.equal(selectRepositories(repos,'dev','ahead','name')[0].name,'a');
  assert.deepEqual(repos.map(r=>r.name),['z','a']);
});
