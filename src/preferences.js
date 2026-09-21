export const defaults = Object.freeze({
  displayName: 'Commander', editor: 'auto', terminal: 'auto', accent: 'cyan',
  density: 'comfortable', reducedMotion: false, startupPage: 'dashboard',
  theme: 'dark', textSize: 'normal', repoLayout: 'cards', repoSort: 'name', showPaths: true, showHero: true,
  refreshSeconds: 0, scanDepth: 3, roots: ['~/github/projects', '~/dotfiles']
});
export function normalize(input = {}) {
  const s = input && typeof input === 'object' ? input : {};
  const choice = (key, choices) => choices.includes(s[key]) ? s[key] : defaults[key];
  return {
    theme: choice('theme', ['dark','light','system']), textSize: choice('textSize', ['normal','large']),
    repoLayout: choice('repoLayout', ['cards','list']), repoSort: choice('repoSort', ['name','name-desc','attention']),
    showPaths: s.showPaths !== false, showHero: s.showHero !== false,
    displayName: typeof s.displayName === 'string' && s.displayName.trim() ? [...s.displayName.trim()].slice(0,40).join('') : defaults.displayName,
    editor: choice('editor', ['auto','kate','nvim','code','codium','zed']),
    terminal: choice('terminal', ['auto','ghostty','konsole','gnome-terminal','kitty','alacritty','wezterm','foot']),
    accent: choice('accent', ['cyan','violet','green']), density: choice('density', ['comfortable','compact']),
    reducedMotion: s.reducedMotion === true, startupPage: choice('startupPage', ['dashboard','repositories','settings']),
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
