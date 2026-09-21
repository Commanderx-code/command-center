import { backupState } from './feature-model.js';
export function backupOverview(health, integrations, now = Date.now()) {
  const report = health?.backup;
  const local = /^(\/|~\/)/.test(integrations.resticRepository || '');
  const mounted = report?.available ? report.data?.drive_mounted : undefined;
  const drive = !integrations.resticRepository ? 'Not configured' : !local ? 'Remote · connection not checked' : mounted === true ? 'Connected (helper report)' : mounted === false ? 'Disconnected (helper report)' : 'Connection unknown';
  const date = Date.parse(report?.data?.jobs?.backup?.completed_at);
  const state = backupState(health, integrations.backupMaxHours, now);
  const helpers = health?.backupHelpers || {};
  const blocked = local && mounted === false;
  return {drive, state, completedAt: Number.isFinite(date) && report?.available ? date : null,
    personal: helpers.personal === true && !blocked, full: helpers.full === true && !blocked,
    reason: blocked ? 'Connect the backup drive, then refresh health.' : helpers.personal !== true ? 'Configure an executable personal backup helper in Settings.' : 'Review the backup command before starting.'};
}
export function renderBackupOverview({target, health, integrations, escapeHtml:e, desktop}) {
  const data=backupOverview(health,integrations);
  target.innerHTML=`<div class="backup-overview-grid"><article><small>Backup location</small><strong>${e(desktop?data.drive:'Desktop app required')}</strong><p>${e(integrations.resticRepository || 'Set a Restic repository in Settings')}</p></article><article><small>Last successful backup</small><strong>${e(data.completedAt?new Date(data.completedAt).toLocaleString():'No successful record')}</strong><p>${e(data.state.detail)}</p></article><article><small>Next step</small><strong>${e(data.reason)}</strong><p>${health?.checkedAt?`Checked ${e(new Date(health.checkedAt).toLocaleString())}`:'Refresh health to check your setup.'}</p></article></div><p class="settings-help">Drive state comes from your backup health helper. A connected drive does not verify repository integrity or credentials.</p>`;
  for (const [action,enabled] of [['backup',data.personal],['backup-full',data.full]]) {
    const button=document.querySelector(`#backup-view [data-job="${action}"]`);
    if(button){button.disabled=!desktop || !enabled;button.title=enabled?'':data.reason;}
  }
}
