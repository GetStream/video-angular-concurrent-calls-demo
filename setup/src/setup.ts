/**
 * One-shot server-side setup for the Stream Video + Angular proctored-exam demo.
 *
 * Creates the roles, wires their capabilities onto the call types and the chat channel
 * type, seeds the fixed cast of users, mints non-expiring tokens and writes everything the
 * browser app needs into `app/public/demo-config.json`.
 *
 * Safe to re-run: every step reads current state and merges, so nothing is duplicated and
 * no other role's grants are dropped.
 *
 *   cp .env.example .env   # then add STREAM_API_SECRET
 *   npm run setup
 */

import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StreamClient } from '@stream-io/node-sdk';
import { CAST, PROCTORS, STUDENTS } from './cast.ts';
import {
  APP_GRANTS,
  CUSTOM_ROLES,
  EXAM_GRANTS,
  ROLE,
  WHISPER_GRANTS,
} from './grants.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
/** The Angular app reads this at runtime; `app/` is created in step 2. */
const CONFIG_PATH = resolve(HERE, '../../app/public/demo-config.json');

const EXAM_CALL_TYPE = 'default';
const WHISPER_CALL_TYPE = 'audio_room';
const CHAT_CHANNEL_TYPE = 'messaging';

const step = (msg: string) => console.log(`\n\x1b[1m${msg}\x1b[0m`);
const done = (msg: string) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
const warn = (msg: string) => console.log(`  \x1b[33m!\x1b[0m ${msg}`);

/** A mistake in configuration rather than a failure talking to Stream: no stack wanted. */
class ConfigError extends Error {}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new ConfigError(
      `${name} is not set. Copy setup/.env.example to setup/.env and fill it in.`,
    );
  }
  return value;
}

/**
 * Merge our grants into a call type's existing map.
 *
 * Read-modify-write matters here: the API replaces the whole `grants` map, so sending only
 * our roles would wipe the built-in ones. We also deliberately leave `user`, `admin`,
 * `host`, `moderator` and `call_member` untouched.
 */
function mergeGrants(
  existing: Record<string, string[]>,
  ours: Record<string, string[]>,
): Record<string, string[]> {
  return { ...existing, ...ours };
}

/**
 * Call-type `grants` are keyed by role and take **permission ids**, which are app data from
 * `listPermissions()` - a different vocabulary from the `OwnCapability` values a client sees
 * in `own_capabilities`. They overlap heavily but not completely, and the API rejects the
 * whole request on the first unknown id ("cannot use unknown permission ..."). Validate up
 * front so a mismatch is a readable message naming the culprits, not an opaque 400.
 */
async function validateGrants(
  client: StreamClient,
  grantSets: Record<string, string[]>[],
): Promise<void> {
  step('Permission ids');
  const { permissions } = await client.listPermissions();
  const valid = new Set(permissions.map((p) => p.id));

  const wanted = new Set(grantSets.flatMap((g) => Object.values(g).flat()));
  const unknown = [...wanted].filter((id) => !valid.has(id)).sort();

  if (unknown.length) {
    const suggest = (id: string) => {
      const stem = id.replace(/^(start|stop)-/, '').replace(/-call$/, '');
      const near = [...valid].filter((v) => v.includes(stem)).sort();
      return near.length ? ` (did you mean: ${near.join(', ')}?)` : '';
    };
    throw new ConfigError(
      `These permission ids are not valid for this app:\n` +
        unknown.map((id) => `    - ${id}${suggest(id)}`).join('\n') +
        `\n\n  Fix them in setup/src/grants.ts. ` +
        `(${valid.size} ids exist; set LIST_PERMISSIONS=1 to print them all.)` +
        (process.env.LIST_PERMISSIONS ? `\n\n    ${[...valid].sort().join(', ')}` : ''),
    );
  }
  done(`all ${wanted.size} requested ids valid (of ${valid.size} available)`);
}

async function ensureRoles(client: StreamClient): Promise<void> {
  step('Roles');
  const { roles } = await client.listRoles();
  const existing = new Set(roles.map((r) => r.name));

  for (const name of CUSTOM_ROLES) {
    if (existing.has(name)) {
      done(`${name} (already exists)`);
      continue;
    }
    await client.createRole({ name });
    done(`${name} (created)`);
  }
}

async function configureAppGrants(client: StreamClient): Promise<void> {
  step('Application-level grants');
  const { app } = await client.getApp();

  await client.updateApp({ grants: mergeGrants(app.grants, APP_GRANTS) });
  done(`${ROLE.PROCTOR} → create-call`);
  done(`${ROLE.STUDENT} → no call capabilities`);

  // The pickers on the call-create screen use chat's queryUsers with a role filter, which
  // this app setting can block per role.
  const blocked = app.user_search_disallowed_roles ?? [];
  if (blocked.includes(ROLE.PROCTOR)) {
    warn(
      `'${ROLE.PROCTOR}' is in user_search_disallowed_roles — the member pickers ` +
        `(queryUsers) will fail. Remove it in the dashboard under App Settings.`,
    );
  } else {
    done('user_search_disallowed_roles does not block proctors');
  }
}

async function configureCallType(
  client: StreamClient,
  name: string,
  grants: Record<string, string[]>,
  settings: NonNullable<Parameters<typeof client.video.updateCallType>[0]['settings']>,
): Promise<void> {
  step(`Call type '${name}'`);
  const current = await client.video.getCallType({ name });

  // `target_resolution` is typed optional, but sending a `video` block without it makes the
  // server read it as 0x0 and reject the whole request ("must be 240 or greater"). Carry the
  // current value forward so a partial video update can never trip that.
  const settingsToSend: typeof settings = settings.video
    ? {
        ...settings,
        video: {
          target_resolution: current.settings.video.target_resolution,
          ...settings.video,
        },
      }
    : settings;

  await client.video.updateCallType({
    name,
    grants: mergeGrants(current.grants, grants),
    settings: settingsToSend,
  });

  for (const [role, caps] of Object.entries(grants)) {
    done(`${role} → ${caps.length ? caps.join(', ') : '(nothing)'}`);
  }
}

/**
 * A brand-new custom role has no chat capabilities at all, and chat capabilities live in a
 * separate grant map from the video ones. Clone what the built-in `user` role can do onto
 * our two app-level roles, or the exam chat panel silently fails.
 *
 * The `call_member_*` roles are call-scoped and irrelevant to chat.
 */
async function configureChatGrants(client: StreamClient): Promise<void> {
  step(`Chat channel type '${CHAT_CHANNEL_TYPE}'`);
  const current = await client.chat.getChannelType({ name: CHAT_CHANNEL_TYPE });
  const userGrants = current.grants?.['user'];

  if (!userGrants?.length) {
    warn(
      `no 'user' grants found to clone; check the '${CHAT_CHANNEL_TYPE}' channel type ` +
        `in the dashboard`,
    );
    return;
  }

  await client.chat.updateChannelType({
    name: CHAT_CHANNEL_TYPE,
    // automod, automod_behavior and max_message_length are required on this request even
    // though we only want to change grants — echo the current values back rather than
    // guessing defaults and silently reconfiguring moderation.
    automod: current.automod,
    automod_behavior: current.automod_behavior,
    max_message_length: current.max_message_length,
    grants: mergeGrants(current.grants ?? {}, {
      [ROLE.PROCTOR]: [...userGrants],
      [ROLE.STUDENT]: [...userGrants],
    }),
  });
  done(`${ROLE.PROCTOR} and ${ROLE.STUDENT} → cloned ${userGrants.length} 'user' grants`);
}

async function seedUsers(client: StreamClient): Promise<void> {
  step('Users');
  await client.upsertUsers(
    CAST.map(({ id, name, role }) => ({ id, name, role })),
  );
  done(`${PROCTORS.length} proctors: ${PROCTORS.map((p) => p.id).join(', ')}`);
  done(`${STUDENTS.length} students: ${STUDENTS.map((s) => s.id).join(', ')}`);
}

interface DemoConfig {
  apiKey: string;
  generatedAt: string;
  users: { id: string; name: string; role: string; token: string }[];
}

async function writeConfig(client: StreamClient, apiKey: string): Promise<DemoConfig> {
  step('Tokens and runtime config');

  const config: DemoConfig = {
    apiKey,
    generatedAt: new Date().toISOString(),
    // Non-expiring on purpose: this is a client-side demo with no backend to refresh them.
    // generateUserToken would always set `exp` (defaulting to iat + 1h).
    users: CAST.map(({ id, name, role }) => ({
      id,
      name,
      role,
      token: client.generatePermanentUserToken({ user_id: id }),
    })),
  };

  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  done(`${config.users.length} non-expiring tokens → ${CONFIG_PATH}`);
  return config;
}

async function main(): Promise<void> {
  const apiKey = requireEnv('STREAM_API_KEY');
  const apiSecret = requireEnv('STREAM_API_SECRET');

  // The SDK's 3s default timeout is too tight for a burst of CRUD calls.
  const client = new StreamClient(apiKey, apiSecret, { timeout: 30_000 });

  console.log(`\nSetting up Stream app \x1b[36m${apiKey}\x1b[0m`);

  await ensureRoles(client);
  // fail before touching call types if any capability name is wrong
  await validateGrants(client, [EXAM_GRANTS, WHISPER_GRANTS, APP_GRANTS]);
  await configureAppGrants(client);

  await configureCallType(client, EXAM_CALL_TYPE, EXAM_GRANTS, {
    video: {
      enabled: true,
      camera_default_on: false,
      // A proctor watches ~10 students at two tracks each; publishers pushing 1440p would
      // be wasted bandwidth. Tiles request their own layer via dynascale on top of this.
      target_resolution: { width: 1280, height: 720, bitrate: 1_500_000 },
    },
    audio: {
      default_device: 'speaker',
      mic_default_on: false,
      access_request_enabled: true,
    },
    screensharing: { enabled: true, access_request_enabled: false },
    recording: { mode: 'available', quality: '1080p', audio_only: false },
    transcription: {
      mode: 'available',
      closed_caption_mode: 'available',
      language: 'en',
    },
    backstage: { enabled: false },
  });

  await configureCallType(client, WHISPER_CALL_TYPE, WHISPER_GRANTS, {
    // audio_room is backstage-on by default, which would require goLive()
    backstage: { enabled: false },
    // whisper conversations are recorded automatically; the client never toggles this
    recording: { mode: 'auto-on', quality: '720p', audio_only: true },
    audio: {
      default_device: 'speaker',
      mic_default_on: false,
      access_request_enabled: false,
    },
    // no camera is ever requested for the whisper call
    video: { enabled: false },
    screensharing: { enabled: false },
  });

  await configureChatGrants(client);
  await seedUsers(client);
  const config = await writeConfig(client, apiKey);

  console.log('\n\x1b[32m\x1b[1mSetup complete.\x1b[0m');
  console.log(`  ${config.users.length} users seeded, tokens written.`);
  console.log('  Next: create the Angular app (step 2), then `npm start`.\n');
}

main().catch((error: unknown) => {
  console.error('\n\x1b[31m\x1b[1mSetup failed.\x1b[0m');
  console.error(error instanceof Error ? error.message : error);
  // A config mistake is self-explanatory; anything else is worth a stack for debugging.
  if (!(error instanceof ConfigError) && error instanceof Error && error.stack) {
    console.error(`\n${error.stack.split('\n').slice(1).join('\n')}`);
  }
  console.error('');
  process.exitCode = 1;
});
