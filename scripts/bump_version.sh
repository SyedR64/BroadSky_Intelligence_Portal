#!/bin/sh
# Stamp a cache-busting version on every shared import (run before each deploy).
V=${1:-$(date +%Y%m%d%H%M%S)}
# HTML entry points at the repo root
for f in index.html app.html theater.html scripts/chat_test.html; do
  [ -f "$f" ] && sed -i '' -E "s#(assets/[a-z_-]+\.(js|css))(\?v=[0-9A-Za-z]*)?#\1?v=$V#g; s#(modules/registry\.js)(\?v=[0-9A-Za-z]*)?#\1?v=$V#g" "$f"
done
# module registry + module-level imports of shared assets/css
sed -i '' -E "s#from '\./([a-z_]+)\.js(\?v=[0-9A-Za-z]*)?'#from './\1.js?v=$V'#g" modules/registry.js
for f in modules/*.js; do sed -i '' -E "s#(\.\./assets/[a-z_-]+\.js)(\?v=[0-9A-Za-z]*)?#\1?v=$V#g; s#(modules/[a-z_]+\.css)(\?v=[0-9A-Za-z]*)?#\1?v=$V#g" "$f"; done
# shared assets importing each other + literal ?v= in asset code
for f in assets/*.js; do sed -i '' -E "s#(\./(core|chat|components|counter|theater)\.js)(\?v=[0-9A-Za-z]*)?#\1?v=$V#g; s#(chat\.css|theater\.css)(\?v=[0-9A-Za-z]*)?#\1?v=$V#g" "$f"; done
# concept sites, OS pages, playbooks (html + their js imports of ../../assets/*), briefing html
for f in redesigns/*.html redesigns/*/*.html redesigns/*.js redesigns/*/*.js briefing/*.html; do [ -f "$f" ] && sed -i '' -E "s#(assets/[a-z_-]+\.(js|css))(\?v=[0-9A-Za-z]*)?#\1?v=$V#g" "$f"; done
echo "version $V"
