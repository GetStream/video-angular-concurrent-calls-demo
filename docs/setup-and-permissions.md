# Setup impact and permissions

The setup script is intentionally server-side. It creates the demo's roles and users, configures
video and chat permissions, and writes browser configuration to `app/public/demo-config.json`.
Run it only against an empty Stream app created for this demo.

Sources: [`setup/src/setup.ts`](../setup/src/setup.ts),
[`setup/src/grants.ts`](../setup/src/grants.ts), and
[`setup/src/cast.ts`](../setup/src/cast.ts).

## What setup changes

The script is idempotent and reads existing configuration before updating it. That avoids replacing
unrelated entries, but the following changes are still global to the Stream app:

| Change | Scope |
| --- | --- |
| Grants for `default` and `audio_room` | Built-in call types |
| Exam settings: 1280×720 @ 1.5 Mbps, camera/mic off on join, screen sharing enabled, recording/captions available, backstage off | `default` call type |
| Audio-only settings, recording `auto-on`, camera/screen sharing disabled, mic off on join, backstage off | `audio_room` call type |
| Grants for `proctor` and `student` | `messaging` channel type |
| App-level grants for `proctor` and `student` | App-wide role configuration |
| Four custom roles | App-wide role configuration |
| Four proctors and ten students with permanent tokens | App-wide user list |

The script leaves the built-in `user`, `admin`, `host`, `moderator`, and `call_member` role grants
alone. It also asserts that `disable_permissions_checks` is `false`; otherwise, the access-control
model demonstrated here would not be enforced. The member pickers require
`user_search_disallowed_roles` not to contain `proctor`.

Some API updates require properties that are unrelated to the intended change. `updateCallType`
requires `video.target_resolution`, and `updateChannelType` requires `automod`,
`automod_behavior`, and `max_message_length`. The script preserves their current values rather than
inventing defaults.

## Permission model

There are two different kinds of roles:

| Role | Scope | Purpose |
| --- | --- | --- |
| `student` | Application | No video capability by itself |
| `proctor` | Application | May create calls |
| `call_member_student` | Call membership | Student's in-call capabilities |
| `call_member_proctor` | Call membership | Proctor's in-call capabilities |

The application role decides who may create a call. Membership decides who may join and what they
can do once in it. Neither application-level role has `join-call`, so membership is the
server-enforced ACL: an uninvited student cannot join an exam, and students can never join the
proctors' whisper call. This does not depend on hiding controls in the UI.

### Call-type capabilities

The exam call (`default`) grants students:

```text
join-call, read-call, send-audio, send-video, screenshare
```

Proctors receive those capabilities plus:

```text
start-recording, stop-recording, list-recordings,
start-closed-captions, stop-closed-captions, end-call
```

The whisper call (`audio_room`) grants only `call_member_proctor`:

```text
join-call, read-call, send-audio, send-event, end-call, list-recordings
```

`send-event` is the Video permission required by `call.sendCustomEvent()`. It is distinct from
Chat's `send-custom-event`. `list-recordings` is also easy to miss: neither permission has an
`OwnCapability` counterpart, so the client cannot use its normal capability-based UI gate for
them. Both permissions must be applied separately to each call type.

### Call configuration

`default` is the exam call. It starts camera and microphone off so the lobby controls publishing,
allows screen sharing, recording, and captions, and uses 720p publishing because proctors watch
many tracks at once.

`audio_room` is the proctors-only whisper channel. It disables video and screen sharing, starts its
microphone muted, has no backstage requirement, and records audio automatically. `auto-on` begins
when the first proctor joins—not when whispering begins—so every demo run can record silence and
incur recording/storage cost. An application that needs only whisper audio could instead start and
stop an `available` recording from the shared whisper events.

Use headphones during a demo. Exam audio played through speakers can bleed into a whisper microphone
and recording despite echo cancellation; the app also ducks the exam call while whispering.

### Chat and users

Video and Chat grants are independent. A new custom role has no Chat permissions, so setup copies
the built-in `user` role's `messaging` grants to `student` and `proctor`.

The script seeds four proctors and ten students, then uses `generatePermanentUserToken` to create
tokens without an `exp` claim. It writes the API key, generated timestamp, and user identities and
tokens to `app/public/demo-config.json`. The file is gitignored because these are browser-readable,
demo-only credentials.

## Verification

Run:

```bash
npm run verify
```

Verification reads the live server state and checks the app grants, call-type grants and settings,
chat grants, and all 14 seeded users. It is the quickest way to find an incomplete configuration
before opening the app.
