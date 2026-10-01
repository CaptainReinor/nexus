module.exports = async context => {
  if(context.electronPlatformName!=='linux')return;
  const { writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  // The default AppImage launcher can silently disable Chromium's sandbox.
  // AppImageTarget copies appOutDir after generating its launcher, so our launcher wins.
  writeFileSync(join(context.appOutDir,'AppRun'),`#!/bin/sh
set -eu
if [ -z "\${APPDIR:-}" ]; then
  APPDIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
fi
export APPDIR
if [ -z "\${APPIMAGE:-}" ]; then
  APPIMAGE="$APPDIR/AppRun"
  export APPIMAGE
fi
export LD_LIBRARY_PATH="$APPDIR/usr/lib\${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec "$APPDIR/nexus" "$@"
`,{mode:0o755});
};
