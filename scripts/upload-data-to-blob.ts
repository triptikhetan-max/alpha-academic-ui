/**
 * Upload data.json → Vercel Blob.
 *
 * Run from the alpha-academic-ui directory:
 *   BLOB_READ_WRITE_TOKEN=... npm run upload:data
 *
 * Source path can be overridden with `DATA_JSON_PATH`. Defaults to the
 * canonical brain UI kit location on Tripti's T7 Shield.
 *
 * After this runs, copy the printed URL into the Vercel project as
 * `DASHBOARD_DATA_URL`. The dashboard API route reads from that URL.
 *
 * Uses `access: "private"` — the blob is NOT publicly fetchable. The
 * API route at /api/dashboard-data fetches it server-side using the Blob
 * SDK with BLOB_READ_WRITE_TOKEN, so student data never sits on a public
 * URL even with an unguessable suffix.
 */
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { put } from "@vercel/blob";

const DEFAULT_SRC = path.resolve(
  process.cwd(),
  "..",
  "..",
  "..",
  "Work",
  "Alpha",
  "brain",
  "ui_kit_v3",
  "ui_kits",
  "brain",
  "data.json"
);

async function main(): Promise<void> {
  const src = process.env.DATA_JSON_PATH ?? DEFAULT_SRC;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is not set. Get it from Vercel → Storage → Blob."
    );
  }
  const stat = statSync(src);
  // eslint-disable-next-line no-console
  console.log(`Uploading ${src} (${(stat.size / 1024 / 1024).toFixed(1)} MB)…`);
  const data = readFileSync(src);
  // PRIVATE blob — not publicly fetchable. The API route reads it server-side
  // via the Blob SDK with BLOB_READ_WRITE_TOKEN. We use a stable pathname so
  // the API route can target it without needing a per-upload URL update.
  const { url, pathname } = await put("dashboard/data.json", data, {
    access: "private",
    addRandomSuffix: false,
    contentType: "application/json",
    token,
    allowOverwrite: true,
  });
  // eslint-disable-next-line no-console
  console.log(`\nUploaded:\n  pathname: ${pathname}\n  internal URL: ${url}\n`);
  // eslint-disable-next-line no-console
  console.log(
    "Pathname is stable across uploads. The API route at " +
      "/api/dashboard-data reads it via the Blob SDK using " +
      "BLOB_READ_WRITE_TOKEN. No DASHBOARD_DATA_URL env var needed."
  );
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
