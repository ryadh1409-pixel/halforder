/**
 * Fetch active production Firestore rules from projects/halforfer/releases/cloud.firestore
 * Run: npx tsx scripts/fetch-live-firestore-rules.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cert, getApps, initializeApp } from 'firebase-admin/app';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../.live-firestore.rules');

async function main(): Promise<void> {
  if (!getApps().length) {
    const sa = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../main/sa.json'), 'utf8'));
    initializeApp({ credential: cert(sa), projectId: 'halforfer' });
  }
  const sa = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../main/sa.json'), 'utf8'));
  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth({
    credentials: sa,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  async function get(url: string): Promise<unknown> {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token.token}` } });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${text}`);
    return JSON.parse(text) as unknown;
  }

  const release = (await get(
    'https://firebaserules.googleapis.com/v1/projects/halforfer/releases/cloud.firestore',
  )) as { name?: string; rulesetName?: string; createTime?: string; updateTime?: string };

  const rulesetName = release.rulesetName ?? '';
  const ruleset = (await get(`https://firebaserules.googleapis.com/v1/${rulesetName}`)) as {
    name?: string;
    createTime?: string;
    source?: { files?: Array<{ content?: string }> };
  };

  const source = ruleset.source?.files?.[0]?.content ?? '';
  fs.writeFileSync(OUT, source);

  process.stdout.write(`release: ${release.name ?? 'unknown'}\n`);
  process.stdout.write(`rulesetName: ${rulesetName}\n`);
  process.stdout.write(`rulesetCreateTime: ${ruleset.createTime ?? 'unknown'}\n`);
  process.stdout.write(`releaseUpdateTime: ${release.updateTime ?? 'unknown'}\n`);
  process.stdout.write(`sourceBytes: ${source.length}\n`);
  process.stdout.write(`written: ${OUT}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
