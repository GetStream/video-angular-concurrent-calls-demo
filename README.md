# Stream Video + Angular — proctored exam demo

A reference Angular app that uses the framework-agnostic
[`@stream-io/video-client`](https://www.npmjs.com/package/@stream-io/video-client) directly. It
shows how to connect the SDK's RxJS state to Angular signals in a proctored-exam experience.

## What it demonstrates

- Students publish their camera and entire screen, and share a chat with their proctors.
- Proctors monitor each student's camera/screen pair, can record and enable captions, and see
  connection quality.
- Proctors can join a separate, audio-only whisper call. Their exam microphones are held muted so
  students cannot hear the conversation.
- Call membership, rather than UI role checks, controls who can join and what they can do.

## Quick start

> [!WARNING]
> Use a dedicated, empty Stream app. The setup script updates the built-in `default` and
> `audio_room` call types, the `messaging` channel type, and app-level role configuration. Do not
> point it at a production app. See [setup impact and permissions](./docs/setup-and-permissions.md)
> for the complete list.

### Prerequisites

- Node.js 24.20.0, as pinned in `.nvmrc`.
- A Stream app with Video and Chat enabled, plus its API key and secret from the
  [Stream dashboard](https://dashboard.getstream.io).

With [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm install
nvm use
```

Install the Angular workspace, create the server-only setup configuration, then seed the demo:

```bash
npm --prefix app install
cp setup/.env.example setup/.env
```

Set these values in `setup/.env`:

```ini
STREAM_API_KEY=your-key
STREAM_API_SECRET=your-secret
```

```bash
npm run setup
npm run verify
npm start
```

`npm run verify` should finish with `All checks passed`. The app is then available at
http://localhost:4200. `npm run build` creates a production build and `npm test` runs the Vitest
suite.

`npm run setup` is idempotent. It creates the demo roles and users, applies the required grants and
call settings, and writes `app/public/demo-config.json`. That file contains demo-only tokens, is
gitignored, and must never be committed.

> `app/.npmrc` configures the required peer-dependency behavior for Angular 22. No extra install
> flag is necessary.

## Try the demo

Use two browser profiles for the main flow; use a third profile to exercise whisper recovery.

| Try | Expected result |
| --- | --- |
| Start an exam as `proctor-john` | Select students and at least one more proctor, then copy the call link. |
| Join as `student-tom` | Join from the link, then share the **Entire screen**. The proctor's student tile becomes live. |
| Send a chat message | Both roles use the same channel and roster. |
| Press **Whisper** as a proctor | All proctor exam microphones mute and the proctors-only audio panel opens. **Go back to students** closes it for everyone. |
| Record or enable captions | The controls appear only when the call grants the capability; the `REC` indicator appears for everyone. |
| Toggle the browser offline | The call remains visible and shows an offline banner rather than returning to a join spinner. |
| Open **Recordings** after the call | A proctor can fetch recordings for each call they attended. Whisper rows are audio-only. |

The optional background-filter models are copied into `app/public/mediapipe/` during `postinstall`.
The generated directory is gitignored.

## Design highlights

- **Membership is the access-control list.** App roles decide who may create a call; per-call
  membership roles decide who may join and which in-call capabilities they have. Students are never
  members of the whisper call. [Details →](./docs/setup-and-permissions.md#permission-model)
- **Angular reads SDK state through signals.** `CallFacade` translates call observables into signals,
  while directives own the imperative media-element bindings. [Architecture →](./docs/architecture.md)
- **Whisper is designed around safety invariants.** A shared mode, an event plus SFU-state recovery,
  and serialized microphone transitions prevent whisper audio reaching students. [Whisper design →](./docs/whisper-channel.md)
- **Recording and reconnects are asynchronous.** Capability gates, event-driven pending state, and a
  latched joined state keep the controls and layout accurate. [Runtime details →](./docs/architecture.md#recording-captions-and-reconnects)

## Demo boundaries

This app deliberately uses a fixed cast and non-expiring tokens that the browser can fetch. It has
no backend or real authentication. In a production app, mint user-scoped, expiring tokens on your
server and use a [token provider](https://getstream.io/docs/platform/authentication/#token-providers).
The custom roles are specific to this scenario; design permissions for your own access model.

## Further reading

- [Setup impact and permissions](./docs/setup-and-permissions.md)
- [Angular and SDK architecture](./docs/architecture.md)
- [Whisper-channel design](./docs/whisper-channel.md)
- [Troubleshooting](./docs/troubleshooting.md)
- [Stream permissions & moderation](https://getstream.io/video/docs/javascript/guides/permissions-and-moderation/)
- [Stream call types & settings](https://getstream.io/video/docs/javascript/guides/configuring-call-types/)
- [Stream authentication & token providers](https://getstream.io/docs/platform/authentication/)

The main implementation entry points are
[`setup/src/setup.ts`](./setup/src/setup.ts),
[`app/src/app/core/stream/call-facade.ts`](./app/src/app/core/stream/call-facade.ts), and
[`app/src/app/features/exam-call/whisper/whisper-session.ts`](./app/src/app/features/exam-call/whisper/whisper-session.ts).
