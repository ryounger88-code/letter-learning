// Install hint (parent mode only, never kid mode). Why it matters: in a browser tab, Safari
// deletes a site's saved data after 7 days of use without visiting it. Installed to the Home
// Screen, the app gets its own storage that isn't cleared that way.

let deferred = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; });
}

export function isStandalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
}

export function installInfo() {
  const ua = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  let howTo;
  if (ios) howTo = 'In Safari, tap the Share button (the square with an arrow), then "Add to Home Screen", then "Add". Open Letter Lab from the new icon from then on.';
  else if (android) howTo = 'In Chrome, open the ⋮ menu and choose "Install app" or "Add to Home screen".';
  else howTo = 'In Chrome or Edge, click the install icon at the right end of the address bar.';
  return {
    standalone: isStandalone(),
    howTo,
    canPrompt: !!deferred,
    async prompt() { if (!deferred) return; deferred.prompt(); try { await deferred.userChoice; } catch {} deferred = null; },
  };
}
