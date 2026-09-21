export function renderDiff(element, text = '') {
  const fragment = document.createDocumentFragment();
  for (const line of (text || 'No changes in this view.').split('\n')) {
    const span = document.createElement('span');
    span.className = 'diff-line ' + (line.startsWith('@@') ? 'diff-hunk' : line.startsWith('+') && !line.startsWith('+++') ? 'diff-add' : line.startsWith('-') && !line.startsWith('---') ? 'diff-remove' : '');
    span.textContent = line + '\n';
    fragment.append(span);
  }
  element.replaceChildren(fragment);
}
export function mountDiff({ target, data, path, invoke, desktop }) {
  let staged = true, selected = '', version = 0;
  const $ = s => target.querySelector(s);
  target.insertAdjacentHTML('beforeend', `<div class="diff-toolbar button-row"><button type="button" class="secondary-button" data-diff-phase="staged" aria-pressed="true">Staged</button><button type="button" class="secondary-button" data-diff-phase="unstaged" aria-pressed="false">Unstaged</button><button type="button" class="text-button" id="diff-all">All tracked files</button><span id="diff-label" role="status"></span></div><pre class="output diff-output" id="file-diff"></pre>`);
  async function show() {
    const request=++version;
    target.querySelectorAll('[data-diff-phase]').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.diffPhase==='staged')===staged)));
    $('#diff-label').textContent=`${selected || 'All tracked files'} · ${staged?'Staged':'Unstaged'}`;
    const output=$('#file-diff');output.setAttribute('aria-busy','true');
    try {
      const result=selected && desktop ? await invoke('repository_diff',{path,file:selected,staged}) : {text:staged?data.stagedDiff:data.unstagedDiff,truncated:staged?data.diffTruncated:data.unstagedTruncated};
      if(request!==version || !target.isConnected)return;
      renderDiff(output,result.text || (selected && !desktop?'Sample diff · Desktop app required for individual files.':''));
      if(result.truncated)$('#diff-label').textContent+=' · Preview truncated: review the complete file in your editor';
    } catch(error) { if(request===version) output.textContent=`Could not load diff: ${error}. Refresh Details and retry.`; }
    finally {if(request===version)output.setAttribute('aria-busy','false');}
  }
  target.querySelectorAll('[data-diff-phase]').forEach(b=>b.addEventListener('click',()=>{staged=b.dataset.diffPhase==='staged';void show();}));
  $('#diff-all').addEventListener('click',()=>{selected='';void show();});
  void show();
  return { select(file) {selected=file.path; staged=Boolean(file.staged);void show();} };
}
