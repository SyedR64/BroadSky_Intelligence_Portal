#!/bin/sh
# Headless smoke test for one route: prints console errors/warnings and saves a screenshot.
# Usage: scripts/check_page.sh "#/cet/overview" [out.png] [width] [height]
ROUTE=${1:-"#/home/overview"}; OUT=${2:-/tmp/bsp_check.png}; W=${3:-1600}; H=${4:-1000}
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
case "$ROUTE" in \#*) URL="http://127.0.0.1:8765/app.html$ROUTE";; *) URL="http://127.0.0.1:8765/$ROUTE";; esac
GLFLAGS=""; case "$ROUTE$GL" in *theater*|*GL1*) GLFLAGS="--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --disable-gpu-sandbox --ignore-gpu-blocklist";; *) GLFLAGS="--disable-gpu";; esac
"$CHROME" --headless=new $GLFLAGS --hide-scrollbars --window-size=${W},${H} --virtual-time-budget=15000 --enable-logging=stderr --v=0 --screenshot="$OUT" "$URL" 2>&1 \
  | grep -E "CONSOLE|Uncaught|Error|error" | grep -v -E "GPU|gpu|dbus|DevTools|Fontconfig|fontconfig|speech_synthesis|tts_|TensorFlow|libGL|Skia|cache|gcm|DEPRECATED_ENDPOINT|registration_request" | sed -E 's/^\[[0-9:\/. ]+INFO:CONSOLE[^]]*\]//' | head -40
echo "screenshot: $OUT ($(stat -f%z "$OUT" 2>/dev/null || echo 0) bytes) route: $ROUTE"
