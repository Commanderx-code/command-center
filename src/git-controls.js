export function mountGitControls({ target, data, path, desktop, escapeHtml: e, action, refresh, toast, draft }) {
  const files = data.files || [];
  const staged = file => file.staged ?? (file.status?.[0] !== ' ' && file.status?.[0] !== '?');
  target.innerHTML = `<section class="git-changes"><h3>Stage & commit</h3><p class="settings-help">Stage whole files, then review exactly what will be committed. Files with both staged and unstaged changes keep those states separately.</p>
    <div class="button-row"><button type="button" class="secondary-button" data-git="stage">Stage selected</button><button type="button" class="secondary-button" data-git="stage-all">Stage all</button><button type="button" class="secondary-button" data-git="unstage">Unstage selected</button><button type="button" class="secondary-button" id="refresh-git-details">Refresh details</button></div>
    <div class="git-file-list">${files.length ? files.map((file, index) => `<label class="git-file-row"><input type="checkbox" data-git-file="${index}" ${file.conflict ? 'disabled' : ''}><code>${e(file.status)}</code><span>${e(file.original ? `${file.original} → ` : '')}${e(file.path)}</span><small>${file.conflict ? 'Conflict · resolve first' : [staged(file) ? 'Staged' : '', (file.unstaged ?? file.status?.[1] !== ' ') ? 'Unstaged' : ''].filter(Boolean).join(' + ')}</small></label>`).join('') : '<p class="empty-state">Working tree clean. No changes to stage.</p>'}</div>
    <h3>Staged diff</h3><p class="settings-help">Binary files show a summary. Untracked files appear here after staging.</p><pre class="output compact-output" id="staged-diff">${e(data.stagedDiff || 'No staged diff.')}</pre>
    ${data.diffTruncated ? '<p role="alert">Diff exceeds the preview limit. Commit from your terminal after reviewing it.</p>' : ''}
    <form id="commit-form" class="stack-form"><label>Commit message<textarea id="commit-message" rows="3" maxlength="10000" placeholder="Describe what changed" required>${e(draft.message || '')}</textarea></label><button type="submit" class="primary-button" id="commit-staged">Review & commit</button></form>
    <p id="git-change-status" role="status">${desktop ? 'Commit saves locally. Use Push afterwards to publish.' : 'Browser preview · Staging and commits require the desktop app.'}</p></section>`;
  const $ = selector => target.querySelector(selector);
  let busy = false;
  const selected = () => [...target.querySelectorAll('[data-git-file]:checked')].map(input => files[Number(input.dataset.gitFile)]);
  function update() {
    const chosen = selected();
    $('[data-git="stage"]').disabled = busy || !desktop || !chosen.length;
    $('[data-git="stage-all"]').disabled = busy || !desktop || !files.length || data.conflicts;
    $('[data-git="unstage"]').disabled = busy || !desktop || !chosen.length || chosen.some(file => !staged(file));
    $('#commit-staged').disabled = busy || !desktop || !files.some(staged) || data.conflicts || data.diffTruncated || !$('#commit-message').value.trim();
    $('#refresh-git-details').disabled = busy;
  }
  $('#commit-message').addEventListener('input', () => { draft.message = $('#commit-message').value; update(); });
  target.querySelectorAll('[data-git-file]').forEach(input => input.addEventListener('change', update));
  $('#refresh-git-details').addEventListener('click', () => refresh().catch(error => toast(String(error), true)));
  async function perform(kind) {
    if (busy || !desktop) return;
    busy = true; update();
    try {
      const id = await action({ action: kind, path, files: selected().map(file => file.path), message: draft.message || '', indexTree: data.indexTree || '', expectedHead: data.head || '', branchRef: data.branchRef || '' }, () => {});
      $('#git-change-status').textContent = id ? 'Operation started. Completion and errors appear in Activity; details refresh when it finishes.' : 'Cancelled. No operation started.';
    } catch (error) {
      $('#git-change-status').textContent = `Could not start: ${error.message || error}`;
    } finally { busy = false; update(); }
  }
  target.querySelectorAll('[data-git]').forEach(button => button.addEventListener('click', () => perform(button.dataset.git)));
  $('#commit-form').addEventListener('submit', event => { event.preventDefault(); if (!$('#commit-staged').disabled) void perform('commit'); });
  update();
}
