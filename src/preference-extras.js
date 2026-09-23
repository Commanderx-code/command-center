import { normalize, validateActions, defaults } from './preferences.js';
export function parseSettingsExport(text) {
  if (text.length > 1_000_000) throw new Error('Settings file exceeds 1 MB.');
  const value = JSON.parse(text);
  if (value?.format !== 'command-center-settings' || value.version !== 1 || !value.settings || typeof value.settings !== 'object' || Array.isArray(value.settings)) throw new Error('Choose a Command Center settings export (version 1).');
  const settings = value.settings;
  const normalized = normalize(settings);
  for (const key of Object.keys(settings)) {
    if (!(key in defaults)) throw new Error(`Unsupported setting: ${key}`);
    if (key === 'customActions') { validateActions(settings[key]); continue; }
    if (key === 'integrations') {
      if (!settings[key] || typeof settings[key] !== 'object' || Array.isArray(settings[key])) throw new Error('Invalid integrations.');
      for (const [field, val] of Object.entries(settings[key])) {
        if (!(field in normalized.integrations) || normalized.integrations[field] !== val) throw new Error(`Invalid integration: ${field}`);
      }
    } else if (JSON.stringify(settings[key]) !== JSON.stringify(normalized[key])) throw new Error(`Invalid setting: ${key}`);
  }
  return normalized;
}
export function importDraft(current, imported, includeMachine) {
  const draft = normalize({ ...imported, ...(!includeMachine ? Object.fromEntries(['roots','editor','terminal','scanDepth','integrations','customActions'].map(k => [k,current[k]])) : {}) });
  // This helper runs automatically, so importing settings must not authorize it.
  draft.integrations.backupHealthScript = normalize(current).integrations.backupHealthScript;
  return draft;
}
export function createPreferenceExtras({ state, $, escapeHtml: e, draftPreferences, populatePreferences, updateDraftStatus, action, toast, invoke }) {
  let actions = [];
  const form = $('#preferences-form');
  $('.settings-layout').insertAdjacentHTML('beforeend', `<section id="section-custom" class="panel settings-section"><div class="section-title"><span>06</span><div><h3>Custom quick actions</h3><p>Pin commands to the dashboard. Every run is reviewed first.</p></div></div><div id="custom-actions-editor"></div><button type="button" class="secondary-button" id="add-custom-action">Add action</button><p class="settings-help">Direct commands use quoted arguments without shell expansion. Choose Fish for functions such as full-upgrade. Terminal modes support interactive prompts. Keep passwords out of saved commands and exports.</p></section>`);
  $('.settings-links').insertAdjacentHTML('beforeend','<a href="#section-custom">Custom actions</a>');
  $('.settings-intro').insertAdjacentHTML('afterend', `<div class="button-row settings-transfer"><button type="button" id="export-settings" class="secondary-button">Export saved settings</button><button type="button" id="import-settings" class="secondary-button">Import settings…</button><input type="file" id="import-settings-file" accept=".json,application/json" hidden><span id="transfer-status" role="status"></span></div>`);
  document.body.insertAdjacentHTML('beforeend', `<dialog id="import-settings-dialog" class="review-dialog"><h2>Review settings import</h2><p>Your current preferences stay saved until you apply this draft and Save settings.</p><label class="check-row"><input type="checkbox" id="import-machine">Include machine paths, applications, integrations, and custom commands</label><p class="settings-help">Leave unchecked to keep this machine’s connections and commands. The automatic backup health helper always stays local; configure it separately in Settings.</p><pre id="import-preview" class="output"></pre><div class="button-row"><button type="button" id="cancel-import" class="secondary-button">Cancel</button><button type="button" id="apply-import" class="primary-button">Apply to draft</button></div></dialog>`);
  $('#dashboard-view').insertAdjacentHTML('beforeend', '<section class="panel module-panel"><div class="panel-heading"><h3>Your quick actions</h3><button type="button" class="secondary-button" id="manage-custom">Manage actions</button></div><div id="custom-action-buttons" class="button-row"></div></section>');
  function changed() { updateDraftStatus(); }
  function read() {
    return validateActions(actions.map((a,index) => Object.fromEntries(['id','name','command','directory','shell','mode'].map(k => [k, k === 'id' ? a.id : $(`[data-action-index="${index}"] [data-field="${k}"]`).value]))));
  }
  function capture() {
    actions = actions.map((a,index) => ({...a,...Object.fromEntries(['name','command','directory','shell','mode'].map(k=>[k,$(`[data-action-index="${index}"] [data-field="${k}"]`).value]))}));
  }
  function render() {
    $('#custom-actions-editor').innerHTML = actions.map((a,index)=>`<fieldset class="custom-action-editor" data-action-index="${index}"><legend>Action ${index+1}</legend><label>Name<input data-field="name" maxlength="80" value="${e(a.name)}"></label><label>Command<textarea data-field="command" rows="2" spellcheck="false">${e(a.command)}</textarea></label><label>Working folder<input data-field="directory" value="${e(a.directory)}"></label><label>Shell<select data-field="shell">${['direct','fish','bash'].map(v=>`<option ${v===a.shell?'selected':''} value="${v}">${v}</option>`).join('')}</select></label><label>Run in<select data-field="mode">${['embedded','external','background'].map(v=>`<option ${v===a.mode?'selected':''} value="${v}">${v}</option>`).join('')}</select></label><button type="button" class="text-button" data-remove="${index}">Remove action</button></fieldset>`).join('') || '<p class="settings-help">No custom actions yet.</p>';
    $('#add-custom-action').disabled = actions.length >= 20;
    $('#custom-actions-editor').querySelectorAll('[data-remove]').forEach(button=>button.addEventListener('click',()=>{capture();actions.splice(Number(button.dataset.remove),1);render();changed();}));
  }
  $('#add-custom-action').addEventListener('click',()=>{capture();if(actions.length>=20)return;actions.push({id:`action-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,name:'New action',command:'',directory:'~',shell:'direct',mode:'embedded'});render();changed();});
  function renderQuick() {
    $('#custom-action-buttons').innerHTML = state.settings.customActions.map(a=>`<button type="button" class="secondary-button" data-custom-run="${e(a.id)}">${e(a.name)}</button>`).join('') || '<p class="settings-help">Add your commands in Settings → Custom actions.</p>';
    $('#custom-action-buttons').querySelectorAll('[data-custom-run]').forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;try{await action({action:'custom',customId:button.dataset.customRun});}catch(error){toast(String(error),true);}finally{button.disabled=false;}}));
  }
  $('#manage-custom').addEventListener('click',()=>{document.querySelector('[data-view="settings"]').click(); $('#settings-search').value='';$('#settings-search').dispatchEvent(new Event('input')); $('#section-custom').scrollIntoView?.({block:'start'});});
  $('#export-settings').addEventListener('click',async()=>{
    if (state.desktop) {
      try { const path = await invoke('export_settings'); $('#transfer-status').textContent=`Exported saved settings to ${path}`; }
      catch(error) { $('#transfer-status').textContent=`Export failed: ${error.message || error}`; }
      return;
    }
    const blob = new Blob([JSON.stringify({format:'command-center-settings',version:1,settings:state.settings},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='command-center-settings.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    $('#transfer-status').textContent='Exported saved preferences, including configured paths and commands.';
  });
  $('#import-settings').addEventListener('click',()=>$('#import-settings-file').click());
  let imported, before;
  function preview() { $('#import-preview').textContent=JSON.stringify(importDraft(before,imported,$('#import-machine').checked),null,2); }
  $('#import-settings-file').addEventListener('change',async event=>{
    try {const file=event.target.files[0];if(!file)return;if(file.size>1_000_000)throw new Error('Settings file exceeds 1 MB.'); imported=parseSettingsExport(await file.text());before=draftPreferences();$('#import-machine').checked=false;preview();$('#import-settings-dialog').showModal();}
    catch(error){$('#transfer-status').textContent=`Import failed: ${error.message}`;}finally{event.target.value='';}
  });
  $('#import-machine').addEventListener('change',preview);
  $('#cancel-import').addEventListener('click',()=>$('#import-settings-dialog').close());
  $('#apply-import').addEventListener('click',()=>{populatePreferences(importDraft(before,imported,$('#import-machine').checked));updateDraftStatus();form.dispatchEvent(new Event('input'));$('#import-settings-dialog').close();$('#transfer-status').textContent='Imported as an unsaved draft. Review, then Save settings or Discard changes.';});
  return {read,populate(value){actions=(value || []).map(action => ({...action}));render();},renderQuick};
}
