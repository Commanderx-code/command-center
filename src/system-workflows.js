export function filterServices(rows, query = '', status = 'all') {
  const words=query.toLowerCase().trim().split(/\s+/);
  return rows.filter(row => (status==='all'||row.active===status) && words.every(word=>`${row.unit} ${row.description} ${row.active}`.toLowerCase().includes(word)));
}
export function scheduleFields(calendar) {
  const match = /^(Sun )?\*-\*-\* (\*|\d{2}):(\d{2}):00$/.exec(calendar || '');
  if (!match) return null;
  const hour=match[2]==='*'?0:Number(match[2]), minute=Number(match[3]);
  if(hour>23||minute>59)return null;
  return {schedule:match[1]?'weekly':match[2]==='*'?'hourly':'daily',hour,minute};
}
export function createSystemWorkflows({state,$,escapeHtml:e,run,action,toast,switchView}) {
  const button=(label,id)=>`<button type="button" class="secondary-button" id="${id}">${label}</button>`;
  $('.main-nav').insertAdjacentHTML('beforeend','<button class="nav-item" data-view="services"><span>⚙</span>Services</button><button class="nav-item" data-view="inventory"><span>▤</span>System inventory</button>');
  $('main').insertAdjacentHTML('beforeend', `<section id="services-view" class="view"><div class="module-heading"><div><p class="eyebrow">Systemd</p><h2>Services</h2><p>Control your user services and inspect system services.</p></div></div><div class="toolbar panel"><select id="service-scope" aria-label="Service scope"><option value="user">User services</option><option value="system">System services · view only</option></select><select id="service-state" aria-label="Service state"><option value="all">All states</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="failed">Failed</option><option value="not loaded">Not loaded</option></select><input id="service-search" type="search" placeholder="Filter services…" aria-label="Filter services">${button('Refresh','services-refresh')}</div><p id="services-status" role="status"></p><p id="services-count" role="status"></p><details class="panel module-panel"><summary>Service cleanup</summary><p>Inactive does not mean unused: scheduled and on-demand services often rest between runs. Review dependencies and logs before disabling a service. This helper audits by default and can disable one named, enabled inactive service after confirmation. It keeps unit files and packages.</p>${button('Export cleanup helper','service-cleanup-export')}<p id="service-cleanup-status" role="status"></p><p>Run <code>bash ~/Downloads/service-cleanup.sh user</code> or <code>bash ~/Downloads/service-cleanup.sh system</code> for an audit. The helper prints the next steps; system changes require sudo in your terminal.</p></details><div class="module-columns"><div id="services-list" class="panel module-panel"></div><section class="panel module-panel"><h3 id="service-title">Select a service</h3><div class="button-row" id="service-actions"></div><pre id="service-properties" class="output"></pre><h3>Recent logs</h3><pre id="service-logs" class="output"></pre></section></div></section>
  <section id="inventory-view" class="view"><div class="module-heading"><div><p class="eyebrow">Local machine</p><h2>System inventory</h2><p>OS, hardware, storage, and tool versions. Report includes mount paths; inspect it before sharing.</p></div><div class="button-row">${button('Refresh','inventory-refresh')}${button('Export displayed report','inventory-export')}</div></div><p id="inventory-status" role="status"></p><div id="inventory-panels" class="module-columns"></div></section>`);
  $('#backup-view').insertAdjacentHTML('beforeend', `<section class="panel module-panel"><div class="panel-heading"><div><h3>Backup schedules & user timers</h3><p class="settings-help">Installed and loaded user timers are shown so you can spot duplicate backup schedules. Times use your system timezone.</p></div>${button('Refresh timers','timers-refresh')}</div><p id="timers-status" role="status"></p><div id="timers-list"></div><details><summary>Create or edit Command Center’s backup schedule</summary><p class="settings-help">Runs the personal backup helper configured in Settings. It must work unattended. Existing timers are kept. The user service manager must be running; missed runs catch up when it resumes.</p><form id="schedule-form" class="stack-form"><label>Frequency<select id="schedule-frequency"><option value="daily">Daily</option><option value="weekly">Weekly · Sunday</option><option value="hourly">Hourly</option></select></label><div class="button-row"><label>Hour<input id="schedule-hour" type="number" min="0" max="23" value="3" required></label><label>Minute<input id="schedule-minute" type="number" min="0" max="59" value="0" required></label></div><button class="primary-button" type="submit">Review & save schedule</button></form></details></section>`);
  let serviceRows=[], serviceVersion=0, detailVersion=0, serviceBusy=false,timerBusy=false, inventoryBusy=false, report=null,scheduleDirty=false;
  const requireDesktop=()=>{if(!state.desktop)throw new Error('Open the desktop app to inspect this system.');};
  function serviceList(){
    const rows=filterServices(serviceRows,$('#service-search').value,$('#service-state').value);
    $('#services-count').textContent=`Showing ${rows.length} of ${serviceRows.length} services`;
    $('#services-list').innerHTML=rows.map(row=>`<button type="button" class="unit-row" data-unit="${e(row.unit)}"><strong>${e(row.unit)}</strong><span>${e(row.active)} · ${e(row.sub)}</span><small>${e(row.description)}</small></button>`).join('')||'<p class="empty-state">No matching services.</p>';
    $('#services-list').querySelectorAll('[data-unit]').forEach(b=>b.addEventListener('click',()=>void details(b.dataset.unit)));
  }
  async function services(){
    const current=++serviceVersion; ++detailVersion;
    $('#service-actions').replaceChildren();$('#service-title').textContent='Select a service';$('#service-properties').textContent='';$('#service-logs').textContent='';
    serviceBusy=true;$('#services-refresh').disabled=true;$('#services-status').textContent='Loading services…';
    serviceRows=[];serviceList();
    try{requireDesktop();const data=await run('system_units',{scope:$('#service-scope').value,timers:false});if(current!==serviceVersion)return;serviceRows=data.units;serviceList();$('#services-status').textContent=`${serviceRows.length} services · Updated ${new Date(data.checkedAt).toLocaleTimeString()}`;}
    catch(error){if(current===serviceVersion)$('#services-status').textContent=`Services unavailable: ${error.message||error}`;}
    finally{if(current===serviceVersion){serviceBusy=false;$('#services-refresh').disabled=false;}}
  }
  async function details(unit){
    const current=++detailVersion,scope=$('#service-scope').value;
    $('#service-title').textContent=unit;$('#service-actions').replaceChildren();$('#service-properties').textContent='Loading…';$('#service-logs').textContent='';
    try{requireDesktop();const data=await run('unit_details',{scope,unit});if(current!==detailVersion)return;$('#service-properties').textContent=data.details;$('#service-logs').textContent=data.logs||data.logError||'No journal entries available.';
      if(scope==='user'){$('#service-actions').innerHTML=['start','stop','restart'].map(verb=>`<button type="button" class="secondary-button" data-service-op="${verb}">${verb}</button>`).join('');$('#service-actions').querySelectorAll('button').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true;try{await action({action:`service-${b.dataset.serviceOp}`,scope,unit});}catch(error){toast(String(error),true);}finally{b.disabled=false;}}));}
    }catch(error){if(current===detailVersion)$('#service-properties').textContent=`Could not inspect service: ${error.message||error}`;}
  }
  async function timers(){
    if(timerBusy)return;timerBusy=true;$('#timers-refresh').disabled=true;$('#timers-status').textContent='Reading timers…';
    try{requireDesktop();const data=await run('system_units',{scope:'user',timers:true});const current=scheduleFields(data.ownedCalendar);if(current&&!scheduleDirty){$('#schedule-frequency').value=current.schedule;$('#schedule-hour').value=current.hour;$('#schedule-minute').value=current.minute;$('#schedule-hour').disabled=current.schedule==='hourly';}$('#timers-list').innerHTML=data.units.map(row=>`<article class="timer-row"><div><strong>${e(row.Id)}</strong><p>Next: ${e(row.NextElapseUSecRealtime||'Not scheduled')} · Last: ${e(row.LastTriggerUSec||'Never recorded')}</p><p>${e(row.ActiveState)} · ${e(row.UnitFileState||'Unknown enable state')} · Service: ${e(row.Unit||'Unknown')} · Service result: ${e(row.service?.Result||'Not recorded')}${row.service?.ExecMainStatus?` (exit ${e(row.service.ExecMainStatus)})`:''}</p><small>${e(row.TimersCalendar||'')}</small></div><div class="button-row"><button type="button" class="secondary-button" data-timer="${e(row.Id)}" data-op="timer-enable">Enable</button><button type="button" class="secondary-button" data-timer="${e(row.Id)}" data-op="timer-disable">Disable</button><button type="button" class="text-button" data-timer-log="${e(row.Unit||row.Id)}">Service logs</button></div></article>`).join('')||'<p class="empty-state">No user timers. Configure a schedule below or enable your existing timer.</p>';$('#timers-status').textContent=`Updated ${new Date(data.checkedAt).toLocaleTimeString()}${data.limited?' · Showing first 100 timers':''}`;
      $('#timers-list').querySelectorAll('[data-timer]').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true;try{await action({action:b.dataset.op,unit:b.dataset.timer,scope:'user'});}catch(error){toast(String(error),true);}finally{b.disabled=false;}}));
      $('#timers-list').querySelectorAll('[data-timer-log]').forEach(b=>b.addEventListener('click',async()=>{$('#service-scope').value='user';switchView('services');await services();await details(b.dataset.timerLog);}));
    }catch(error){$('#timers-list').replaceChildren();$('#timers-status').textContent=`Timers unavailable: ${error.message||error}`;}
    finally{timerBusy=false;$('#timers-refresh').disabled=false;}
  }
  async function inventory(){
    if(inventoryBusy)return;inventoryBusy=true;$('#inventory-refresh').disabled=true;$('#inventory-export').disabled=true;$('#inventory-status').textContent='Collecting system inventory…';
    try{requireDesktop();report=await run('system_inventory');
      const output=v=>typeof v==='string'?v:v?.available?v.output:v?.error||'Unavailable';
      $('#inventory-panels').innerHTML=[['OS',report.os],['Kernel',report.kernel],['CPU',report.cpu],['Memory (kB)',report.memory],['Storage',report.storage],['Disk usage',report.diskUsage],...Object.entries(report.tools||{})].map(([name,value])=>`<section class="panel module-panel"><h3>${e(name)}</h3><pre class="output compact-output">${e(output(value))}</pre></section>`).join('');$('#inventory-status').textContent=`Collected ${new Date(report.checkedAt).toLocaleString()}`;
    }catch(error){report=null;$('#inventory-panels').replaceChildren();$('#inventory-status').textContent=`Inventory unavailable: ${error.message||error}`;}
    finally{inventoryBusy=false;$('#inventory-refresh').disabled=false;$('#inventory-export').disabled=!report;}
  }
  $('#service-state').addEventListener('change',serviceList);
  $('#service-cleanup-export').addEventListener('click',async()=>{const b=$('#service-cleanup-export');b.disabled=true;try{requireDesktop();const path=await run('export_service_cleanup');$('#service-cleanup-status').textContent=`Saved helper to ${path}. Exporting does not run it.`;}catch(error){$('#service-cleanup-status').textContent=`Export failed: ${error.message||error}`;}finally{b.disabled=false;}});
  $('#services-refresh').addEventListener('click',services);$('#service-scope').addEventListener('change',services);$('#service-search').addEventListener('input',serviceList);
  $('#timers-refresh').addEventListener('click',timers);$('#inventory-refresh').addEventListener('click',inventory);$('#inventory-export').disabled=true;
  $('#inventory-export').addEventListener('click',async()=>{if(!report)return;try{const path=await run('export_inventory',{report});$('#inventory-status').textContent=`Exported displayed inventory to ${path}`;}catch(error){$('#inventory-status').textContent=`Export failed: ${error.message||error}`;}});
  $('#schedule-form').addEventListener('input',()=>{scheduleDirty=true;});
  $('#schedule-form').addEventListener('change',()=>{scheduleDirty=true;});
  $('#schedule-frequency').addEventListener('change',()=>{$('#schedule-hour').disabled=$('#schedule-frequency').value==='hourly';});
  $('#schedule-form').addEventListener('submit',async event=>{event.preventDefault();const b=event.target.querySelector('button');b.disabled=true;try{await action({action:'schedule-save',schedule:$('#schedule-frequency').value,hour:Number($('#schedule-hour').value),minute:Number($('#schedule-minute').value)});}catch(error){$('#timers-status').textContent=`Schedule not saved: ${error.message||error}`;}finally{b.disabled=false;}});
  return {onView(view){if(view==='services'&&!serviceBusy)void services();if(view==='backup')void timers();if(view==='inventory'&&!report)void inventory();}, completed(job){if(job.action==='schedule-save'&&job.status==='succeeded')scheduleDirty=false;if((job.action||'').startsWith('service-')||(job.action||'').startsWith('timer-')||job.action==='schedule-save'){if(state.activeView==='services')void services();if(state.activeView==='backup')void timers();}}};
}
