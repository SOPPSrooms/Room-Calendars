// Fetches the SOPPS room ICS feeds server-side (no CORS involved here —
// this runs on GitHub's Actions runner, not in a browser) and writes them
// into /data so the static page can load them same-origin.
//
// ICS URLs are read from environment variables, which are populated from
// GitHub repo secrets in the workflow. Never hardcode the URLs here —
// each one contains a private access token.

import { writeFile, mkdir } from 'node:fs/promises';

const CALENDARS = [
  { id: 'r225',  envVar: 'ICS_URL_R225'  },
  { id: 'r226',  envVar: 'ICS_URL_R226'  },
  { id: 'r226x', envVar: 'ICS_URL_R226X' },
];

async function fetchOne(cal) {
  const url = process.env[cal.envVar];
  if (!url) {
    return { id: cal.id, ok: false, error: `Missing env var ${cal.envVar} (check repo secrets)` };
  }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!text.includes('BEGIN:VCALENDAR')) throw new Error('Response was not a valid ICS file');
    await writeFile(`data/${cal.id}.ics`, text, 'utf8');
    return { id: cal.id, ok: true };
  } catch (err) {
    // On failure we deliberately leave the previous good .ics file in place
    // rather than overwrite it with bad/empty data.
    return { id: cal.id, ok: false, error: err.message };
  }
}

async function main() {
  await mkdir('data', { recursive: true });

  const results = await Promise.all(CALENDARS.map(fetchOne));

  const manifest = {
    updatedAt: new Date().toISOString(),
    calendars: Object.fromEntries(results.map(r => [r.id, { ok: r.ok, error: r.error ?? null }])),
  };
  await writeFile('data/manifest.json', JSON.stringify(manifest, null, 2));

  const failures = results.filter(r => !r.ok);
  if (failures.length) {
    for (const f of failures) console.error(`[fetch-calendars] ${f.id} failed: ${f.error}`);
    // Non-zero exit so the Action run shows as failed/visible in history,
    // even though we keep serving the last good data.
    process.exitCode = 1;
  } else {
    console.log('[fetch-calendars] all calendars synced successfully');
  }
}

main();
