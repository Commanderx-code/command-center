import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseStatus} from '../src/releases.js';
import {serviceAuditGroup,filterServices} from '../src/system-workflows.js';
import {backupOverview} from '../src/backup-overview.js';
test('release comparison handles multi-digit versions, downgrades and unsupported tags',()=>{
 assert.equal(releaseStatus('0.9.0','v0.10.0').updatable,true);
 assert.equal(releaseStatus('0.4.0','v0.4.0').updatable,false);
 assert.equal(releaseStatus('1.0.0','v0.4.0').updatable,false);
 for(const tag of ['v1.0.0-beta','v01.0.0','$(id)',null])assert.equal(releaseStatus('0.4.0',tag).updatable,false);
});
test('audit review filter excludes static and failed services',()=>{
 const rows=[{unit:'one.service',active:'inactive',enablement:'enabled'},{unit:'two.service',active:'inactive',enablement:'static'},{unit:'three.service',active:'failed',enablement:'enabled'}];
 assert.deepEqual(filterServices(rows,'','review'),[rows[0]]);
 assert.match(serviceAuditGroup(rows[1]),/On-demand/);assert.match(serviceAuditGroup(rows[2]),/investigate/);
});
test('failed backup records never display a successful timestamp',()=>{
 const h={backup:{available:true,data:{jobs:{backup:{completed_at:'2026-09-21T11:00:00Z',status:'failed'}}}}};
 const result=backupOverview(h,{});assert.equal(result.completedAt,null);assert.equal(result.state.label,'Failed');
});
