/**
 * Writes `app/public/demo-config.json` and nothing else.
 *
 * The build step for a hosted deploy. `setup.ts` is the wrong thing to run per build: it
 * rewrites grants and settings that are global to the Stream app, so every deploy would
 * revert whatever the dashboard says. This mints tokens for the same cast and stops there,
 * so the Stream app is only ever configured deliberately, by `npm run setup`.
 *
 * The tokens it writes are non-expiring and land in a file the browser fetches - see
 * "Demo-only shortcuts" in the README before pointing this at an app you care about.
 */

import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StreamClient } from '@stream-io/node-sdk';
import { CAST } from './cast.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(HERE, '../../app/public/demo-config.json');

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

const apiKey = requireEnv('STREAM_API_KEY');
const client = new StreamClient(apiKey, requireEnv('STREAM_API_SECRET'), { timeout: 30_000 });

const config = {
  apiKey,
  generatedAt: new Date().toISOString(),
  users: CAST.map(({ id, name, role }) => ({
    id,
    name,
    role,
    token: client.generatePermanentUserToken({ user_id: id }),
  })),
};

await mkdir(dirname(CONFIG_PATH), { recursive: true });
await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
console.log(`${config.users.length} tokens → ${CONFIG_PATH}`);
