import test from 'node:test';
import assert from 'node:assert/strict';
import {normalize,validateActions} from '../src/preferences.js';
import {parseSettingsExport,importDraft} from '../src/preference-extras.js';
import {backupOverview} from '../src/backup-overview.js';
const action={id:'upgrade',name:'Upgrade',command:'full-upgrade',directory:'~',shell:'fish',mode:'external'};
test('settings export round trip retains actions; default import preserves machine connections',()=>{
  const current=normalize({roots:['/here'],integrations:{dotfilesPath:'/here/dotfiles'},customActions:[action]});
  const imported=normalize({theme:'light',roots:['/there'],editor:'kate',customActions:[{...action,id:'other'}]});
  const parsed=parseSettingsExport(JSON.stringify({format:'command-center-settings',version:1,settings:imported}));
  assert.deepEqual(parsed,imported);
  const draft=importDraft(current,parsed,false);
  assert.equal(draft.theme,'light');assert.deepEqual(draft.roots,['/here']);assert.deepEqual(draft.customActions,[action]);
  assert.deepEqual(importDraft(current,parsed,true),imported);
  assert.equal(current.theme,'dark');
});
test('all settings imports preserve the locally configured automatic health helper',()=>{
  for (const local of ['', '/here/health']) {
    for (const incoming of ['', '~/download/health', '/there/health']) {
      for (const includeMachine of [false,true]) {
        const current=normalize({integrations:{backupHealthScript:local}});
        const imported=normalize({integrations:{backupHealthScript:incoming,dotfilesPath:'/there/dotfiles'}});
        const draft=importDraft(current,imported,includeMachine);
        assert.equal(draft.integrations.backupHealthScript,local);
        assert.equal(draft.integrations.dotfilesPath,includeMachine?'/there/dotfiles':'');
        assert.equal(imported.integrations.backupHealthScript,incoming);
      }
    }
  }
});
test('imports reject unsupported versions, invalid enums, malformed actions and oversized input',()=>{
  const encode=settings=>JSON.stringify({format:'command-center-settings',version:1,settings});
  assert.throws(()=>parseSettingsExport('{'));
  assert.throws(()=>parseSettingsExport(JSON.stringify({format:'command-center-settings',version:99,settings:{}})));
  assert.throws(()=>parseSettingsExport(encode({theme:'pink'})));
  assert.throws(()=>parseSettingsExport(encode({customActions:[{...action,shell:'unknown'}]})));
  assert.throws(()=>parseSettingsExport(' '.repeat(1_000_001)));
  assert.throws(()=>validateActions([action,action]));
  assert.throws(()=>validateActions([{...action,directory:'relative'}]));
  assert.deepEqual(normalize({customActions:[action]}).customActions,[action]);
  assert.deepEqual(normalize({}).customActions,[]);
});
test('backup overview distinguishes disconnected, unknown, remote and successful records',()=>{
  const config={resticRepository:'/backup/restic',backupMaxHours:24};
  const now=Date.parse('2026-09-21T12:00:00Z');
  const health={backup:{available:true,data:{drive_mounted:false,jobs:{backup:{completed_at:'2026-09-21T11:00:00Z'}}}},backupHelpers:{personal:true,full:true}};
  const off=backupOverview(health,config,now);assert.match(off.drive,/Disconnected/);assert.equal(off.personal,false);assert.equal(off.completedAt,now-3600000);
  const unknown=backupOverview({...health,backup:{available:false}},config,now);assert.match(unknown.drive,/unknown/);assert.equal(unknown.completedAt,null);
  const remote=backupOverview(health,{...config,resticRepository:'sftp:host:/backup'},now);assert.match(remote.drive,/Remote/);assert.equal(remote.personal,false);
  health.backup.data.drive_mounted=true;assert.equal(backupOverview(health,config,now).personal,true);
});

import {scheduleFields} from '../src/system-workflows.js';
import {paletteMatches} from '../src/command-palette.js';
test('schedule editor recognizes app-owned calendars and rejects unsupported shapes',()=>{
  assert.deepEqual(scheduleFields('Sun *-*-* 03:15:00'),{schedule:'weekly',hour:3,minute:15});
  assert.deepEqual(scheduleFields('*-*-* *:05:00'),{schedule:'hourly',hour:0,minute:5});
  assert.equal(scheduleFields('*-*-* 99:00:00'),null);assert.equal(scheduleFields('arbitrary'),null);
});
test('palette search matches all words and limits long result lists',()=>{
  const rows=[{label:'Dotfiles',detail:'Repository /home/user/dotfiles'},{label:'Backup',detail:'Page'}];
  assert.equal(paletteMatches(rows,'dot repository').length,1);assert.equal(paletteMatches(rows,'unknown').length,0);
  assert.equal(paletteMatches(Array(100).fill(rows[0]),'').length,40);
});
