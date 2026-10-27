# hermes-footer — bandeau commun des applications Hercules IT

**Un seul module, un seul rendu, pour tout le parc derrière Authentik.**
Barre fixée au bas de la **fenêtre** (jamais en bas de page ni de formulaire),
apparence identique partout, thème sombre par défaut et thème clair possible
par configuration.

Il affiche :

- **Applications** — panneau listant les applications auxquelles la session
  Authentik donne droit (même filtrage que la bibliothèque du portail) ;
- **Un mot** — seul point d'entrée des retours du parc (le panneau vient de
  `/retours/api/widget.js`) ;
- **Se déconnecter** — flux d'invalidation Authentik, après purge des caches et
  du service worker (une PWA *cache-first* ressert sinon l'ancienne page).

## Intégration : une ligne, la même partout

```html
<script defer src="https://hercules-it.fr/assets/hermes-footer.js?v=<version>" data-hermes-footer></script>
```

Aucune option sur la balise, aucune copie du code dans les applications. Le
script se monte seul dans un **shadow root** : les feuilles des applications ne
peuvent ni le déformer ni le déplacer. Les applications non modifiables (Next.js,
services tiers) reçoivent la même ligne par `sub_filter` nginx.

## Configuration : un seul fichier

`hermes-footer.json`, publié à côté du bundle
(`/assets/hermes-footer.json`), est lu au chargement — le modifier ne demande
aucune reconstruction :

```json
{
  "theme": "dark",
  "brand": { "label": "Hercules IT" },
  "portal": "https://hercules-it.fr/auth/if/user/",
  "logout": "https://hercules-it.fr/auth/application/o/rdv/end-session/?next=…",
  "appsApi": "https://hercules-it.fr/auth/api/v3/core/applications/?page_size=50"
}
```

- `theme` : `dark` (défaut) ou `light`. La géométrie est identique ; seuls les
  jetons de couleur changent.
- Si `appsApi` n'est pas de même origine que la page (cas
  `rdv.hercules-it.fr`), le panneau est désactivé et « Applications » devient un
  lien vers le portail : le rendu reste identique.

## Construction et publication

```sh
sh deploy.sh
```

1. `node build.mjs` → `dist/hermes-footer.{js,css,json}` + hash de version ;
2. la **même** balise est réécrite dans toutes les références
   (`hercules-site/nginx.conf`, `gamebox/index.html`) et un contrôle échoue si
   une référence diverge ;
3. `nginx -t` dans un conteneur jetable, redémarrage du site, contrôle 200 des
   trois assets.

Applications couvertes : `/repas/`, `/notes/`, `/lechatfeutre/`, `/photo/`,
`/retours/`, `/dashboard/`, `/rdv/admin`, `rdv.hercules-it.fr` et
`portail.hercules-it.fr`.

## Règles de page

La feuille est chargée deux fois (document + shadow root) : même fichier, donc
aucune divergence possible. Côté document elle réserve les 34 px du bas
(`html.hf-fixed body`) et remonte les éléments flottants des applications
(`.hrw-fab`, `.destbar` de /photo/, `.fb-fab` du Chat Feutré, toasts).

## Développement

    src/AppBar.jsx    composant (panneau, déconnexion, icônes)
    src/footer.css    styles + jetons de thème, servis en feuille externe (CSP)
    src/mount.jsx     montage autonome (shadow root, config, createRoot)
    build.mjs         esbuild IIFE minifié, React 18 en production

## Licence

MIT.
