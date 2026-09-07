# Troubleshooting

Start with `npm run verify`. It checks the live call types, grants, settings, and seeded users; a
passing verification makes most app failures easier to isolate.

| Symptom | Cause and next step |
| --- | --- |
| `STREAM_API_KEY is not set` | Create `setup/.env` from `setup/.env.example`. |
| `Token signature is invalid` (401) | The API key and secret in `setup/.env` do not belong together. |
| Member pickers are empty | Check that `user_search_disallowed_roles` does not include `proctor`; the pickers query Chat users by role. |
| `is not allowed to perform this action` when creating a call | Grant `create-call` on the relevant **call type**, not just at app level. |
| `cannot use unknown permission` | Call-type grants use permission IDs, which differ from some client `OwnCapability` names. For example, use `start-recording`, not `start-record-call`. Set `LIST_PERMISSIONS=1` to print valid IDs. |
| `settings.video.target_resolution.height must be 240 or greater` | Preserve `video.target_resolution` when updating a call type. The setup script does this automatically. |
| Chat panel is empty | Call `await channel.watch()` before `setAsActiveChannel(channel)`; activation alone does not make a request. |
| Chat panel is light | Set `ThemeService.theme$.next('dark')`. The Chat component owns its root theme class, so an ancestor class has no effect. |
| Whisper starts only for its initiator | `send-event` is missing from the whisper call type. This is the Video permission required by `sendCustomEvent()`. |
| A proctor exits whisper when everyone mutes | Latch mode when remote whisper audio first appears; clear it only on the explicit `whisper.end` event. See [whisper synchronization](./whisper-channel.md#synchronizing-shared-mode). |
| Everyone remains on “Joining…” after End exam | Treat a terminal `LEFT` state as an ended call, not as a fresh join that should keep waiting. |
| Recording or captions controls never appear | Check the proctor call-member grants. The UI reads `own_capabilities`; permission IDs include `start-recording` and `start-closed-captions`. |
| Recording-list row is forbidden | Add `list-recordings` to `call_member_proctor` on both `default` and `audio_room`. A 403 is a permanent grant issue; a 429 or other failure is retryable. |
| Call layout becomes a spinner during a brief offline period | Gate the layout by “joined at least once,” not the live `callingState === JOINED`. |

## Browser and test behavior

A “browser blocked audio” banner may be unreachable during normal use. Chrome considers a user who
has granted `getUserMedia` eligible for autoplay; the banner remains relevant if device permission
is denied.

Captions need real speech. Headless Chrome's fake audio devices are not a reliable caption test, so
enable captions manually, speak, and look for `call.closed_caption` events. If events arrive but
nothing renders, inspect the facade's `closedCaptions()` signal.

After a refresh or tab close, a participant can remain briefly until the SFU disconnection timeout.
The app uses `pagehide` to make a best-effort leave and stop local tracks, but no unload handler can
guarantee that its network request finishes.

## Useful checks

- Run `npm run verify` after changing setup permissions or call types.
- Check [setup capabilities](./setup-and-permissions.md#call-type-capabilities) before adding a UI
  control. Permission IDs and client capability names are not always identical.
- Read [the architecture notes](./architecture.md#recording-captions-and-reconnects) before changing
  reconnect, pending-control, or recordings behavior.
