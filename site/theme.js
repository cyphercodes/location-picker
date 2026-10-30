// Header theme toggle: follows the system until clicked, then pins light or dark (remembered in localStorage).
// The inline snippet in each page's <head> applies the remembered choice before first paint. /pick/ does not use this.
const KEY = 'location-picker-site:theme';
const root = document.documentElement;

const systemDark = () => matchMedia('(prefers-color-scheme: dark)').matches;
const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : systemDark());

export function setUpThemeToggle() {
  const button = document.getElementById('theme-toggle');
  if (!button) return;
  const sync = () => {
    button.setAttribute('aria-pressed', String(isDark()));
  };
  sync();
  button.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    root.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Storage can be blocked; the choice then lasts for this page view.
    }
    sync();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', sync);
}
