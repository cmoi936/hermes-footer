#!/bin/sh
# Construction + publication du bandeau commun.
#   sh deploy.sh
# Reconstruit le bundle, aligne la version dans TOUTES les références, vérifie
# qu'elles sont identiques, valide la conf nginx dans un conteneur jetable,
# redémarre le site et contrôle les assets.
set -e
cd /opt/data/hermes-footer

node build.mjs
V=$(cat dist/version.txt)
echo "version $V"

python3 - "$V" <<'PY'
import re, sys
v = sys.argv[1]
tag = '<script defer src="/assets/hermes-footer.js?v=%s" data-hermes-footer></script>' % v
for path in ("/opt/data/hercules-site/nginx.conf", "/opt/data/gamebox/index.html"):
    with open(path, encoding="utf-8") as f:
        txt = f.read()
    # Remplace toute balise existante (avec ou sans options) et tout ?v=.
    txt = re.sub(r'<script defer src="/assets/hermes-footer\.js\?v=[0-9a-f]+"[^>]*></script>', tag, txt)
    with open(path, "w", encoding="utf-8") as f:
        f.write(txt)
    print("%-45s %d référence(s)" % (path, txt.count(tag)))
PY

# Contrôle : aucune référence divergente ne doit subsister.
if grep -E 'hermes-footer\.js' /opt/data/hercules-site/nginx.conf /opt/data/gamebox/index.html \
   | grep -vF "$TAG" >/tmp/footer-bad.txt; then
  echo "ERREUR : références divergentes :" >&2
  cat /tmp/footer-bad.txt >&2
  exit 1
fi
echo "références identiques : OK"

DOCKER_HOST=tcp://docker-proxy:2375 docker run --rm \
  --network container:hercules-site \
  -v /volume1/docker/hermes/hercules-site/nginx.conf:/etc/nginx/conf.d/default.conf:ro \
  nginx:alpine nginx -t 2>&1 | tail -2

DOCKER_HOST=tcp://docker-proxy:2375 docker restart hercules-site >/dev/null
sleep 2
for f in js css json; do
  curl -s -o /dev/null -w "hermes-footer.$f  %{http_code}  %{size_download} octets\n" \
    "https://hercules-it.fr/assets/hermes-footer.$f?v=$V"
done
