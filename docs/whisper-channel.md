# Whisper-channel design

The whisper channel is the demo's most safety-sensitive behavior. A proctor is joined to two calls
with the same ID:

```text
exam:     default:<call-id>      students + proctors
whisper:  audio_room:<call-id>   proctors only
```

One `StreamVideoClient` owns both `Call` instances. They are created together in the lobby so their
proctor rosters cannot drift. Students are never whisper-call members, and no student role has
`join-call` on `audio_room`.

Relevant files:

- [`whisper-call.ts`](../app/src/app/core/stream/whisper-call.ts) creates, prepares, and joins the
  call.
- [`whisper-session.ts`](../app/src/app/features/exam-call/whisper/whisper-session.ts) owns the
  state machine and microphone reconciler.
- [`whisper-panel.ts`](../app/src/app/features/exam-call/whisper/whisper-panel.ts) renders the UI.

## Safety invariants

1. **Whisper mode is shared.** When one proctor presses **Whisper**, every proctor's panel opens and
   every proctor's exam microphone is muted. **Go back to students** exits mode for everyone.
2. **Audio never ends the mode.** A participant publishing whisper audio can put a newly joined
   proctor *into* the mode, but silence cannot take anyone out. Only an explicit `whisper.end`
   event exits it.
3. **The exam microphone remains held through the audio tail.** The panel may close before remote
   tracks have fully stopped. The app keeps the exam microphone muted until both the shared mode and
   residual whisper audio are gone.
4. **Mic hand-offs are serialized and fail closed.** The application releases one microphone before
   acquiring the other, never abandons an in-flight transition, and mutes both calls if acquisition
   fails.
5. **A proctor must join both calls.** Joining the exam without the whisper call would leave the
   proctor unable to detect an ongoing whisper session. The route blocks with Retry or Leave rather
   than opening their exam microphone.

Together, these rules prevent a proctor from transmitting whisper audio to students through an open
exam microphone.

## Synchronizing shared mode

The app intentionally uses two signals of mode.

| Signal | Why it exists |
| --- | --- |
| Custom event: `whisper.start` or `whisper.end` | Fast synchronization between connected proctors |
| Whisper-call participant audio | Recovery for a proctor who joins or reconnects after the one-shot event |

The custom payload includes `type`, `by`, and `at`; the SDK delivers it as a `custom` event
with the payload under `event.custom`. The sender does not receive its own event, so it applies the
accepted action locally. The timestamp prevents a delayed start event from restoring a mode that has
already ended.

Participant state is hydrated from the SFU join response, so it covers the case a custom event
cannot: a proctor who arrives mid-whisper or reconnects with no event history. Audio is only a
rising-edge input. If all proctors mute inside the whisper panel, the mode remains active and any of
them can safely unmute again; it does not silently reopen their exam microphones.

The session keeps two related values:

- `panelOpen`: the shared whisper mode.
- `examMicHeld`: shared mode plus any remaining whisper-audio tail.

Proctors also enter the exam call with their microphone muted. The reconciler makes it live only
after whisper state is known, avoiding a short publish window during connection.

## Event ordering and microphone transitions

Controls send the custom event before applying local state. If the server refuses the request, the
UI does not change. This is deliberately non-optimistic: briefly unmuting a whisper microphone can
cause other clients to infer a shared mode that the initiator cannot exit, and briefly restoring an
exam microphone can leak a colleague's whisper audio.

The desired microphone state is processed as a single-flight queue:

```ts
toObservable(desired).pipe(distinctUntilChanged(), concatMap(reconcile));
```

`concatMap`, not `switchMap`, matters because cancelling an observable does not cancel an
in-flight `getUserMedia` request. The reconciler re-reads intent after awaits, releases before
acquiring in either direction, and falls back to muted exam and whisper microphones on failure.

## Call lifetime

Ending a call is per call; it does not cascade. **End exam** therefore ends both the exam and
whisper calls. The whisper call is also torn down whenever the exam reaches a terminal state, so it
cannot outlive the session it protects.

The whisper call is configured as audio-only and records automatically for the demo. See
[setup impact and permissions](./setup-and-permissions.md#call-configuration) for its grants,
recording trade-offs, and the headphones recommendation.
