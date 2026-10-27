import React from 'react';
import { createRoot } from 'react-dom/client';
import AppBar from './AppBar.jsx';

/* Point d'entrée autonome : aucune application n'est modifiée.
 *
 * Le script est injecté (ou référencé) une seule fois par application, avec
 * la MÊME ligne et AUCUNE option :
 *
 *   <script defer src="/assets/hermes-footer.js?v=<version>" data-hermes-footer></script>
 *
 * Tout le reste vient de /assets/hermes-footer.json (thème, liens, marque) :
 * une seule configuration pour tout le parc. Le composant est monté dans un
 * shadow root, donc les feuilles des applications ne peuvent pas le déformer.
 */

const DEFAULT_CONFIG = {
  theme: 'dark',
  brand: { label: 'Hercules IT' },
  portal: 'https://hercules-it.fr/auth/if/user/',
  logout: 'https://hercules-it.fr/auth/application/o/rdv/end-session/?next=https%3A%2F%2Fhercules-it.fr%2F',
  appsApi: 'https://hercules-it.fr/auth/api/v3/core/applications/?page_size=50',
};

const script = document.querySelector('script[data-hermes-footer]');
const own = script && script.src ? new URL(script.src, location.href) : null;
const version = own ? own.searchParams.get('v') : null;

const cssHref = '/assets/hermes-footer.css' + (version ? '?v=' + version : '');
const cfgHref = '/assets/hermes-footer.json' + (version ? '?v=' + version : '');

function loadConfig() {
  return fetch(cfgHref, { credentials: 'same-origin', cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
    .catch(() => ({}));
}

function addStylesheet() {
  if (!document.querySelector('link[data-hermes-footer-css]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssHref;
    link.setAttribute('data-hermes-footer-css', '');
    document.head.appendChild(link);
  }
}

/* Le bouton « Un mot » du bandeau est le SEUL point d'entrée des retours : le
 * panneau (écrire ou dicter) vient de /retours/api/widget.js. On ne le charge
 * que si l'interface des retours est servie par cet hôte (pas sur
 * rdv.hercules-it.fr, où /retours/ n'existe pas). */
function loadWordWidget(portal) {
  let sameOrigin = true;
  try { sameOrigin = new URL('/retours/', portal).origin === location.origin; } catch (e) {}
  if (!sameOrigin) return;
  if (document.querySelector('script[data-hrw], script[src*="/retours/api/widget.js"]')) return;
  const word = document.createElement('script');
  word.src = '/retours/api/widget.js?v=4';
  word.defer = true;
  word.setAttribute('data-hrw', '');
  document.head.appendChild(word);
}

function boot() {
  if (document.getElementById('hermes-footer-root')) return; // déjà monté

  addStylesheet();

  const host = document.createElement('div');
  host.id = 'hermes-footer-root';
  const shadow = host.attachShadow({ mode: 'open' });

  /* Même feuille que celle du document : dans le shadow root elle n'applique
   * que les règles du composant, et reste isolée des styles de l'application. */
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = cssHref;
  shadow.appendChild(link);

  const mount = document.createElement('div');
  shadow.appendChild(mount);

  document.documentElement.classList.add('hf-fixed');

  /* Réserve la hauteur d'une barre d'action collée en bas de l'application
   * (/photo/ : .destbar) pour que le bouton « Signaler » reste AU-DESSUS.
   * Hauteur mesurée, donc juste aussi quand la barre passe sur deux lignes. */
  const lift = () => {
    const bar = document.querySelector('.destbar');
    const h = bar ? Math.round(bar.getBoundingClientRect().height) + 10 : 0;
    document.documentElement.style.setProperty('--hf-lift', h + 'px');
  };
  lift();
  const bottomBar = document.querySelector('.destbar');
  if (bottomBar && window.ResizeObserver) new ResizeObserver(lift).observe(bottomBar);
  window.addEventListener('resize', lift);

  document.body.appendChild(host);

  return loadConfig().then((cfg) => {
    const config = { ...DEFAULT_CONFIG, ...cfg };
    document.documentElement.setAttribute('data-hf-theme', config.theme === 'light' ? 'light' : 'dark');
    if (config.theme === 'light') host.setAttribute('data-theme', 'light');

    loadWordWidget(config.portal);

    createRoot(mount).render(
      <AppBar
        portalUrl={config.portal}
        logoutUrl={config.logout}
        appsUrl={config.appsApi}
        brandLabel={(config.brand && config.brand.label) || 'Hercules IT'}
      />
    );
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
