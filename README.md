# Stream Video + Angular — proctored exam demo

A customer-facing reference app for integrating [Stream Video](https://getstream.io/video/) with
Angular. There is no Angular Video SDK, so this drives the framework-agnostic
[`@stream-io/video-client`](https://www.npmjs.com/package/@stream-io/video-client) directly and
shows how its RxJS state maps onto Angular signals.

The scenario is a **proctored exam call**:

- **Students** publish their camera and their whole screen, and can message the room.
- **Proctors** watch a scrolling grid of every student's camera/screen pair, share the same chat,
  and can drop into a **proctors-only "whisper" audio channel** that mutes them in the exam call so
  students can't hear them.

---

## Status

Built in steps. Right now:

| Step | State |
|---|---|
| 1. Server-side setup script | **Done** — runs and verifies clean |
| 2. Angular app skeleton (config, services, directives, routing) | **Done** — builds, tests and serves |
| 3. User picker | **Done** — connects both Stream clients and routes to the lobby |
| 4. Lobby + exam call | **Done** — device setup, background blur, member pickers, both call layouts |
| 5. Chat in the exam call | **Done** — one room per call, stock components, dark theme |
| 6. Proctors-only whisper channel | **Done** — shared mode over custom events, verified across four clients |
| 7. Recording, captions, network badges | Not started |

`npm run setup`, `npm start`, `npm run build` and `npm test` all work.

---

## Prerequisites

- **Node.js 24.20.0** — pinned in `.nvmrc`. Angular CLI 22 requires ≥ 24.15.0 (or ≥ 22.22.3)
  and refuses to run below that, so with [nvm](https://github.com/nvm-sh/nvm):

  ```bash
  nvm install   # reads .nvmrc
  nvm use
  ```
- A **Stream app** with Video and Chat enabled, and its **API key + secret** from the
  [dashboard](https://dashboard.getstream.io).

---

## Running the setup

The setup script is server-side and runs once. It creates the roles, wires their capabilities onto
the call types and the chat channel type, seeds the fixed cast of users, and mints the tokens the
browser app reads at startup.

**1. Add your credentials.**

```bash
cp setup/.env.example setup/.env
```

Then edit `setup/.env`:

```ini
STREAM_API_KEY=your-key
STREAM_API_SECRET=your-secret
```

The secret is server-side only and must never reach the browser. `setup/.env` is gitignored.

**2. Run it.**

```bash
npm run setup      # installs setup/ dependencies, then runs the script
```

It is **idempotent** — safe to run as often as you like. Existing roles are reported as
`already exists`, and grants are read-modify-written so nothing else is clobbered.

**3. Check the result.**

```bash
npm run verify
```

This reads the live server state back and asserts 27 things: the app-level grants, both call types'
grants and settings, the chat channel-type grants, and the 14 seeded users. It also asserts that
`disable_permissions_checks` is `false` — if that flips on, every access-control guarantee below
silently stops being enforced and the demo would prove nothing.

Expected tail:

```
Seeded users
  PASS 4 proctors with role=proctor — proctor-john, proctor-maya, proctor-samir, proctor-greta
  PASS 10 students with role=student — 10 found
  PASS all ids prefixed by role
  PASS display names set

All checks passed
```

---

## Running the app

```bash
npm start        # dev server on http://localhost:4200
npm run build    # production build
npm test         # unit tests (Vitest)
```

The app reads `public/demo-config.json` at startup through `provideAppInitializer`, so it will not
render until the setup script has produced it. If you see an error telling you to run
`npm run setup`, that is why.

Pick any of the 14 seeded users on the first screen — that is the whole identity step. Proctors can
create exam calls; students can only join one they are a member of. A call link (`?call_id=…`)
survives the picker, so a student arriving on one is taken straight to it after choosing who to be.

### The walkthrough

Two browser profiles is enough for most of it; the whisper channel wants three.

1. **Proctor**: pick `proctor-john`, set up camera and mic (background blur is optional), leave all
   ten students selected, add a second proctor, then **Start exam call**. Copy the link.
2. **Student**: open the link in another profile, pick `student-tom`, join. The camera is forced on
   for the exam; press **Share screen** and choose *Entire screen*. The proctor's column for that
   student turns from red to live.
3. **Chat**: the room is open by default on both sides — same channel, created beside the call with
   the same roster.
4. **Whisper**: as a proctor, press **Whisper**. Every proctor's panel opens and every proctor's exam
   mic mutes, so the student hears nothing; only whoever pressed it is audible to the others. Anyone
   can unmute inside the panel. **Go back to students** takes *everyone* out and restores each
   proctor's own previous mic state. Two things worth trying: bring a third proctor in while the
   first two are whispering — they arrive with the panel already up and their mic already muted,
   having received no event — and then have everyone mute themselves in the panel. The channel goes
   silent and *nobody* drops out of it, because only **Go back to students** ends it.
5. **End exam** ends both calls for everyone.

Background-filter models (~26 MB) are copied into `app/public/mediapipe/` by a `postinstall` hook,
so the filters load from your own origin instead of a CDN. That directory is generated and
gitignored.

---

## What the setup script does

Source: [`setup/src/setup.ts`](./setup/src/setup.ts), with the role model in
[`grants.ts`](./setup/src/grants.ts) and the cast in [`cast.ts`](./setup/src/cast.ts).

### 1. Four roles

| Role | Scope | Capabilities |
|---|---|---|
| `student` | application-level | **none** |
| `proctor` | application-level | `create-call` **only** |
| `call_member_proctor` | call-level (a member's `role`) | the proctor's in-call set, per call type |
| `call_member_student` | call-level (a member's `role`) | the student's in-call set, per call type |

The split is the point. The application-level role decides only *whether you may start a call*;
everything you can do **inside** a call comes from your **membership** role. Because neither
app-level role carries `join-call`, **call membership is the access-control list and it is enforced
server-side** — a student who was never added to an exam cannot join it, and no student can reach
the proctors' whisper channel. Not because the UI hides a button.

A useful side effect: nothing is ever revoked from the built-in `user` role, so this script never
mutates shared defaults on your API key.

### 2. Capabilities, per call type

Only what the demo actually calls:

```
call_member_student   join-call, read-call, send-audio, send-video, screenshare
call_member_proctor   ...the same, plus start-recording, stop-recording,
                      start-closed-captions, stop-closed-captions, end-call
```

On `audio_room` (the whisper channel) only `call_member_proctor` gets anything at all:
`join-call, read-call, send-audio, send-event, end-call`.

`send-event` is the one to know about. It is what `call.sendCustomEvent()` needs, the whisper mode
is shared between proctors by exactly one custom event — and there is **no `OwnCapability` entry
for it**, so there is nothing to grep for in the SDK; the id only shows up in `listPermissions()`.
Its neighbour `send-custom-event` is Chat's permission for `channel.sendEvent()`, not this one.

### 3. Call type settings

- **`default`** — the exam call. Camera and mic off on join (the lobby decides), screen sharing on,
  recording and closed captions `available` so a proctor can toggle them, backstage off. Publish
  resolution pinned to **1280×720** — a proctor watches ~10 students at two tracks each, so
  publishers pushing 1440p would be wasted bandwidth.
- **`audio_room`** — the whisper channel. Video and screen sharing **disabled** so no camera is ever
  requested, backstage **off** (the default would require `goLive()`), mic off on join, and
  recording `auto-on` and audio-only, so whisper conversations are captured without a UI toggle.

  **Two things to know about `auto-on` here.** It is blunt: with backstage off, recording starts the
  moment the first proctor enters the exam route, not when anyone whispers — so it records near-total
  silence for the length of the exam, billed per minute plus storage, on every demo run. The
  alternative is `mode: 'available'` driven explicitly (`startRecording()` on `whisper.start`,
  `stopRecording()` on `whisper.end`, which the shared-mode design makes trivial), capturing the same
  interesting audio for a fraction of the minutes. And **wear headphones**: exam audio playing through
  speakers while the whisper mic captures means student voices can bleed into the whisper recording.
  Echo cancellation helps but is imperfect, and for a compliance-flavoured feature that is not a claim
  worth making by accident. The app ducks the exam call to 20% volume while whispering for the same
  reason.

### 4. Chat grants

A brand-new custom role has **no chat capabilities at all**, and chat capabilities live in a
separate grant map from the video ones. The script clones what the built-in `user` role can do in
`messaging` onto `proctor` and `student`. Skip this and the chat panel fails silently.

### 5. Users and tokens

Four proctors and ten students (`proctor-john`, `student-tom`, …), each with a display name — the UI
renders initials from it, so no avatar URLs are needed. Tokens are minted with
`generatePermanentUserToken`, so they carry **no `exp` claim** and won't expire mid-demo.

Everything the browser needs is written to **`app/public/demo-config.json`**:

```json
{
  "apiKey": "…",
  "generatedAt": "2026-09-04T09:27:52.162Z",
  "users": [{ "id": "proctor-john", "name": "John", "role": "proctor", "token": "…" }]
}
```

That file is **gitignored** — it holds non-expiring user tokens.

---

## The whisper channel

The one part of this demo that is genuinely hard, and the reason it is worth reading.

A proctor is joined to **two calls at once**: the exam call (`default:<callId>`) and a proctors-only
audio channel (`audio_room:<callId>`, same id). One `StreamVideoClient` holds both — it tracks a
*list* of calls with no "active call" concept, and the join-once guard is per-`Call` instance.
Both are created together in the lobby, so their rosters cannot drift, and students are never
members of the second one. Nothing is stored in either call's `custom` data — the call *type* is what
tells them apart, so a `mode` field would carry no information, and `getOrCreate` overwrites custom
data on an existing call, so writing one would also be a small hazard.

**Mode is global to the call, not per-user.** One proctor pressing *Whisper* puts every proctor into
the channel; one proctor pressing *Go back to students* takes every proctor out and mutes every
whisper microphone. That symmetry is the whole safety argument: there is never a moment where one
proctor is unmuted to the students while colleagues are still whispering, so no whisper audio can
reach a student through an open exam microphone. Every proctor in the channel is muted in the exam
call, including one who is only listening and never pressed anything.

It is signalled **two ways, on purpose**:

1. **A custom WS event** (`sendCustomEvent({ type: 'whisper.start' | 'whisper.end', by, at })`) is the
   fast path. It arrives on every watching client as the SDK event named `'custom'`, with the payload
   under `event.custom` — so the discriminator has to live *inside* the payload, not in the event name.
   The sender is not echoed its own event, so the initiator applies its change optimistically and the
   handler is idempotent; the `at` timestamp stops a late `whisper.start` resurrecting a mode someone
   just closed.
2. **Anyone already publishing audio in the whisper call**, derived from `participants$`. This is the
   condition a one-shot event cannot cover: a proctor who joins mid-whisper, or whose client
   reconnects, receives no event at all. Participant state, by contrast, is *replayed* — hydrated from
   the SFU join response — so it is already correct on that client's first emission.

**Hearing the channel is a way *in* to the mode, never a way out of it.** This is the subtle one, and
the easy mistake is to write the panel condition as a live `mode || someoneAudible` — which
reintroduces the very leak the shared mode removes. A proctor who joined mid-whisper has `mode ===
false`; their panel is open *only* because of the audio. The moment every colleague happens to mute
themselves in the panel — mode still on for all of them, free to unmute a second later — that
disjunction goes false, so this proctor's panel closes and their exam microphone comes back, alone,
into a channel that is still live. Audio going quiet says nothing about whether the mode is over. So
audio **latches** the mode, on the rising edge, and only a `whisper.end` clears it.

The rising edge matters in the other direction too: after `whisper.end` the remote tracks are still
stopping, so the audio flag stays `true` for a moment and emits nothing new — it cannot re-latch what
was just closed. A live check there would deadlock the exit.

The audio condition keeps one narrower job: **holding the exam microphone shut through the tail.**
`whisper.end` closes the panel at once, but a colleague's track takes a moment to stop, and opening
this microphone into that tail is how the last fragment of a whisper reaches the students. Hence two
signals, each named for what it does — `panelOpen` (the mode) and `examMicHeld` (the mode, plus the
tail).

A proctor also *joins the exam call muted* regardless of their lobby setting, and is unmuted by the
reconciler once the whisper state is known — otherwise they publish to the students for the fraction
of a second in between.

**The two controls send before they apply**, and change nothing locally if the event is refused.
Optimism is tempting here and it is wrong twice over: unmuting the whisper mic while the request is
in flight would latch every *other* proctor into a mode by the audio they briefly heard, with the
proctor who started it showing no panel and no way to end it; and leaving the mode locally before
`whisper.end` is accepted is what brings *your* exam mic back while colleagues are still whispering.
Both fail closed, for a round trip of button latency.

**Both microphones are driven by one single-flight reconciler**, not by an effect:
`toObservable(desired).pipe(distinctUntilChanged(), concatMap(reconcile))`. `concatMap`, never
`switchMap` — a half-finished hand-off must not be abandoned. It releases before it acquires in both
directions, re-reads the intent after its awaits in case you clicked again, and falls back to muted
in *both* calls if `enable()` throws. The SDK cannot serialise this for you: `statusChangeSettled` is
per-manager, and cancellation does not abort an in-flight `unmuteStream()` — it finishes
`getUserMedia` and publishes.

**A failed whisper join is blocking for a proctor, not best-effort.** Not for tidiness: the interlock
above reads the whisper call's participants, which only carry data while you are joined. A proctor in
the exam call but *not* the whisper call cannot tell that colleagues are whispering, has no reason to
mute, and their open microphone is exactly how whisper audio would reach the students. So the mic is
held shut and the route is blocked, with Retry and Leave.

`endCall()` marks one call ended and the auto-leave is per-call, so **nothing cascades**: "End exam"
ends both, and the whisper call is also torn down whenever the exam call reaches a terminal state. The
whisper channel must never outlive the exam.

Files: [`whisper-call.ts`](./app/src/app/core/stream/whisper-call.ts) (create / prepare / join),
[`whisper-session.ts`](./app/src/app/features/exam-call/whisper/whisper-session.ts) (state machine and
reconciler, with [tests](./app/src/app/features/exam-call/whisper/whisper-session.spec.ts)),
[`whisper-panel.ts`](./app/src/app/features/exam-call/whisper/whisper-panel.ts) (the UI).

---

## Demo-only shortcuts

Two things here are deliberately not production patterns:

1. **Non-expiring tokens in a file the browser can fetch.** This is a client-side demo with no
   backend, so `demo-config.json` ships every user's token. A real app never does this: tokens are
   minted per-user by your server and the client is given a
   [**token provider**](https://getstream.io/docs/platform/authentication/#token-providers) — a
   function the SDK calls to fetch and silently refresh them. See
   [Token Providers](https://getstream.io/docs/platform/authentication/#token-providers) and
   [Automatic Token Expiration](https://getstream.io/docs/platform/authentication/#setting-automatic-token-expiration).
2. **A fixed cast picked from a list**, instead of signing in. Picking a user *is* the whole identity
   step, which keeps the demo focused on the video integration.

---

## Troubleshooting

**`STREAM_API_KEY is not set`** — you haven't created `setup/.env`. Copy `setup/.env.example`.

**`Token signature is invalid` (401)** — the secret in `setup/.env` doesn't match the API key.

**The chat panel renders light on the dark call screens** — the theme is owned by
`stream-chat-angular`, not by your CSS: `ChannelComponent` stamps
`class="str-chat__theme-{{ theme$ }}"` on its own root, defaulting to `light`. Putting the dark
class on an ancestor has no effect. Switch it with `ThemeService.theme$.next('dark')`.

**The chat panel is empty and receives no messages** — `ChannelService.setAsActiveChannel()` makes
no network request; it reads local state. `await channel.watch()` first.

**The member pickers on the create screen are empty (no error)** — the `proctor` role is missing
the `search-user` permission. App-level grants are one map shared across products, so a
hand-authored list silently drops the chat capabilities; the setup script clones the built-in
`user` role's baseline for exactly this reason.

**`is not allowed to perform this action` when creating a call** — `create-call` has to be granted
on the **call type**, not only at app level. A call type's grants map governs actions on calls of
that type.

**`cannot use unknown permission "..."`** — call-type grants take **permission ids**, which are *not*
the same vocabulary as the `OwnCapability` values a client reads back in `own_capabilities`. They
overlap for most entries, but the recording and caption ones drop the `-call` suffix:
`start-recording`, not `start-record-call`. The script validates every id against
`listPermissions()` before writing anything and names the near-matches, so you get a readable
message rather than a partial write. Run with `LIST_PERMISSIONS=1` to print all valid ids.

**`settings.video.target_resolution.height must be 240 or greater`** — `target_resolution` is typed
optional but behaves as required: sending a `video` block without it makes the server read 0×0.
`configureCallType` carries the current value forward, so you should only see this if you add a new
call type by hand.

**A proctor drops out of the whisper channel on their own when everyone stops talking** — the panel
condition is treating "somebody is publishing audio" as a live state rather than as a way *in*. A
proctor who joined mid-whisper is in the mode only because of that audio, so when colleagues mute
themselves the condition goes false and that proctor's microphone opens into a channel that is still
live. Latch the mode on the rising edge and clear it only on the explicit end event.

**`not allowed to perform action SendEvent`** — `send-event` is missing from the call type's grants.
`sendCustomEvent()` needs it, and there is no `OwnCapability` entry for it, so it is easy to leave
out; without it the shared whisper mode silently opens for nobody but the initiator.

**Everyone sits on "Joining…" after End exam** — the SDK auto-leaves when a call ends, so
`callingState` goes `LEFT` and a naive "not joined yet" guard renders forever. There is no separate
event to wait for: the terminal state *is* the notification, so distinguish "we left" from "the call
ended under us" and render an ended state for the second case.

**A ghost participant lingers after a refresh or tab close** — the client registers no
`beforeunload`/`pagehide` handler of its own (its only `window` listeners are `online`/`offline`), so
neither call is left and the SFU waits out its disconnection timeout. This app registers `pagehide`
(not `beforeunload` — unreliable on mobile, and it kills the back/forward cache) and leaves both calls
best-effort. Be clear-eyed about it: `leave()` cannot *finish* during unload. Its value is stopping
the local tracks and getting an explicit leave frame to the SFU.

**The member pickers find no users** — check the app setting `user_search_disallowed_roles` doesn't
include `proctor`. The pickers use chat's `queryUsers` with a role filter, and that setting blocks
it. The setup script warns about this.

---

## Key Stream documentation

The three the integration hinges on:

- **[Permissions & moderation](https://getstream.io/video/docs/javascript/guides/permissions-and-moderation/)** —
  roles, capabilities, and how `own_capabilities` is computed.
- **[Call types & settings](https://getstream.io/video/docs/javascript/guides/configuring-call-types/)** —
  what each type enables, plus the API reference for
  [settings](https://getstream.io/video/docs/api/call-types/settings/),
  [grants & permissions](https://getstream.io/video/docs/api/call-types/permissions/) and
  [the built-in types](https://getstream.io/video/docs/api/call-types/builtin/).
- **[Authentication & token providers](https://getstream.io/docs/platform/authentication/)** —
  generating tokens, call tokens, token providers, expiration.

Note the authentication page's warning that **call tokens grant access, they do not restrict it** —
capability has to come from a role. This demo is a worked example: the app-level `student` and
`proctor` roles carry no `join-call`, so the `call_member_*` roles *are* the ACL.

Also relevant, all under [`/video/docs/javascript/`](https://getstream.io/video/docs/javascript/):
[Client & auth](https://getstream.io/video/docs/javascript/guides/client-auth/) ·
[Joining & creating calls](https://getstream.io/video/docs/javascript/guides/joining-and-creating-calls/) ·
[Call & participant state](https://getstream.io/video/docs/javascript/guides/call-and-participant-state/) ·
[Playing video & audio](https://getstream.io/video/docs/javascript/guides/playing-video-and-audio/) ·
[Camera & microphone](https://getstream.io/video/docs/javascript/guides/camera-and-microphone/) ·
[Screen sharing](https://getstream.io/video/docs/javascript/guides/screensharing/) ·
[Visibility tracking](https://getstream.io/video/docs/javascript/guides/visibility-tracking/) ·
[Sorting API](https://getstream.io/video/docs/javascript/guides/sorting-api/) ·
[Closed captions](https://getstream.io/video/docs/javascript/guides/closed-captions/) ·
[Recording](https://getstream.io/video/docs/javascript/advanced/recording/) ·
[Call stats](https://getstream.io/video/docs/javascript/advanced/stats/) ·
[Network disruption](https://getstream.io/video/docs/javascript/advanced/network-disruption/) ·
[Custom events](https://getstream.io/video/docs/javascript/guides/custom-events/) ·
[Chat with video](https://getstream.io/video/docs/javascript/advanced/chat-with-video/)

Reference implementations worth reading:

- [`react-dogfood`](https://github.com/GetStream/stream-video-js/tree/main/sample-apps/react/react-dogfood) —
  Stream's own full-featured app; the benchmark for a complete integration.
- [`ts-quickstart`](https://github.com/GetStream/stream-video-js/tree/main/sample-apps/client/ts-quickstart) —
  plain TypeScript on `@stream-io/video-client`, so the closest thing to framework-free.
- [`angular-video-calling-app`](https://github.com/GetStream/angular-video-calling-app) — the
  existing Angular sample, useful for the video/audio element binding pattern.
