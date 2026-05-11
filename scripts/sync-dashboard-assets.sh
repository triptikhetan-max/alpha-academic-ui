#!/usr/bin/env bash
# Syncs the Brain Dashboard static assets from the source UI kit into
# `public/dashboard-assets/` so Next.js can serve them.
#
# This is a COPY operation. The source files live at:
#   /Volumes/T7 Shield/Work/Alpha/brain/ui_kit_v3/ui_kits/brain/
#
# A patched copy of render.js is produced (NOT a symlink) so we can
# adjust the data-loading hook without modifying the source.
#
# After syncing the source render.js, this script appends a small
# bootstrap shim that points the dashboard at /api/dashboard-data
# instead of the inline base64 blob.
set -euo pipefail

SRC="${BRAIN_UI_KIT_SRC:-/Volumes/T7 Shield/Work/Alpha/brain/ui_kit_v3/ui_kits/brain}"
DEST="$(cd "$(dirname "$0")/.." && pwd)/public/dashboard-assets"

if [ ! -d "$SRC" ]; then
  echo "Source dir not found: $SRC" >&2
  echo "Set BRAIN_UI_KIT_SRC if it lives elsewhere." >&2
  exit 1
fi

mkdir -p "$DEST"

echo "Syncing CSS + charts.js → $DEST"
cp "$SRC/app.css"          "$DEST/app.css"
cp "$SRC/charts.js"        "$DEST/charts.js"
cp "$SRC/tokens-cool.css"  "$DEST/tokens-cool.css"
cp "$SRC/tokens-mono.css"  "$DEST/tokens-mono.css"
cp "$SRC/tokens-dark.css"  "$DEST/tokens-dark.css"

# Extract the body markup from index.html (everything between <body> and the
# trailing <script src=...> tags). The Next.js page injects this via
# dangerouslySetInnerHTML.
echo "Extracting body markup → $DEST/body.html"
awk '/^<body>/{flag=1; next} /^<script /{flag=0} flag' "$SRC/index.html" \
  > "$DEST/body.html"

# Copy render.js and append the API-fetch bootstrap shim.
echo "Patching render.js → $DEST/render.js"
{
  cat "$SRC/render.js"
  cat <<'EOF'

/* ================================================================
 * alpha-academic-ui bootstrap shim
 * ----------------------------------------------------------------
 * Injected by scripts/sync-dashboard-assets.sh. Replaces the inline
 * base64-gzip data loader with an authenticated fetch from
 * /api/dashboard-data. window.DRI_MODE is already set by the
 * Next.js host page before this file loads.
 * ================================================================ */
(function () {
  if (typeof window === 'undefined') return;
  window.__BOOT_FETCH_DATA = async function () {
    const r = await fetch('/api/dashboard-data', { credentials: 'same-origin' });
    if (!r.ok) {
      throw new Error('Failed to load dashboard data: HTTP ' + r.status);
    }
    return await r.json();
  };
  // Override the legacy decompression promise so the existing boot()
  // sequence picks up our fetched payload as window.DATA.
  window.__DATA_BOOT_PROMISE = (async function () {
    try {
      const data = await window.__BOOT_FETCH_DATA();
      if (data && data.status === 'data_pending') {
        // Show a friendly message instead of trying to render empty state.
        const root = document.getElementById('dashboard-root') || document.body;
        const note = document.createElement('div');
        note.style.cssText = 'padding:48px;font-family:system-ui;max-width:640px;margin:48px auto;border:1px solid #e5e7eb;border-radius:8px;background:#fff;';
        note.innerHTML =
          '<h1 style="font-size:22px;margin:0 0 12px;">Data is still being prepared</h1>' +
          '<p style="color:#374151;line-height:1.5;">' +
          (data.message || 'The next nightly snapshot will populate this view.') +
          '</p>';
        root.prepend(note);
        // Provide an empty-but-valid payload so render.js can still mount.
        window.DATA = { campuses: [], students: [], tests: { library: [] } };
        return;
      }
      window.DATA = data;
    } catch (e) {
      console.error('[boot] dashboard-data fetch failed', e);
      window.DATA = { campuses: [], students: [], tests: { library: [] } };
    }
  })();
})();
EOF
} > "$DEST/render.js"

echo "Done."
echo "Files in $DEST:"
ls -la "$DEST"
