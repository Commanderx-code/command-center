export function needsAttention(repo) {
  return Boolean(repo.status_error || repo.dirty || repo.ahead || repo.behind);
}
export function statusParts(repo) {
  const parts = [];
  if (repo.status_error) parts.push({tone:'warning', text:'Status unavailable'});
  else parts.push({tone:repo.dirty ? 'warning':'success', text:repo.dirty ? `${repo.modified_files} changed`:'Working tree clean'});
  if (repo.ahead) parts.push({tone:'warning', text:`↑ ${repo.ahead} ahead`});
  if (repo.behind) parts.push({tone:'warning', text:`↓ ${repo.behind} behind`});
  if (repo.has_upstream === false) parts.push({tone:'muted', text:'No tracking branch'});
  return parts;
}
export function selectRepositories(repos, query, filter, sort) {
  const search = query.trim().toLowerCase();
  return repos.filter(r => `${r.name} ${r.path} ${r.branch}`.toLowerCase().includes(search))
    .filter(r => filter === 'all' || (filter === 'dirty' && needsAttention(r)) ||
      (filter === 'clean' && !needsAttention(r)) || (filter === 'ahead' && r.ahead > 0) ||
      (filter === 'behind' && r.behind > 0))
    .sort((a,b) => {
      const byName = a.name.localeCompare(b.name, undefined, {numeric:true,sensitivity:'base'}) || a.path.localeCompare(b.path);
      if (sort === 'name-desc') return -byName;
      if (sort === 'attention') return Number(needsAttention(b)) - Number(needsAttention(a)) || byName;
      return byName;
    });
}
