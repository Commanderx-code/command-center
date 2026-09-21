export function setupSettingsTools({ invoke, readIntegrations }) {
  const $ = (s) => document.querySelector(s);
  const search = $('#settings-search');
  const sections = [...document.querySelectorAll('.settings-section')];
  function filter() {
    const words = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let count = 0;
    for (const section of sections) {
      const labels = [...section.querySelectorAll('label')].map(el => {
        const copy = el.cloneNode(true);
        copy.querySelectorAll('input, select, textarea').forEach(control => control.remove());
        return copy.textContent;
      }).join(' ');
      const text = `${section.querySelector('.section-title').textContent} ${labels}`.toLowerCase();
      section.hidden = !words.every(word => text.includes(word));
      if (!section.hidden) count++;
    }
    $('#settings-no-results').hidden = count !== 0;
    $('#settings-search-status').textContent = words.length ? `${count} matching sections` : '';
    $('#clear-settings-search').disabled = !search.value;
  }
  search.addEventListener('input', filter);
  $('#clear-settings-search').addEventListener('click', () => { search.value = ''; filter(); search.focus(); });
  search.addEventListener('keydown', event => { if (event.key === 'Escape') { search.value = ''; filter(); } });
  document.querySelectorAll('.settings-links a').forEach(link => link.addEventListener('click', () => { search.value = ''; filter(); }));
  filter();

  let generation = 0;
  const status = $('#integration-check-status');
  const results = $('#integration-check-results');
  const button = $('#check-integrations');
  function invalidate() {
    generation++;
    results.replaceChildren();
    status.textContent = 'Values changed. Check availability again for this draft.';
  }
  $('.integration-section').addEventListener('input', invalidate);
  // Detect, reset and discard can update values without an input event on a field.
  $('#preferences-form').addEventListener('input', event => { if (event.target === event.currentTarget) invalidate(); });
  for (const id of ['reset-preferences', 'discard-preferences']) $(`#${id}`).addEventListener('click', invalidate);
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    if (!invoke) { status.textContent = 'Open the desktop app to check local paths and installed tools.'; return; }
    const current = ++generation;
    button.disabled = true;
    results.replaceChildren();
    results.setAttribute('aria-busy', 'true');
    status.textContent = 'Checking draft paths and installed tools…';
    try {
      const checks = await invoke('check_integrations', { integrations: readIntegrations() });
      if (current !== generation) return;
      for (const check of checks) {
        const row = document.createElement('p');
        row.className = 'readiness-row';
        const label = document.createElement('strong');
        label.textContent = check.label;
        const detail = document.createElement('span');
        detail.textContent = check.message;
        detail.className = `integration-result ${check.status}`;
        row.append(label, detail);
        results.append(row);
      }
      status.textContent = 'Check complete for this draft. Remote access and credentials were not tested.';
    } catch (error) {
      if (current === generation) status.textContent = `Check failed: ${error.message || error}. Review the fields and try again.`;
    } finally {
      button.disabled = false;
      results.setAttribute('aria-busy', 'false');
    }
  });
}
