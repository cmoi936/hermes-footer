import React, { useCallback, useEffect, useId, useRef, useState } from 'react';

/* ---------------------------------------------------------------------------
 * Bandeau commun des applications Hercules IT derrière Authentik.
 *
 * UN module, UN rendu : barre fixe collée au bas de la FENÊTRE, même
 * apparence partout (thème `dark` par défaut, `light` par configuration),
 * isolée dans un shadow root pour qu'aucune feuille d'application ne puisse
 * la déformer.
 *
 * Deux commandes : « Applications » (panneau alimenté par l'API du portail,
 * même filtrage que la bibliothèque Authentik) et « Se déconnecter » (flux
 * d'invalidation, avec purge des caches et du service worker AVANT la
 * navigation — sinon une PWA cache-first ressert l'ancienne page).
 *
 * Aucune application n'est modifiée : le script se monte seul.
 * ------------------------------------------------------------------------- */

const APPS_CACHE_KEY = 'hermes-appbar.apps.v3';
const CACHE_TTL = 10 * 60 * 1000;

/* Purge caches HTTP + service worker, puis navigue. */
function purgeThenGo(url) {
  let done = false;
  const go = () => { if (!done) { done = true; window.location.href = url; } };

  try {
    if ('caches' in window) {
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).catch(() => {});
    }
  } catch (e) { /* ignore */ }

  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => {});
    }
  } catch (e) { /* ignore */ }

  setTimeout(go, 700);
  Promise.resolve().then(() => setTimeout(go, 120));
}

function readCache() {
  try {
    const raw = sessionStorage.getItem(APPS_CACHE_KEY);
    if (!raw) return null;
    const box = JSON.parse(raw);
    if (!box || !Array.isArray(box.apps) || Date.now() - box.at > CACHE_TTL) return null;
    return box.apps;
  } catch (e) { return null; }
}

function writeCache(apps) {
  try {
    sessionStorage.setItem(APPS_CACHE_KEY, JSON.stringify({ at: Date.now(), apps }));
  } catch (e) { /* quota / mode privé : sans conséquence */ }
}

function normalizeApps(results) {
  return results
    .filter((a) => a && a.meta_hide !== true)
    .map((a) => {
      const launch = a.launch_url || a.meta_launch_url || '';
      let path = '';
      try { path = new URL(launch, window.location.origin).pathname.replace(/\/+$/, ''); } catch (e) {}
      return {
        slug: a.slug,
        name: a.name || a.slug,
        description: a.meta_description || '',
        launch,
        icon: a.meta_icon || a.meta_icon_url || '',
        path,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/* L'application courante est recalculée à l'AFFICHAGE : la liste est mise en
 * cache 10 min et l'utilisateur change de page entre-temps. */
function isCurrent(app) {
  const here = window.location.pathname.replace(/\/+$/, '');
  return !!app.path && (here === app.path || here.startsWith(app.path + '/'));
}

function AppIcon({ app }) {
  const [broken, setBroken] = useState(false);
  const initial = (app.name || '?').trim().charAt(0).toUpperCase();
  if (!app.icon || broken) {
    return <span className="hf-app-initial" aria-hidden="true">{initial}</span>;
  }
  return (
    <img className="hf-app-icon" src={app.icon} alt="" loading="lazy" onError={() => setBroken(true)} />
  );
}

export default function AppBar({
  portalUrl,
  logoutUrl,
  appsUrl,
  brandLabel = 'Hercules IT',
}) {
  const [open, setOpen] = useState(false);
  const [apps, setApps] = useState(null);
  const [error, setError] = useState(false);
  const panelRef = useRef(null);
  const btnRef = useRef(null);
  const panelId = useId();

  /* Le panneau n'est possible que si l'API du portail est de MÊME ORIGINE :
   * sur rdv.hercules-it.fr elle vit sur le domaine parent (pas de CORS), donc
   * le bouton devient un lien vers le portail. Le rendu, lui, est identique. */
  const panelEnabled = (() => {
    if (!appsUrl) return false;
    try { return new URL(appsUrl, window.location.href).origin === window.location.origin; }
    catch (e) { return false; }
  })();

  const loadApps = useCallback(() => {
    const cached = readCache();
    if (cached) { setApps(cached); setError(false); return; }

    let cancelled = false;
    fetch(appsUrl, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((data) => {
        if (cancelled) return;
        const list = normalizeApps(data.results || []);
        setApps(list);
        setError(false);
        writeCache(list);
      })
      .catch(() => { if (!cancelled) setError(true); });

    return () => { cancelled = true; };
  }, [appsUrl]);

  useEffect(() => {
    if (panelEnabled && open && apps === null) loadApps();
  }, [panelEnabled, open, apps, loadApps]);

  /* Pré-chargement pendant un temps mort : l'API du portail met plusieurs
   * secondes à froid sur le NAS. */
  useEffect(() => {
    if (!panelEnabled || readCache()) return undefined;
    const start = () => loadApps();
    let handle;
    if (window.requestIdleCallback) {
      handle = window.requestIdleCallback(start, { timeout: 3000 });
      return () => window.cancelIdleCallback(handle);
    }
    handle = setTimeout(start, 1500);
    return () => clearTimeout(handle);
  }, [panelEnabled, loadApps]);

  useEffect(() => {
    if (!open) return undefined;

    const onKey = (ev) => {
      if (ev.key === 'Escape') { setOpen(false); if (btnRef.current) btnRef.current.focus(); }
    };
    const onClick = (ev) => {
      /* Le composant vit dans un shadow root : au niveau document, `ev.target`
       * est l'hôte `#hermes-footer-root`, pas l'élément cliqué. Tester
       * `contains(ev.target)` refermait donc le panneau au pointerdown, ce qui
       * démontait le lien AVANT le clic — « je clique sur une application, rien
       * ne se passe ». Le chemin composé donne les vrais éléments traversés. */
      const path = typeof ev.composedPath === 'function' ? ev.composedPath() : [];
      const inside = (el) => !!el && (path.indexOf(el) !== -1 || el.contains(ev.target));
      if (!inside(panelRef.current) && !inside(btnRef.current)) {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onClick, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onClick, true);
    };
  }, [open]);

  const onLogout = (ev) => {
    ev.preventDefault();
    purgeThenGo(logoutUrl);
  };

  /* « Un mot » : SEUL point d'entrée des retours du parc. Le panneau est
   * fourni par /retours/api/widget.js, chargé par mount.jsx ; s'il n'est pas
   * prêt (ou absent), le bouton reste un lien vers l'interface des retours. */
  const wordHref = (() => {
    try { return new URL('/retours/', portalUrl).href; }
    catch (e) { return '/retours/'; }
  })();
  const onWord = (ev) => {
    const api = window.__hermesRetours;
    if (api && typeof api.open === 'function') { ev.preventDefault(); api.open(); }
  };

  const appsGlyph = (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none"
         stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.6" />
      <rect x="14" y="3" width="7" height="7" rx="1.6" />
      <rect x="3" y="14" width="7" height="7" rx="1.6" />
      <rect x="14" y="14" width="7" height="7" rx="1.6" />
    </svg>
  );

  return (
    <React.Fragment>
      {panelEnabled && open && (
        <section className="hf-panel" id={panelId} ref={panelRef} role="dialog" aria-label="Mes applications">
          <div className="hf-panel-head">
            <span className="hf-panel-title">Mes applications</span>
            <button type="button" className="hf-close" aria-label="Fermer"
                    onClick={() => { setOpen(false); if (btnRef.current) btnRef.current.focus(); }}>×</button>
          </div>

          {apps === null && !error && <p className="hf-note hf-loading" aria-live="polite">Chargement…</p>}

          {error && (
            <p className="hf-note">
              Impossible de charger la liste. <a href={portalUrl}>Ouvrir le portail</a>.
            </p>
          )}

          {apps !== null && apps.length === 0 && (
            <p className="hf-note">Aucune application accessible avec ce compte.</p>
          )}

          {apps !== null && apps.length > 0 && (
            <ul className="hf-apps">
              {apps.map((app) => {
                const current = isCurrent(app);
                return (
                  <li key={app.slug}>
                    <a className={'hf-app' + (current ? ' is-current' : '')}
                       href={app.launch || portalUrl}
                       aria-current={current ? 'page' : undefined}>
                      <AppIcon app={app} />
                      <span className="hf-app-text">
                        <span className="hf-app-name">{app.name}</span>
                        {app.description && <span className="hf-app-desc">{app.description}</span>}
                      </span>
                      {current && <span className="hf-here">ici</span>}
                    </a>
                  </li>
                );
              })}
            </ul>
          )}

          <a className="hf-portal" href={portalUrl}>
            Ouvrir le portail des applications<span aria-hidden="true"> →</span>
          </a>
        </section>
      )}

      <footer className="hf-bar">
        <span className="hf-brand" title={brandLabel}>
          <img src="/assets/hercules-it-apps.svg" alt="" width="16" height="16" />
        </span>
        {panelEnabled ? (
          <button type="button" className={'hf-btn' + (open ? ' is-open' : '')} ref={btnRef}
                  aria-expanded={open} aria-controls={panelId}
                  onClick={() => setOpen((v) => !v)}
                  title="Accéder aux applications Hercules IT">
            {appsGlyph}
            <span>Applications</span>
          </button>
        ) : (
          <a className="hf-btn" href={portalUrl} title="Accéder aux applications Hercules IT">
            {appsGlyph}
            <span>Applications</span>
          </a>
        )}
        <span className="hf-sep" aria-hidden="true">·</span>
        <a className="hf-btn hf-word" href={wordHref} onClick={onWord} data-word
           title="Laisser un mot : une idée, un souci">
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none"
               stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.6 9.6 0 0 1-3.6-.7L3 21l1.8-4.3A8.2 8.2 0 0 1 3.6 11.5a8.4 8.4 0 0 1 8.4-8.4 8.4 8.4 0 0 1 9 8.4z" />
          </svg>
          <span>Un mot</span>
        </a>
        <span className="hf-sep" aria-hidden="true">·</span>
        <a className="hf-btn hf-logout" href={logoutUrl} onClick={onLogout} data-logout>
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none"
               stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 17l5-5-5-5" />
            <path d="M20 12H9" />
            <path d="M12 19H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6" />
          </svg>
          <span>Se déconnecter</span>
        </a>
      </footer>
    </React.Fragment>
  );
}
