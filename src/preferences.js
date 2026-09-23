export const integrationDefaults = Object.freeze({
  dotfilesPath: '', flakeProfile: '', backupScript: '', fullBackupScript: '', backupHealthScript: '',
  resticRepository: '', resticPasswordFile: '', wallet: '', walletFolder: '', walletEntry: '',
  ghosttySource: '', fastfetchSource: '', recoveryNotesPath: '', secretsDirectory: '', backupMaxHours: 24
});
export function normalizeIntegrations(value = {}) {
  const v = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(Object.entries(integrationDefaults).map(([key, fallback]) => [key,
    key === 'backupMaxHours' ? (Number.isInteger(v[key]) && v[key] >= 1 && v[key] <= 8760 ? v[key] : fallback)
    : typeof v[key] === 'string' && v[key].length <= 4096 && !/[\0\r\n]/.test(v[key]) ? v[key].trim() : fallback]));
}
export const defaults = Object.freeze({
  setupCompleted: false, customActions: [], integrations: integrationDefaults, displayName: 'Commander', editor: 'auto', terminal: 'auto', accent: 'cyan',
  density: 'comfortable', reducedMotion: false, startupPage: 'dashboard',
  theme: 'dark', textSize: 'normal', repoLayout: 'cards', repoSort: 'name', showPaths: true, showHero: true,
  refreshSeconds: 0, scanDepth: 3, roots: ['~/github/projects', '~/dotfiles']
});
export function normalize(input = {}) {
  const s = input && typeof input === 'object' ? input : {};
  const choice = (key, choices) => choices.includes(s[key]) ? s[key] : defaults[key];
  return {
    setupCompleted: s.setupCompleted === true,
    customActions: normalizeActions(s.customActions),
    integrations: normalizeIntegrations(s.integrations),
    theme: choice('theme', ['dark','light','system']), textSize: choice('textSize', ['normal','large']),
    repoLayout: choice('repoLayout', ['cards','list']), repoSort: choice('repoSort', ['name','name-desc','attention']),
    showPaths: s.showPaths !== false, showHero: s.showHero !== false,
    displayName: typeof s.displayName === 'string' && s.displayName.trim() ? [...s.displayName.trim()].slice(0,40).join('') : defaults.displayName,
    editor: choice('editor', ['auto','kate','nvim','code','codium','zed']),
    terminal: choice('terminal', ['auto','ghostty','konsole','gnome-terminal','kitty','alacritty','wezterm','foot']),
    accent: choice('accent', ['cyan','violet','green']), density: choice('density', ['comfortable','compact']),
    reducedMotion: s.reducedMotion === true, startupPage: choice('startupPage', ['dashboard', 'repositories', 'toolbox', 'terminal', 'sync', 'backup', 'config', 'health', 'activity', 'attention', 'services', 'inventory', 'operations', 'timeline', 'settings']),
    refreshSeconds: choice('refreshSeconds', [0,30,60,300]), scanDepth: choice('scanDepth', [1,2,3,4,5,6]),
    roots: Array.isArray(s.roots) ? [...new Set(s.roots.filter(r => typeof r === 'string' && r.length <= 4096 && !r.includes('\0') && /^(~$|~\/|\/)/.test(r.trim())).map(r => r.trim()))].slice(0,32) : [...defaults.roots]
  };
}
export function readBrowserSettings(storage) {
  try {
    const stored = storage.getItem('command-center.settings');
    if (stored) return normalize(JSON.parse(stored));
    const roots = storage.getItem('command-center.roots');
    return normalize(roots ? { roots: JSON.parse(roots) } : {});
  } catch { return normalize(); }
}

export function validateActions(actions) {
  if (!Array.isArray(actions) || actions.length > 20) throw new Error('Use up to 20 custom actions.');
  const ids = new Set();
  for (const a of actions) {
    if (!a || typeof a !== 'object' || typeof a.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(a.id) || ids.has(a.id)) throw new Error('Each custom action needs a unique ID.');
    ids.add(a.id);
    if (typeof a.name !== 'string' || !a.name.trim() || [...a.name].length > 80 || /[\0\r\n]/.test(a.name)) throw new Error('Action names must contain 1–80 characters.');
    if (typeof a.command !== 'string' || !a.command.trim() || new TextEncoder().encode(a.command).length > 4096 || a.command.includes('\0')) throw new Error('Commands must contain 1–4096 bytes.');
    if (typeof a.directory !== 'string' || !/^(~$|~\/|\/)/.test(a.directory) || a.directory.length > 4096 || /[\0\r\n]/.test(a.directory)) throw new Error('Use an absolute or ~/ working folder.');
    if (!['direct','fish','bash'].includes(a.shell) || !['embedded','external','background'].includes(a.mode)) throw new Error('Choose a supported shell and execution mode.');
  }
  return actions.map(({id,name,command,directory,shell,mode}) => ({id,name,command,directory,shell,mode}));
}
function normalizeActions(actions = []) {
  try { return validateActions(actions); } catch { return []; }
}
