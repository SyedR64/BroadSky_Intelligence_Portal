#!/bin/sh
# Stamp a cache-busting version on every shared import (run before each deploy).
V=${1:-$(date +%Y%m%d%H%M%S)}
sed -i '' -E "s#(assets/core\.js|modules/registry\.js)(\?v=[0-9A-Za-z]+)?'#\1?v=$V'#g" index.html
sed -i '' -E "s#(assets/app\.css)(\?v=[0-9A-Za-z]+)?\"#\1?v=$V\"#g" index.html
sed -i '' -E "s#from '\./([a-z]+)\.js(\?v=[0-9A-Za-z]+)?'#from './\1.js?v=$V'#g" modules/registry.js
sed -i '' -E "s#from '\./core\.js(\?v=[0-9A-Za-z]+)?'#from './core.js?v=$V'#g" assets/components.js
for f in modules/*.js; do sed -i '' -E "s#from '\.\./assets/(core|components)\.js(\?v=[0-9A-Za-z]+)?'#from '../assets/\1.js?v=$V'#g" "$f"; done
for f in modules/*.js; do sed -i '' -E "s#(modules/[a-z]+\.css)(\?v=[0-9A-Za-z]+)?'#\1?v=$V'#g" "$f"; done
echo "version $V"
