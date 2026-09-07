# Angular and SDK architecture

This app uses `@stream-io/video-client` rather than an Angular-specific Video SDK. The client exposes
RxJS observables for call state and imperative bindings for media elements. The app isolates those two
integration styles instead of letting them leak through every component.

## Signals for template state

[`CallFacade`](../app/src/app/core/stream/call-facade.ts) adapts one `Call` into Angular signals.
It is a plain, instantiable class—not a singleton service—because a proctor holds both an exam call
and a whisper call. The route injector is passed in so subscriptions are disposed with the route.

The application rule is simple: template state comes from `toSignal()`.

| Pattern | Change-detection behavior |
| --- | --- |
| `toSignal(observable)` | Updates signal consumers |
| `observable \| async` | Calls `markForCheck()` |
| `observable.subscribe(v => this.value = v)` | Does not mark an OnPush view dirty |

Bare subscriptions are therefore reserved for non-template work: whisper-mode latching and the
single-flight microphone hand-off. The rest of the UI reads signals.

Streams that update frequently are deduplicated before becoming signals. Scalar streams use the
normal comparator; collections whose contents are stable use a value-based comparator. Participant
lists are intentionally not deduplicated because audio level and speaking state change per event.
Consumers should project and deduplicate the scalar they need rather than treating a rebuilt array as
stable.

Capabilities always come from `ownCapabilities$`, not a cached join response. The observable merges
coordinator and SFU grants.

## Media bindings live in directives

The Video SDK's binding methods return teardown functions, making directives the natural boundary:

| Directive | SDK integration | Responsibility |
| --- | --- | --- |
| [`appVideoTrack`](../app/src/app/shared/directives/video-track.ts) | `bindVideoElement` and `trackElementVisibility` | Bind video and let dynascale follow the element's measured size |
| [`appAudioTrack`](../app/src/app/shared/directives/audio-track.ts) | `bindAudioElement` | Keep remote audio playing |
| [`appCallViewport`](../app/src/app/shared/directives/call-viewport.ts) | `setViewport` | Identify the element containing all tracked tiles |

A permanently mounted, visually hidden
[`app-audio-sink`](../app/src/app/shared/components/audio-sink/audio-sink.ts) owns remote audio.
Putting audio elements inside virtualized or conditional tiles can stop sound when a tile disappears.
The sink creates bindings only for participants that publish audio or screen-share audio.

Do not set `setPreferredIncomingVideoResolution` merely to cap small tiles. It replaces the
measured dimension used by `bindVideoElement`, creating a second source of truth and potentially
requesting a larger layer than the element can display. Let dynascale track the real element unless
the product exposes an intentional, user-controlled quality override.

## Lobby and device lifecycle

[`lobby-call.ts`](../app/src/app/core/stream/lobby-call.ts) obtains local camera and microphone
without joining a call. When the route changes, `reuseInstance: true` lets that same `Call`
instance carry its local tracks and registered background filter into the exam route. This prevents
a second device acquisition and visible flicker.

The shared
[`DeviceControls`](../app/src/app/shared/components/device-controls/device-controls.ts) component
is used in both the lobby and the in-call settings dialog. For a proctor, microphone and speaker
selection are mirrored to the whisper call because device state is per call. Camera selection is not
mirrored: the whisper call disallows video.

There are three lifecycle constraints worth retaining when adapting this example:

- `reuseInstance` is required. Recreating a `Call` for a joined CID can orphan the original
  socket and microphone.
- SDK device persistence is per client rather than per call. It is disabled here; the app's
  [`DevicePreferences`](../app/src/app/core/stream/device-preferences.ts) stores preferences
  without allowing a whisper mute to overwrite the exam mute state.
- `leave()` is terminal on a reused instance. Returning to the lobby must obtain a new call
  instance rather than calling `join()` again.

## Errors, chat, and server rendering

[`Notifier.attempt()`](../app/src/app/core/errors/notifier.ts) wraps SDK operations in a
discriminated result. Recoverable failures become snackbars; route-blocking failures become a fatal
state. Expected user cancellations, such as a cancelled screen-share picker or an aborted user
search, are not reported as errors.

Chat and Video use separate clients and WebSockets. The exam chat channel uses the exam call ID and
the same member roster. It must be watched before being activated:

```ts
await channel.watch();
channelService.setAsActiveChannel(channel);
```

This app retains zone.js because `stream-chat-angular` is not zoneless. OnPush components and
stream deduplication keep WebSocket-triggered change detection inexpensive. Avoid using
`runOutsideAngular` to paper over UI updates: it can conceal a bare subscription that leaves an
OnPush view stale.

The demo is client-rendered. A server-rendered Angular application must ensure the Video client stays
out of the server bundle because `webrtc-adapter` touches `window` during import.

## Recording, captions, and reconnects

Only users with the relevant `own_capabilities` see recording and caption controls. The recording
indicator is different: it renders for every participant, because everyone needs to know recording is
active.

A successful `startRecording()` or caption request means the server accepted the request; the
feature is not active until its corresponding call event arrives. Pending UI is therefore cleared by
the event, with a timeout only as a fallback, rather than immediately when the request resolves.

A reconnect briefly moves `callingState` away from `JOINED`. The call layout is gated by a
latched “joined at least once” value so a temporary connection loss keeps the last call view and its
offline banner visible. The app sets `call.setDisconnectionTimeout(30)` so a short dropout returns
to the same session.

## Recordings screen

[`/recordings`](../app/src/app/features/recordings/recordings.ts) reflects the API shape:
`listRecordings` is a method on a call, not an app-wide endpoint. The UI first lists calls that
include the current user, then fetches recordings when the user selects a row. It avoids a burst of
one recording request per call, which is rate-limited in practice.

The `queryCalls` request is scoped to the current user's membership. Without that filter, a client
can receive a 403 for calls it may not see. A recording response URL is pre-signed and temporary, so
the app fetches it on demand rather than caching expired links.

`list-recordings` has no `OwnCapability` equivalent. The recordings route uses the demo's
`proctor` role as a convenience gate, while server-side call-type grants remain the enforcement
point. A 403 means a permanent grant problem; a 429 or other error is treated as retryable.
