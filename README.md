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

## Prerequisites

- **Node.js 24.20.0** — pinned in `.nvmrc`. Angular CLI 22 requires ≥ 24.15.0 (or ≥ 22.22.3)
  and refuses to run below that, so with [nvm](https://github.com/nvm-sh/nvm):

  ```bash
  nvm install   # reads .nvmrc
  nvm use
  ```

- A **Stream app** with Video and Chat enabled, and its **API key + secret** from the
  [dashboard](https://dashboard.getstream.io).

  > **Use an empty app, or one created for this demo.** The setup script does not only _add_
  > things — it **rewrites** configuration that is global to the Stream app. Point it at a
  > production app and it will change how that app behaves. Details in
  > [What it changes in your Stream app](#what-it-changes-in-your-stream-app).

**Install the dependencies.** `npm run setup` installs `setup/`, but the Angular app is a
separate workspace:

```bash
npm --prefix app install
```

`app/.npmrc` pins `legacy-peer-deps=true`, and that is deliberate rather than laziness:
`stream-chat-angular` pulls in `ngx-float-ui`, which has no Angular 22 build yet, so npm's peer
resolution fails without it. Stream documents exactly this flag for Angular 22. It lives in
`.npmrc` rather than in a remembered CLI flag so every install behaves the same.

---

## Running the setup

The setup script is server-side and runs once. It creates the roles, wires their capabilities onto
the call types and the chat channel type, seeds the fixed cast of users, and mints the tokens the
browser app reads at startup.

> **⚠️ Point this at an empty Stream app.** Some of what it writes is **global to the app**, not
> scoped to this demo: it rewrites the grants _and settings_ of the built-in `default` and
> `audio_room` call types, the grants of the `messaging` channel type, and the app-level grants of
> the roles it creates. Anything else using that Stream app inherits every one of those changes.
> The full list is in [What it changes in your Stream app](#what-it-changes-in-your-stream-app) — read it
> before running this against an app you care about.

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

This reads the live server state back and asserts 38 things: the app-level grants, both call types'
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
npm --prefix app install   # once, if you haven't already
npm start                  # dev server on http://localhost:4200
npm run build              # production build
npm test                   # unit tests (Vitest)
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
   for the exam; press **Share screen** and choose _Entire screen_. The proctor's column for that
   student turns from red to live.
3. **Chat**: the room is open by default on both sides — same channel, created beside the call with
   the same roster.
4. **Whisper**: as a proctor, press **Whisper**. Every proctor's panel opens and every proctor's exam
   mic mutes, so the student hears nothing; only whoever pressed it is audible to the others. Anyone
   can unmute inside the panel. **Go back to students** takes _everyone_ out and restores each
   proctor's own previous mic state. Two things worth trying: bring a third proctor in while the
   first two are whispering — they arrive with the panel already up and their mic already muted,
   having received no event — and then have everyone mute themselves in the panel. The channel goes
   silent and _nobody_ drops out of it, because only **Go back to students** ends it.
5. **Recording and captions**: as a proctor, the record and `CC` buttons appear in the control
   bar; a student's do not, because the buttons render off `own_capabilities` rather than off a
   role check. Start recording and the `REC` badge appears in **everyone's** header — the
   indicator is deliberately not capability-gated.
6. **Connection status**: your own connection quality and round-trip time sit in the header, and
   every student tile carries quality bars. Take a client offline in devtools and the call stays
   on screen under a _"You're offline"_ banner rather than resetting to a spinner.
7. **End exam** ends both calls for everyone.
8. **Settings**: the gear in the control bar opens the same device pickers and background choice
   the lobby showed. Switch microphone mid-call and nothing drops; for a proctor the choice is
   applied to the whisper channel too, because device state is per-call.
9. **Recordings**: back in the lobby, the header now has a **Recordings** link (proctors only).
   It lists the calls you were on; press **Fetch recordings** on one to ask that call for its
   recordings. The whisper channel's rows are marked, and they will be longer than the exam's —
   `auto-on` records the whole channel, not just the whispering.

Background-filter models (~26 MB) are copied into `app/public/mediapipe/` by a `postinstall` hook,
so the filters load from your own origin instead of a CDN. That directory is generated and
gitignored.

---

## What the setup script does

Source: [`setup/src/setup.ts`](./setup/src/setup.ts), with the role model in
[`grants.ts`](./setup/src/grants.ts) and the cast in [`cast.ts`](./setup/src/cast.ts).

### What it changes in your Stream app

Read this before pointing the script at a Stream app you care about. It is idempotent and it
read-modify-writes rather than replacing wholesale, but some of what it writes is **global to the
app** rather than scoped to this demo.

**Global to the Stream app** — anything else using this app sees these:

| Change                                                                                                                                                                                                                            | Scope                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Grants for `default` and `audio_room` — the `call_member_proctor` / `call_member_student` / `proctor` / `student` entries                                                                                                         | those two **built-in call types**                  |
| Settings for `default`: publish resolution pinned to **1280×720 @ 1.5 Mbps**, camera and mic off on join, screen sharing on, recording `available` at 1080p, transcription and closed captions `available` in `en`, backstage off | the built-in `default` call type                   |
| Settings for `audio_room`: recording **`auto-on`**, audio-only, 720p; video and screen sharing disabled; mic off on join and the request-to-speak flow disabled; backstage off                                                    | the built-in `audio_room` call type                |
| Grants for `proctor` and `student` on the `messaging` channel type                                                                                                                                                                | that **chat channel type**                         |
| App-level grants for the `proctor` and `student` roles                                                                                                                                                                            | app-wide role config                               |
| Four custom roles created: `student`, `proctor`, `call_member_proctor`, `call_member_student`                                                                                                                                     | app-wide (a Stream app allows **25** custom roles) |
| 14 users upserted, each with a **non-expiring** token                                                                                                                                                                             | app-wide user list                                 |

**Deliberately left alone:** the built-in `user`, `admin`, `host`, `moderator` and `call_member`
roles keep their call-type grants untouched, and the app-level grant map is read-modify-written so
no other role's entries are dropped. Nothing is ever _revoked_ from `user` — the access-control
design (see below) is built so that it never has to be.

It also writes nothing it was not asked to: `updateCallType` requires `video.target_resolution`
even on a partial update (omit it and the server reads 0×0 and rejects the request), and
`updateChannelType` requires `automod`, `automod_behavior` and `max_message_length` even when you
only want to change grants — so the script reads the current values and carries them forward rather
than guessing defaults and silently reconfiguring moderation.

Two settings the script deliberately does not change, and which it asserts instead:
`disable_permissions_checks` must be `false` — every access-control guarantee in this README is
vacuous if it flips — and `user_search_disallowed_roles` must not include `proctor`, or the
member pickers silently return nothing.

### 1. Four roles

| Role                  | Scope                          | Capabilities                             |
| --------------------- | ------------------------------ | ---------------------------------------- |
| `student`             | application-level              | **none**                                 |
| `proctor`             | application-level              | `create-call` **only**                   |
| `call_member_proctor` | call-level (a member's `role`) | the proctor's in-call set, per call type |
| `call_member_student` | call-level (a member's `role`) | the student's in-call set, per call type |

The split is the point. The application-level role decides only _whether you may start a call_;
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
                      list-recordings, start-closed-captions,
                      stop-closed-captions, end-call
```

On `audio_room` (the whisper channel) only `call_member_proctor` gets anything at all:
`join-call, read-call, send-audio, send-event, end-call, list-recordings`.

**Two of those ids have no `OwnCapability` counterpart at all**, which makes them the two easiest
to miss in the whole setup — there is nothing to grep for in the SDK, and they show up only in
`listPermissions()`:

- `send-event` is what `call.sendCustomEvent()` needs, and the whisper mode is shared between
  proctors by exactly one custom event. Without it the whisper opens for nobody but the initiator.
  Its neighbour `send-custom-event` is Chat's permission for `channel.sendEvent()`, not this one.
- `list-recordings` is what the [Recordings screen](#the-recordings-screen) needs. Because there is
  no capability to read back, that screen cannot gate itself the way the record and caption buttons
  do — see that section for what stands in.

Both are granted **per call type**, and that is not a formality: with `list-recordings` on `default`
only, the recordings screen listed the exam videos and was refused the whisper audio with
_"not allowed to perform action ListRecordings in scope 'video:audio_room'"_.

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
  "users": [
    { "id": "proctor-john", "name": "John", "role": "proctor", "token": "…" }
  ]
}
```

That file is **gitignored** — it holds non-expiring user tokens.

---

## Architecture: the Angular ↔ RxJS seam

There is no Angular Video SDK. `@stream-io/video-client` is framework-agnostic and exposes its
state as RxJS observables and its media binding as imperative calls that return teardown
functions. Everything below is about that one seam, and it is the part of this demo worth copying.

### `CallFacade` — one signal view over one call

[`core/stream/call-facade.ts`](./app/src/app/core/stream/call-facade.ts) turns a `Call`'s
observables into signals, and it is a **plain instantiable class rather than a service**: a proctor
holds two calls at once (the exam call and the whisper channel), and both must tear down together.
It takes the route's `Injector` explicitly, so every subscription behind it dies when the route
does.

**The consumption rule for the whole app: template state comes from `toSignal`.** Three paths
differ, and the difference is easy to miss:

- `toSignal(obs)` marks consumers dirty through the signal graph.
- `obs | async` calls `markForCheck()`, which flags the ancestor chain.
- `obs.subscribe(v => this.x = v)` marks **nothing**. Under OnPush the view simply never refreshes.

The last one _looks_ fine under default change detection, because zone.js ticks anyway — which is
exactly how it breaks the moment someone flips a component to OnPush. And OnPush is the Angular CLI
default.

Held to literally, that leaves the app with **two** bare `.subscribe()` calls in the whole
codebase, both in the whisper session and neither feeding a template: the latch that puts you into
whisper mode when you hear the channel, and the queue that serialises microphone hand-offs. Media
binding is an `effect` in a directive, preference persistence is an `effect`, and everything a
template reads — device lists, `browserPermissionState$`, device status — goes through `toSignal`.

Two details inside the facade that are load-bearing rather than tidy:

- **`distinctUntilChanged()` before every `toSignal`, with the comparator chosen per stream.**
  The client throttles nothing, and `audioLevelChanged` patches every participant's audio level on
  every event. The bare form compares with `===`, which filters the scalars only: the store rebuilds
  every collection on each patch, so `participants$` and its neighbours emit a fresh array reference
  each time. `ownCapabilities$`, `members$` and `closedCaptions$` take an element-wise comparator,
  which is what stops `can()` invalidating several times a second for a value that changes once a
  call. `participants$` takes none — `audioLevel` and `isSpeaking` really do change per event, so
  **project to the scalar you need and dedupe _that_**, which is what `derive()` is for and why
  `latencyMs` and `connectionQuality` are built with it. The rule holds outside the facade too:
  anything feeding an `effect()` off `participants()` needs a value-based identity.
- **Nothing calls `setPreferredIncomingVideoResolution`.** Reaching for it to cap the small camera
  tiles is the obvious move and the wrong one: its dimension _replaces_ the measured one
  (`override?.dimension ?? p.videoDimension`) rather than capping it, so a fixed number competes
  with what `bindVideoElement` already measures — and a 304×176 tile asking for 320×240 requests a
  higher layer than it can display. It is also a second source of truth for a size the CSS owns.
  Leave dynascale alone and it tracks the element, including down to nothing when a column scrolls
  out of the viewport. The API is for a deliberate, user-driven quality cap, and it is set-once:
  it ends in `apply()`, which clears and reschedules the single 1200 ms debounce every
  track-subscription update waits on, so driving it from an `effect()` starves that queue.
- **The latency badge is what keeps the stats poller alive.** The SDK's collection loop runs every
  2 s but skips the work unless `callStatsReport$` has an observer — its own comment calls stats
  expensive — so a lazily-subscribed badge reads zero forever. `toSignal` subscribes eagerly, so
  `latencyMs` in the facade is enough to hold the stream open. Publisher RTT is the only thing this
  app reads out of the report, which makes the trade visible: drop the badge and `latencyMs` and
  the sweep stops. `connectionQuality` is unaffected — it comes from `participants$`.

Capabilities always come from `ownCapabilities$`, never from a cached join response: the observable
merges the coordinator's list with the SFU's grants.

### Directives, not templates, for media

The binding API is imperative and returns teardown functions, which makes directives the right
seam — [`shared/directives/`](./app/src/app/shared/directives):

| Directive           | Wraps                                         | Why it matters                                                                                                                                                               |
| ------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[appVideoTrack]`   | `bindVideoElement` + `trackElementVisibility` | `bindVideoElement` also drives dynascale: it observes the element's real size and asks the SFU for a matching layer. That is what makes ten students × two tracks affordable |
| `[appAudioTrack]`   | `bindAudioElement`                            | audio is subscribed whether or not an element is bound, so _not_ binding gives you a call that looks fine and is silent                                                      |
| `[appCallViewport]` | `setViewport`                                 | goes on the element that **contains** every tracked tile, not on a scroller: `observe()` skips anything the root does not `contains()` and still returns a cleanup function, so a tile outside it looks tracked and is not |

Remote audio lives in a **permanently mounted, visually hidden** `<app-audio-sink>` rather than
inside each tile: audio has to keep playing for people with no tile on screen, and a
conditionally-rendered host drops the first moment of speech every time it appears — which is also
why the whisper sink sits outside `panelOpen()`. The `<audio>` elements inside it follow `hasAudio`
/ `hasScreenShareAudio`, as `ParticipantsAudio` does in the React SDK: each binding opens three
subscriptions over `participants$`, so an element per muted participant is per-frame work for
nothing. `hasAudio` reads `publishedTracks`, signalled before media flows, so the element is in
place ahead of the first sample.

### The lobby never joins a call

Device managers are constructed eagerly in the `Call` constructor and publishing is gated on
`callingState === JOINED`, so the lobby needs no server round-trip at all: `camera.enable()` there
just acquires a local stream. The lobby and the call route then share the _same_ `Call` instance
via `reuseInstance`, which is the whole handoff — camera already running, background filter already
registered, nothing re-acquired and no flicker.

Background blur wires [`@stream-io/video-filters-web`](https://www.npmjs.com/package/@stream-io/video-filters-web)
straight to `camera.registerFilter()`, which is what React's `BackgroundFiltersProvider` reduces to.
`isMediaPipePlatformSupported()` gates the control entirely, and because the instance is shared the
filter survives the transition into the call.

### One set of device pickers, two places

The microphone / camera / speaker selects and the background choice live in
[`DeviceControls`](./app/src/app/shared/components/device-controls/device-controls.ts), used by the
lobby and by the in-call **Settings** dialog — so "the same pickers" is the same component, not a
copy that drifts. The lobby wraps it in a camera preview and mute toggles; in a call your own tile is
already on screen, so the dialog has no preview.

Three decisions in there are worth the words:

- **Selection has to reach every call the user holds.** `MicrophoneManager` and `SpeakerManager`
  state is per-`Call`, and a proctor is in two calls at once. Choosing a headset on only the exam
  call would leave the whisper channel capturing from the old microphone and half the audio playing
  out of the old output, so the dialog passes the whisper call as a `mirrorTo` target and mic and
  speaker selection is applied to both. The **camera is deliberately not mirrored**: the whisper
  call has `video.enabled: false` and never publishes video, which is also why the background filter
  registers on the exam call only.
- **Selecting a device on a muted call is still worth doing.** `select()` on a disabled microphone
  stores the choice without acquiring anything, so the next unmute uses the device the user picked
  rather than the system default.
- **The dialog is a plain `MatDialog` on the app's light surface, over the dark call UI**, and that
  is deliberate rather than an oversight. `mat-select` renders its panel in a CDK overlay attached
  to the body, outside the dialog's DOM, so it takes the _application_ theme no matter what the
  dialog looks like. Restyling the dialog dark by hand would leave every dropdown it opens light — a
  fight only winnable with global CSS reaching into Material internals. A settings sheet floating
  over the call reads as a system surface, which is what it is.

One small piece of Material trivia that cost a screenshot: an outlined `mat-form-field`'s floating
label is positioned _above_ its own border box, so the first field's label is clipped whenever the
controls sit at the top of a container that scrolls — which `mat-dialog-content` is. The overhang is
reserved inside `DeviceControls` itself, so it is fixed wherever the controls are mounted instead of
each host having to out-specify Material's own dialog padding rule.

**The member pickers use `queryUsers`, not the seeded JSON**, so the search field has something
real to do and the demo shows the API a customer would actually reach for:

```ts
const { users } = await chat.queryUsers(
  { role: "student", ...(term ? { name: { $autocomplete: term } } : {}) },
  { name: 1 },
  { limit: 25 },
  { signal: abortSignal }, // RequestOptions carries an AbortSignal
);
```

Two things about that: `queryUsers` lives on the **chat** client (the video client has no such
method), and **`role` is not in the `UserFilters` TypeScript type** even though the API supports
filtering on it — so the filter object is cast, with a comment saying why, rather than inventing a
parallel custom field. Each picker is an Angular `resource()` with a debounced `term` as its
params, which hands the loader an `abortSignal` and gives `isLoading` / `error` states for free.
Selection is kept as separate state from results, so ticks survive re-querying.

### Three things that bite

- **`reuseInstance` is not optional.** Without `client.call(type, id, { reuseInstance: true })`,
  re-entering a call route builds a _second_ `Call` for the same cid; the store swaps its entry and
  orphans the first while it is still joined — live socket, live microphone, no UI attached. It is
  also what lets the lobby's call object flow into the call route with its camera already running.
- **The SDK's device persistence is per-_client_, not per-call.** It keys the selected device _and
  the mute state_ on one `localStorage` entry shared by every `Call`, so the whisper call muting its
  microphone would write `muted: true` into the entry the exam call reads back. The client is
  constructed with `devicePersistence: { enabled: false }` and
  [`DevicePreferences`](./app/src/app/core/stream/device-preferences.ts) owns that state instead.
- **`leave()` is terminal.** `join()` throws _"call.join() shall be called only once"_ on a reused
  instance, so returning to the lobby after a call must request a fresh one.

### Every SDK call reports its failure

There is one wrapper, and everything goes through it —
[`Notifier.attempt()`](./app/src/app/core/errors/notifier.ts):

```ts
const result = await notifier.attempt(() => call.join(), {
  what: "Joining the exam call",
});
if (!result.ok) {
  /* … */
}
```

It returns a discriminated result rather than throwing, so call sites handle the outcome explicitly
instead of relying on an ambient `try`/`catch`, and it reports as a side effect: a snackbar for
something you can continue past, a `fatal` signal that a route renders instead of its content for
something you cannot. A cancelled screen-share picker (`NotAllowedError`) and a superseded
autocomplete request (`AbortError`) are treated as expected outcomes rather than failures — a
reference app that cries wolf teaches the wrong thing, and so does one that swallows errors.

### Change detection, and why zone.js is still here

`stream-chat-angular` does not support zoneless, so the app is scaffolded with `--zoneless=false`
and keeps `provideZoneChangeDetection({ eventCoalescing: true })`. zone.js patches `WebSocket`, so
every SFU frame ends in an `ApplicationRef.tick()`. That tick is cheap because of two things, and
**neither of them is `runOutsideAngular`**:

1. Every component is OnPush — the CLI default, so it costs nothing to hold to. A tick with no
   dirty component is a tree walk with no template work.
2. The `distinctUntilChanged` filtering above, on the streams where a comparator makes it true.
   The participant streams emit per frame, so what they feed is projected to scalars.

`runOutsideAngular` would be actively harmful in a reference app: outside the zone, a bare
`.subscribe()` into a field goes silently stale, which is precisely the pattern to discourage.

### Chat alongside video

Two SDKs, two clients, two websockets for one user — that is the documented pattern. The exam
channel reuses the call id, and its members are the call's members, so the people who can join the
call are exactly the people who can read the room.

The panel watches the channel itself rather than calling `ChannelService.init()`:

```ts
await channel.watch(); // mandatory — setAsActiveChannel issues no request
channelService.setAsActiveChannel(channel);
```

### If you are on Angular Universal

`@stream-io/video-client` imports `webrtc-adapter` for side effects, and it touches `window` at
import time. This app is `--ssr=false` so it never comes up here, but a server-rendered app needs
to keep the client out of the server bundle.

---

## The whisper channel

The one part of this demo that is genuinely hard, and the reason it is worth reading.

A proctor is joined to **two calls at once**: the exam call (`default:<callId>`) and a proctors-only
audio channel (`audio_room:<callId>`, same id). One `StreamVideoClient` holds both — it tracks a
_list_ of calls with no "active call" concept, and the join-once guard is per-`Call` instance.
Both are created together in the lobby, so their rosters cannot drift, and students are never
members of the second one. Nothing is stored in either call's `custom` data — the call _type_ is what
tells them apart, so a `mode` field would carry no information, and `getOrCreate` overwrites custom
data on an existing call, so writing one would also be a small hazard.

```text
┌──────────────────────────────────────────┐          ┌──────────────────────────────────────────┐
│ EXAM CALL                                │          │ WHISPER CHANNEL                          │
│ default:spry-otter-42                    │          │ audio_room:spry-otter-42                 │
├──────────────────────────────────────────┤          ├──────────────────────────────────────────┤
│ students · call_member_student           │          │ students                                 │
│   Tom   Ana   Nils   … and seven more    │          │   none, ever — no student role holds     │
│                                          │          │   join-call on this call type            │
│                                          │          │                                          │
│ proctors · call_member_proctor           │          │ proctors · call_member_proctor           │
│   John                          mic held │  ──────  │   John                          MIC LIVE │
│   Maya                          mic held │  ──────  │   Maya                         listening │
│                                          │          │                                          │
│ speaker ducked to 20%                    │          │ recording auto-on, audio only            │
└──────────────────────────────────────────┘          └──────────────────────────────────────────┘
```

The tie between them is identity, not flow: one proctor, two `Call` instances. In this frame John
has pressed _Whisper_ and Maya has pressed nothing — both are held shut in the exam call, and only
John is audible to the other proctors. The empty student slot on the right is the access control,
and it is a server-side refusal rather than a hidden button.

**Mode is global to the call, not per-user.** One proctor pressing _Whisper_ puts every proctor into
the channel; one proctor pressing _Go back to students_ takes every proctor out and mutes every
whisper microphone. That symmetry is the whole safety argument: there is never a moment where one
proctor is unmuted to the students while colleagues are still whispering, so no whisper audio can
reach a student through an open exam microphone. Every proctor in the channel is muted in the exam
call, including one who is only listening and never pressed anything.

It is signalled **two ways, on purpose**:

1. **A custom WS event** (`sendCustomEvent({ type: 'whisper.start' | 'whisper.end', by, at })`) is the
   fast path. It arrives on every watching client as the SDK event named `'custom'`, with the payload
   under `event.custom` — so the discriminator has to live _inside_ the payload, not in the event name.
   The sender is not echoed its own event, so the initiator applies its change optimistically and the
   handler is idempotent; the `at` timestamp stops a late `whisper.start` resurrecting a mode someone
   just closed.
2. **Anyone already publishing audio in the whisper call**, derived from `participants$`. This is the
   condition a one-shot event cannot cover: a proctor who joins mid-whisper, or whose client
   reconnects, receives no event at all. Participant state, by contrast, is _replayed_ — hydrated from
   the SFU join response — so it is already correct on that client's first emission.

**Hearing the channel is a way _in_ to the mode, never a way out of it.** This is the subtle one, and
the easy mistake is to write the panel condition as a live `mode || someoneAudible` — which
reintroduces the very leak the shared mode removes. A proctor who joined mid-whisper has `mode ===
false`; their panel is open _only_ because of the audio. The moment every colleague happens to mute
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

A proctor also _joins the exam call muted_ regardless of their lobby setting, and is unmuted by the
reconciler once the whisper state is known — otherwise they publish to the students for the fraction
of a second in between.

**The two controls send before they apply**, and change nothing locally if the event is refused.
Optimism is tempting here and it is wrong twice over: unmuting the whisper mic while the request is
in flight would latch every _other_ proctor into a mode by the audio they briefly heard, with the
proctor who started it showing no panel and no way to end it; and leaving the mode locally before
`whisper.end` is accepted is what brings _your_ exam mic back while colleagues are still whispering.
Both fail closed, for a round trip of button latency.

**Both microphones are driven by one single-flight reconciler**, not by an effect:
`toObservable(desired).pipe(distinctUntilChanged(), concatMap(reconcile))`. `concatMap`, never
`switchMap` — a half-finished hand-off must not be abandoned. It releases before it acquires in both
directions, re-reads the intent after its awaits in case you clicked again, and falls back to muted
in _both_ calls if `enable()` throws. The SDK cannot serialise this for you: `statusChangeSettled` is
per-manager, and cancellation does not abort an in-flight `unmuteStream()` — it finishes
`getUserMedia` and publishes.

**A failed whisper join is blocking for a proctor, not best-effort.** Not for tidiness: the interlock
above reads the whisper call's participants, which only carry data while you are joined. A proctor in
the exam call but _not_ the whisper call cannot tell that colleagues are whispering, has no reason to
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

## Recording, captions and connection status

Two placement rules shape this part, and both are about who needs the information rather than
who owns the feature.

**The recording _indicator_ is not capability-gated; the _toggle_ is.** Only a proctor can start
a recording, but everyone in the call must be able to see that one is running — in a proctored
exam that is the participant's side of an obligation, not a nicety. So the `REC` badge renders
off `recording()` alone in both headers, while the toggle renders nothing without the capability.
Neither toggle contains a role check: `own_capabilities` decides, which is also how the demo
shows that the grants are real. Worth knowing about the vocabulary: the _permission id_ the setup
script grants is `start-recording`, but what a client reads back is `start-record-call`. Same
thing, two names.

**A notice about somebody else's connection is noise.** Quality bars go on every tile, because a
proctor watching ten students wants to know whose video is struggling. The words _"Poor
connection"_ appear only for the local participant — ten tiles is ten chances to cry wolf about a
wifi problem the viewer cannot act on.

Two details that are easy to get wrong:

- **A resolved request is not a running recording.** `startRecording()` resolving means the
  server accepted the job; `recording()` only flips when `call.recording_started` arrives, up to
  several seconds later. Clearing the button's pending state on the request puts it back to
  "start recording" while a recording is starting, which invites a second click and a second job.
  So it is cleared by the event, with a timeout as a backstop. Same for captions.
- **Reconnects must not reset the screen.** A reconnect takes `callingState` away from `JOINED`
  for a few seconds. Gating the call layout on the live value replaces everything with a join
  spinner when that happens — and takes the connection banner, which lives inside the layout,
  with it, so the banner can never be seen in any of the states it exists to report. The layout
  is gated on a latched "have joined at least once" instead, and the banner reports over the
  frozen last frame.

`call.setDisconnectionTimeout(30)` is set deliberately: a proctored exam is not a meeting, and a
student whose wifi drops for twenty seconds should come back to the same session rather than
reappearing as a new participant with a fresh screen-share prompt.

---

## The recordings screen

`/recordings`, reachable from the app header whenever a proctor is signed in. It exists because
**there is no "all recordings for this app" endpoint**: `listRecordings` is a method on a _call_,
so recordings are always reached in two steps.

The screen is shaped like the API rather than like a wish. It lists the calls you are a member of,
and each row has a **Fetch recordings** button that asks that one call. Nothing is loaded until you
press it.

That two-level shape is not a layout preference — it is the only one that behaves:

- **A flat list of recordings costs one request per call, and gets rate-limited.** The first
  version of this screen fanned `listRecordings` out over all 30 queried calls to build a single
  time-ordered list. The API answered part of the burst with `429 Too Many Requests`, which
  silently dropped those calls' recordings: one run showed 7 recordings where there were 23.
  Fetching per row means one request per click, and the problem disappears rather than being
  papered over with a concurrency limit.
- **A 403 and a 429 need opposite advice.** A refusal means the role holds no `list-recordings`
  grant on that call type — permanent, and worth saying plainly. Anything else is transient and
  worth retrying. Conflating them is how this first went wrong: a rate limit was reported as a
  missing grant, which would send a reader off to fix a setup script that was working.

Two more things about the API:

- **`queryCalls` must be scoped to your own membership.** An unscoped query from a client is
  refused with a 403 that spells out the fix: _"some calls match your query but cannot be returned
  because you don't have access to them. Did you forget to include `{members: $in: ["student-tom"]}`?"_
  A proctor who happens to be on every call gets away without the filter, which makes this exactly
  the kind of bug that ships.
- **`queryCalls` builds real `Call` objects** and runs `applyDeviceConfig` on each one. It is only
  harmless here because both call types set `camera_default_on: false` and `mic_default_on: false`
  — against a camera-on call type, _opening this screen would turn the camera on_. It also logs
  _"[video manager]: Setting direction is not supported on this device"_ once per call on any
  desktop. Both happen inside `queryCalls`, so neither can be switched off from outside;
  `withDisabledDevices: false` would only make the camera case worse.

**The URLs are pre-signed and expire** — an `Expires` parameter, a 14-day window at the time of
writing. So a row re-fetches every time it is opened rather than holding links that may have
quietly stopped working, and nothing is cached between visits.

**A recording that has just stopped is not there yet.** Encoding takes a while; the asset lands with
`call.recording_ready`, which is the event behind the in-call "the recording is ready" toast.

**Why this is the one screen that gates on a role.** Everywhere else, a privileged control reads
`own_capabilities` and renders itself out of existence without the capability, so the server's
grants decide and the UI reflects them. That is impossible here: `list-recordings` has no
`OwnCapability` entry, so there is nothing for a client to read. The route guard therefore checks
`role === 'proctor'` and is treated as what it is — a convenience, not a control. The enforcement
is the grant, and it holds regardless: a student's token gets _"User 'student-tom' with roles
['student', 'call_member_student'] is not allowed to perform action ListRecordings in scope
'video:default'"_.

Server-side the same two steps are available on `@stream-io/node-sdk`, which is where you would go
to sweep an entire app rather than one user's calls:

```ts
const { calls } = await client.video.queryCalls({
  limit: 100,
  sort: [{ field: "created_at", direction: -1 }],
});
for (const { call } of calls) {
  const { recordings } = await client.video.listRecordings({
    type: call.type,
    id: call.id,
  });
}
```

Files: [`call-recordings.ts`](./app/src/app/core/stream/call-recordings.ts) (the two queries and the
failure classification), [`recordings.ts`](./app/src/app/features/recordings/recordings.ts) (the call
list, with [tests](./app/src/app/features/recordings/recordings.spec.ts)),
[`call-row.ts`](./app/src/app/features/recordings/call-row/call-row.ts) (one call, fetched on demand),
[`require-proctor-guard.ts`](./app/src/app/core/auth/require-proctor-guard.ts).

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
2. **A fixed cast picked from a list**, instead of signing in. Picking a user _is_ the whole identity
   step, which keeps the demo focused on the video integration.
3. The demo uses custom roles, integrators should make sure to understand Stream's permission system, and configure it to their own needs. The demo app is not ready for production, roles are made for demo use-case, not for a production app.

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

**`cannot use unknown permission "..."`** — call-type grants take **permission ids**, which are _not_
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
condition is treating "somebody is publishing audio" as a live state rather than as a way _in_. A
proctor who joined mid-whisper is in the mode only because of that audio, so when colleagues mute
themselves the condition goes false and that proctor's microphone opens into a channel that is still
live. Latch the mode on the rising edge and clear it only on the explicit end event.

**`not allowed to perform action SendEvent`** — `send-event` is missing from the call type's grants.
`sendCustomEvent()` needs it, and there is no `OwnCapability` entry for it, so it is easy to leave
out; without it the shared whisper mode silently opens for nobody but the initiator.

**Everyone sits on "Joining…" after End exam** — the SDK auto-leaves when a call ends, so
`callingState` goes `LEFT` and a naive "not joined yet" guard renders forever. There is no separate
event to wait for: the terminal state _is_ the notification, so distinguish "we left" from "the call
ended under us" and render an ended state for the second case.

**A row on the Recordings screen says you are not allowed to list recordings** — the call type is
missing the `list-recordings` grant for `call_member_proctor`. It is granted per call type, so check
both `default` and `audio_room`; `npm run verify` asserts both. If instead the row says it _couldn't
load_, that is transient — usually a rate limit — and the retry is there for it.

**The recording or captions button never appears for a proctor** — the capability is missing.
These render off `own_capabilities`, so check the call type's grants: `start-recording` /
`stop-recording` and `start-closed-captions` / `stop-closed-captions` on `call_member_proctor`.
Note the client reads them back under different names (`start-record-call`,
`start-closed-captions-call`) — that is expected, not a mismatch.

**The whole call is replaced by a "Joining…" spinner during a brief network drop** — the layout
is gated on the live `callingState === JOINED` rather than on having joined at least once. Latch
it, or a reconnect looks like a fresh join and the connection banner becomes unreachable.

**The "browser blocked audio" banner never appears** — expected in this app, and not a bug:
granting `getUserMedia` satisfies Chrome's autoplay requirement, so anyone who has a camera and
microphone is already exempt. It is reachable for a participant who denies the device prompt.

**Captions turn on but no text appears** — the transcription service needs real speech, and a
headless browser cannot supply it convincingly. Chrome's `--use-fake-device-for-media-stream`
emits a tone; even `--use-file-for-fake-audio-capture` with a recording of speech produced no
caption events here. So captions are worth checking by hand rather than trusting an automated
run: turn them on, say something, and watch for `call.closed_caption` events. If those events do
arrive and still nothing renders, the state is in `closedCaptions()` — a rolling window the SDK
trims for you — and `CaptionsOverlay` renders it as-is.

**A ghost participant lingers after a refresh or tab close** — the client registers no
`beforeunload`/`pagehide` handler of its own (its only `window` listeners are `online`/`offline`), so
neither call is left and the SFU waits out its disconnection timeout. This app registers `pagehide`
(not `beforeunload` — unreliable on mobile, and it kills the back/forward cache) and leaves both calls
best-effort. Be clear-eyed about it: `leave()` cannot _finish_ during unload. Its value is stopping
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
`proctor` roles carry no `join-call`, so the `call_member_*` roles _are_ the ACL.

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
