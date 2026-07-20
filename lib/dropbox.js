/* Dropbox archive for fee note PDFs.
   Uploads a copy of each fee note PDF to Dropbox using the refresh-token
   OAuth flow. Dormant unless DROPBOX_APP_KEY, DROPBOX_APP_SECRET and
   DROPBOX_REFRESH_TOKEN are set.

   Files land in the app folder (or DROPBOX_FOLDER prefix if set),
   organised by case type then case folder, matching NIVHA convention:
     /CCN/CCN-1002/NIVHA-fee-note-CCN-1002.pdf
     /PCN/PCN-1020/NIVHA-fee-note-PCN-1020.pdf
   Re-uploads overwrite (e.g. the paid version replaces the unpaid one). */

'use strict';

const APP_KEY = process.env.DROPBOX_APP_KEY || '';
const APP_SECRET = process.env.DROPBOX_APP_SECRET || '';
const REFRESH_TOKEN = process.env.DROPBOX_REFRESH_TOKEN || '';
const FOLDER = (process.env.DROPBOX_FOLDER || '').replace(/\/+$/, '');

const DROPBOX_ENABLED = !!(APP_KEY && APP_SECRET && REFRESH_TOKEN);

let cached = { token: null, expiresAt: 0 };

async function accessToken() {
  if (cached.token && Date.now() < cached.expiresAt - 60000) return cached.token;
  const res = await fetch('https://api.dropbox.com/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${APP_KEY}:${APP_SECRET}`).toString('base64')
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: REFRESH_TOKEN })
  });
  if (!res.ok) throw new Error(`Dropbox token refresh failed (${res.status}): ${await res.text()}`);
  const j = await res.json();
  cached = { token: j.access_token, expiresAt: Date.now() + (j.expires_in || 14400) * 1000 };
  return cached.token;
}

/* Upload a fee note PDF. Non-fatal by design — callers fire and forget. */
async function uploadFeeNote({ reference, pdfBuffer }) {
  if (!DROPBOX_ENABLED) {
    console.log(`[dropbox dry-run] would upload NIVHA-fee-note-${reference}.pdf`);
    return { ok: true, dryRun: true };
  }
  /* CCN-1002 -> /CCN/CCN-1002/, PCN-1020 -> /PCN/PCN-1020/ */
  const type = String(reference).split('-')[0].toUpperCase();
  const path = reference === 'HEALTHCHECK'
    ? `${FOLDER}/_diagnostics/healthcheck.pdf`
    : `${FOLDER}/${type}/${reference}/NIVHA-fee-note-${reference}.pdf`;
  const token = await accessToken();
  const res = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({ path, mode: 'overwrite', autorename: false, mute: true })
    },
    body: pdfBuffer
  });
  if (!res.ok) throw new Error(`Dropbox upload failed (${res.status}): ${await res.text()}`);
  const j = await res.json();
  console.log(`[dropbox] archived ${j.path_display} (${j.size} bytes)`);
  return { ok: true, path: j.path_display };
}

/* Diagnostic: attempts a token refresh and a tiny test upload, returns
   the raw error if either fails. No secrets in the response. */
async function health() {
  if (!DROPBOX_ENABLED) return { enabled: false };
  const out = { enabled: true };
  try {
    await accessToken();
    out.tokenOk = true;
  } catch (e) {
    out.tokenOk = false; out.error = e.message; return out;
  }
  try {
    const r = await uploadFeeNote({ reference: 'HEALTHCHECK', pdfBuffer: Buffer.from('NIVHA dropbox health check') });
    out.uploadOk = true; out.path = r.path;
  } catch (e) {
    out.uploadOk = false; out.error = e.message;
  }
  return out;
}

module.exports = { uploadFeeNote, DROPBOX_ENABLED, health };
