export function releaseStatus(installed, tag) {
  const parse=v=>/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(v||'')?v.split('.').map(BigInt):null;
  const current=parse(installed),next=parse(tag?.replace(/^v/,''));
  if(!current||!next)return {label:'Version format not supported; review releases manually.',updatable:false};
  for(let i=0;i<3;i++)if(current[i]!==next[i])return next[i]>current[i]?{label:`Update available: ${tag}`,updatable:true}:{label:'Installed version is newer than the latest published release.',updatable:false};
  return {label:'You have the latest published version.',updatable:false};
}
export function createReleases({$,run,state}) {
  $('#settings-view').insertAdjacentHTML('beforeend',`<section class="panel module-panel"><h3>About & updates</h3><p id="installed-version">Open the desktop app to read its version.</p><div class="button-row"><button type="button" class="secondary-button" id="release-check">Check for releases</button><button type="button" class="secondary-button" id="release-page">Open releases</button><button type="button" class="secondary-button" id="update-export">Export source updater</button></div><p id="release-status" role="status">Checks GitHub only when requested. Updating requires a terminal and the Linux build dependencies.</p><pre class="output compact-output" id="release-notes"></pre><pre class="output compact-output" id="release-command"></pre><p id="update-export-status" role="status"></p><p>Close the app before installing. The updater builds a selected release in a temporary checkout and saves the previous locally installed binary. It does not modify your project checkout or settings.</p></section>`);
  for(const id of ['release-check','release-page','update-export'])$('#'+id).disabled=!state.desktop;
  if(state.desktop)void run('release_info').then(data=>{$('#installed-version').textContent=`Installed version: ${data.installed}`;}).catch(()=>{$('#installed-version').textContent='Installed version unavailable.';});
  $('#release-check').addEventListener('click',async()=>{
    const b=$('#release-check');b.disabled=true;$('#release-status').textContent='Checking GitHub…';$('#release-notes').textContent='';$('#release-command').textContent='';
    try{const data=await run('check_release');$('#installed-version').textContent=`Installed version: ${data.installed}`;
      if(!data.release){$('#release-status').textContent='No published stable release found (or repository unavailable).';return;}
      const status=releaseStatus(data.installed,data.release.tag);$('#release-status').textContent=status.label;$('#release-notes').textContent=data.release.notes||'No release notes.';
      if(status.updatable&&/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(data.release.tag))$('#release-command').textContent=`Export the updater, then run:\nbash ~/Downloads/update-desktop.sh ${data.release.tag}`;
    }catch(error){$('#release-status').textContent=`Could not check releases: ${error.message||error}`;}finally{b.disabled=false;}
  });
  $('#release-page').addEventListener('click',()=>void run('open_releases').catch(error=>{$('#release-status').textContent=String(error);}));
  $('#update-export').addEventListener('click',async()=>{const b=$('#update-export');b.disabled=true;try{const path=await run('export_update_helper');$('#update-export-status').textContent=`Saved to ${path}. Exporting does not run the updater.`;}catch(error){$('#update-export-status').textContent=String(error);}finally{b.disabled=false;}});
}
