import { mountDiff } from "./diff-view.js";
export function mountGitControls({ target, data, path, desktop, escapeHtml: e, action, refresh, toast, draft, invoke, jobs = [], openActivity }) {
  const files = data.files || [];
  const staged = file => file.staged ?? (file.status?.[0] !== ' ' && file.status?.[0] !== '?');
  target.innerHTML = `<section class="git-changes"><h3>Stage & commit</h3><p class="settings-help">Stage whole files, then review exactly what will be committed. Files with both staged and unstaged changes keep those states separately.</p>
    <div class="button-row"><button type="button" class="secondary-button" data-git="stage">Stage selected</button><button type="button" class="secondary-button" data-git="stage-all">Stage all</button><button type="button" class="secondary-button" data-git="unstage">Unstage selected</button><button type="button" class="secondary-button" id="refresh-git-details">Refresh details</button></div>
    <div class="git-file-list">${files.length ? files.map((file, index) => `<div class="git-file-row"><input aria-label="Select ${e(file.path)}" type="checkbox" data-git-file="${index}" ${file.conflict ? 'disabled' : ''}><code>${e(file.status)}</code><button type="button" class="text-button file-diff-button" data-file-diff="${index}">${e(file.original ? `${file.original} → ` : '')}${e(file.path)}</button><small>${file.conflict ? 'Conflict · resolve first' : [staged(file) ? 'Staged' : '', (file.unstaged ?? file.status?.[1] !== ' ') ? 'Unstaged' : ''].filter(Boolean).join(' + ')}</small></div>`).join('') : '<p class="empty-state">Working tree clean. No changes to stage.</p>'}</div>
    <h3>Review changes</h3><div id="diff-view"></div><details><summary>Complete staged diff for commit</summary><p class="settings-help">Binary files show a summary. Untracked files appear here after staging.</p><pre class="output compact-output" id="staged-diff">${e(data.stagedDiff || 'No staged diff.')}</pre></details>
    ${data.diffTruncated ? '<p role="alert">Diff exceeds the preview limit. Commit from your terminal after reviewing it.</p>' : ''}
    <section class="branch-controls"><h3>Branches</h3><p>Current: <strong>${e(data.branchRef?.replace('refs/heads/','') || 'Detached or no commits')}</strong></p><div class="button-row"><select id="switch-branch" aria-label="Local branch">${(data.branches || []).map(name=>`<option value="${e(name)}">${e(name)}</option>`).join('')}</select><button type="button" class="secondary-button" data-git="branch-switch">Switch branch</button></div><div class="button-row"><input id="new-branch" aria-label="New branch name" placeholder="feature/my-change" maxlength="200"><button type="button" class="secondary-button" data-git="branch-create">Create & switch</button></div><p class="settings-help">Commit or stash all changes first. New branches are local and need an upstream before Push.</p></section>
    <section class="branch-controls"><h3>Publish branch</h3><div class="button-row"><select id="publish-remote" aria-label="Remote for publishing">${(data.remotes||[]).map(remote=>`<option value="${e(remote)}">${e(remote)}</option>`).join('')}</select><button type="button" class="secondary-button" data-git="branch-publish">Review & publish branch</button></div><p class="settings-help">Sets the upstream for this branch. Publishes committed work only; no force push.</p></section>
    <section class="branch-controls"><h3>Stash unfinished work</h3><label>Stash message<input id="stash-message" maxlength="1000" placeholder="Work in progress"></label><label class="check-row"><input id="stash-untracked" type="checkbox">Include new (untracked) files</label><button type="button" class="secondary-button" data-git="stash-create">Review & stash</button><div class="button-row"><select id="stash-select" aria-label="Stash to restore">${(data.stashes||[]).map(stash=>`<option value="${e(stash.id)}">${e(stash.name)} · ${e(stash.subject)}</option>`).join('')}</select><button type="button" class="secondary-button" data-git="stash-apply">Review & restore stash</button></div><p class="settings-help">Restore requires a clean working tree. The stash is retained; conflicts must be resolved before continuing.</p></section>
    <form id="commit-form" class="stack-form"><label>Commit message<textarea id="commit-message" rows="3" maxlength="10000" placeholder="Describe what changed" required>${e(draft.message || '')}</textarea></label><button type="submit" class="primary-button" id="commit-staged">Review & commit</button></form>
    <p id="git-change-status" role="status">${desktop ? 'Commit saves locally. Use Push afterwards to publish.' : 'Browser preview · Staging and commits require the desktop app.'}</p><pre id="git-inline-output" class="output compact-output" hidden></pre><button type="button" class="text-button" id="git-open-activity">View Activity</button></section>`;
  const $ = selector => target.querySelector(selector);
  let busy = false;
  const busyHere = list => list.some(job => job.status === 'running' && job.cwd === path);
  let running = busyHere(jobs);
  let recent = jobs.find(job => job.cwd === path);
  const status = $('#git-change-status');
  if (recent) {
    status.textContent = `${recent.title}: ${recent.status}${recent.exitCode != null ? ` (exit ${recent.exitCode})` : ''}`;
    if (recent.output) { $('#git-inline-output').hidden = false; $('#git-inline-output').textContent = recent.output.slice(-8000); }
  }
  $('#git-open-activity').addEventListener('click', () => openActivity?.(recent?.id));
  const diff = mountDiff({target:$('#diff-view'),data,path,invoke,desktop});
  target.querySelectorAll('[data-file-diff]').forEach(button=>button.addEventListener('click',()=>diff.select(files[Number(button.dataset.fileDiff)])));
  const selected = () => [...target.querySelectorAll('[data-git-file]:checked')].map(input => files[Number(input.dataset.gitFile)]);
  function update() {
    const chosen = selected();
    $('[data-git="stage"]').disabled = busy || running || !desktop || !chosen.length;
    $('[data-git="stage-all"]').disabled = busy || running || !desktop || !files.length || data.conflicts;
    $('[data-git="unstage"]').disabled = busy || running || !desktop || !chosen.length || chosen.some(file => !staged(file));
    $('#commit-staged').disabled = busy || running || !desktop || !files.some(staged) || data.conflicts || data.diffTruncated || !$('#commit-message').value.trim();
    $('#refresh-git-details').disabled = busy;
    $('[data-git="stash-create"]').disabled = busy || running || !desktop || !data.head || !files.length || data.conflicts;
    $('[data-git="stash-apply"]').disabled = busy || running || !desktop || files.length>0 || !$('#stash-select').value;
    $('[data-git="branch-publish"]').disabled = busy || running || !desktop || !data.head || !data.branchRef || !$('#publish-remote').value;
    $('[data-git="branch-switch"]').disabled = busy || running || !desktop || files.length > 0 || !data.head || !$('#switch-branch').value;
    $('[data-git="branch-create"]').disabled = busy || running || !desktop || files.length > 0 || !data.head || !$('#new-branch').value.trim();
  }
  $('#new-branch').addEventListener('input', update);
  $('#commit-message').addEventListener('input', () => { draft.message = $('#commit-message').value; update(); });
  target.querySelectorAll('[data-git-file]').forEach(input => input.addEventListener('change', update));
  $('#refresh-git-details').addEventListener('click', () => refresh().catch(error => toast(String(error), true)));
  async function perform(kind) {
    if (busy || running || !desktop) return;
    busy = true; update();
    try {
      const id = await action({ action: kind, path, files: selected().map(file => file.path), remote: $('#publish-remote').value, stashId: $('#stash-select').value, include: $('#stash-untracked').checked ? 'untracked' : '', branchName: kind === 'branch-create' ? $('#new-branch').value.trim() : $('#switch-branch').value, message: kind === 'stash-create' ? $('#stash-message').value : draft.message || '', indexTree: data.indexTree || '', expectedHead: data.head || '', branchRef: data.branchRef || '' }, () => {});
      running = Boolean(id);
      $('#git-change-status').textContent = id ? 'Operation started. Completion and errors appear in Activity; details refresh when it finishes.' : 'Cancelled. No operation started.';
    } catch (error) {
      $('#git-change-status').textContent = `Could not start: ${error.message || error}`;
    } finally { busy = false; update(); }
  }
  target.querySelectorAll('[data-git]').forEach(button => button.addEventListener('click', () => perform(button.dataset.git)));
  $('#commit-form').addEventListener('submit', event => { event.preventDefault(); if (!$('#commit-staged').disabled) void perform('commit'); });
  update();
  return { updateJobs(next) {
    running = busyHere(next);
    recent = next.find(job => job.cwd === path);
    update();
  } };
}
