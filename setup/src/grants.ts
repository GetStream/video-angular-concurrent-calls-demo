/**
 * Role and capability model for the demo.
 *
 * The split is deliberate: the *application-level* role decides only whether a user may
 * start a call, and everything a user can do *inside* a call comes from their call-level
 * member role. Because neither app-level role carries `join-call`, call membership is the
 * access-control list and it is enforced server-side - a student who was never added to an
 * exam cannot join it, and no student can reach the proctors' whisper channel.
 *
 * A useful side effect: we never revoke anything from the built-in `user` role, so this
 * script does not mutate shared defaults on the API key.
 */

export const ROLE = {
  /** App-level. No call capabilities at all. */
  STUDENT: 'student',
  /** App-level. `create-call` and nothing else. */
  PROCTOR: 'proctor',
  /** Call-level, set as a member's `role` on the calls a proctor belongs to. */
  MEMBER_PROCTOR: 'call_member_proctor',
  /** Call-level, set as a member's `role` on the exam call. */
  MEMBER_STUDENT: 'call_member_student',
} as const;

export const CUSTOM_ROLES: string[] = [
  ROLE.STUDENT,
  ROLE.PROCTOR,
  ROLE.MEMBER_PROCTOR,
  ROLE.MEMBER_STUDENT,
];

/**
 * Permission ids, as accepted by call-type `grants`.
 *
 * These are **not** the same vocabulary as `OwnCapability`, which is what a client reads
 * back in `own_capabilities`. They overlap for most entries but not all: the recording and
 * closed-caption permissions drop the `-call` suffix that the capabilities carry, so
 * `OwnCapability.START_RECORD_CALL` ('start-record-call') is rejected by the grants
 * endpoint, which wants 'start-recording'. Deliberately spelled out as literals rather
 * than imported from `OwnCapability`, so nobody reaches for the wrong enum again -
 * `setup.ts` validates every id against `listPermissions()` before it writes anything.
 *
 * Each id also has `-owner` and `-any-team` variants we don't need here.
 */
const PERMISSION = {
  JOIN_CALL: 'join-call',
  READ_CALL: 'read-call',
  CREATE_CALL: 'create-call',
  SEND_AUDIO: 'send-audio',
  SEND_EVENT: 'send-event',
  SEND_VIDEO: 'send-video',
  SCREENSHARE: 'screenshare',
  END_CALL: 'end-call',
  START_RECORDING: 'start-recording',
  STOP_RECORDING: 'stop-recording',
  START_CLOSED_CAPTIONS: 'start-closed-captions',
  STOP_CLOSED_CAPTIONS: 'stop-closed-captions',
} as const;

/** Join the call and read/watch its state. */
const MEMBER_BASE: string[] = [PERMISSION.JOIN_CALL, PERMISSION.READ_CALL];

/** Publish camera, microphone and screen share. */
const PUBLISH: string[] = [
  PERMISSION.SEND_AUDIO,
  PERMISSION.SEND_VIDEO,
  PERMISSION.SCREENSHARE,
];

/**
 * What a proctor's UI invokes that a student's does not. Derived from the features the
 * demo actually calls - nothing is granted "just in case".
 */
const PROCTOR_EXTRA: string[] = [
  PERMISSION.START_RECORDING, // step 7 - recording toggle
  PERMISSION.STOP_RECORDING,
  PERMISSION.START_CLOSED_CAPTIONS, // step 7 - closed captions toggle
  PERMISSION.STOP_CLOSED_CAPTIONS,
  PERMISSION.END_CALL, // "End exam"
];

/**
 * Grants for the `default` call type, which the exam call uses.
 *
 * Note `proctor` is not empty: **a call type's grants map is what governs actions on calls
 * of that type**, so the app-level `create-call` does not carry over. Leaving `proctor: []`
 * here made `getOrCreate` fail with *"User 'proctor-john' with role 'proctor' is not
 * allowed to perform this action"*, even though the app-level grant was in place.
 *
 * The design still holds: the `proctor` role grants only the right to *start* a call, while
 * everything you can do *inside* one comes from the `call_member_*` membership role.
 */
export const EXAM_GRANTS: Record<string, string[]> = {
  [ROLE.MEMBER_STUDENT]: [...MEMBER_BASE, ...PUBLISH],
  [ROLE.MEMBER_PROCTOR]: [...MEMBER_BASE, ...PUBLISH, ...PROCTOR_EXTRA],
  // starting a call, and nothing else - no in-call capability from the global role
  [ROLE.PROCTOR]: [PERMISSION.CREATE_CALL],
  [ROLE.STUDENT]: [],
};

/**
 * Grants for the `audio_room` call type, which the proctors' whisper channel uses.
 *
 * `send-audio` is the meaningful addition: `audio_room` defaults to a request-to-speak
 * workflow. `end-call` is needed because "End exam" ends both calls - the whisper call must
 * never outlive the exam call. No recording permission, because `recording.mode` is
 * `auto-on` and the server starts it, so the client never calls `startRecording()`.
 *
 * `send-event` is what `sendCustomEvent()` needs, and it is easy to miss: the whisper mode
 * is shared between proctors by a custom WS event on this call, and without the grant the
 * event fails with *"not allowed to perform action SendEvent"* - visible only as a whisper
 * that never opens for anyone else. It is granted **here only**; nothing sends events on the
 * exam call. Note the neighbouring `send-custom-event` permission is Chat's, for
 * `channel.sendEvent()`, and is not what this needs.
 */
export const WHISPER_GRANTS: Record<string, string[]> = {
  [ROLE.MEMBER_PROCTOR]: [
    ...MEMBER_BASE,
    PERMISSION.SEND_AUDIO,
    PERMISSION.SEND_EVENT,
    PERMISSION.END_CALL,
  ],
  // students are never whisper members and hold no role that grants join-call here
  [ROLE.MEMBER_STUDENT]: [],
  [ROLE.STUDENT]: [],
  // the lobby creates the whisper call alongside the exam call (step 6)
  [ROLE.PROCTOR]: [PERMISSION.CREATE_CALL],
};

/**
 * Application-level grants, derived from the built-in `user` role.
 *
 * This scope is a **single map shared by every product**, not just video: the built-in
 * `user` role carries 24 app-level grants covering chat and feeds - `search-user`,
 * `read-roles`, `mute-user`, poll and bookmark permissions - and **no call capabilities at
 * all**, because those live in call-type grants instead.
 *
 * So writing a short hand-authored list here does not "grant only what we need", it strips
 * everything else. Doing that cost us `search-user`, which made the call-create screen's
 * `queryUsers` pickers return an empty list with a 200 and no error - a silent failure that
 * only showed up in the browser.
 *
 * Hence: clone the `user` baseline for both roles, then decide the call-related capability
 * explicitly - `create-call` for proctors, nothing for students.
 */
export function appGrantsFrom(userAppGrants: string[]): Record<string, string[]> {
  const baseline = userAppGrants.filter((c) => !CALL_RELATED.has(c));
  return {
    [ROLE.PROCTOR]: unique([...baseline, PERMISSION.CREATE_CALL]),
    [ROLE.STUDENT]: baseline,
  };
}

/**
 * Call capabilities are never inherited at app level - they are decided per call type. If a
 * future SDK adds one to the `user` baseline, this keeps it from leaking in silently.
 */
const CALL_RELATED = new Set<string>([
  PERMISSION.CREATE_CALL,
  PERMISSION.JOIN_CALL,
  PERMISSION.READ_CALL,
  PERMISSION.SEND_AUDIO,
  PERMISSION.SEND_VIDEO,
  PERMISSION.SCREENSHARE,
  PERMISSION.SEND_EVENT,
  PERMISSION.END_CALL,
  PERMISSION.START_RECORDING,
  PERMISSION.STOP_RECORDING,
  PERMISSION.START_CLOSED_CAPTIONS,
  PERMISSION.STOP_CLOSED_CAPTIONS,
]);

const unique = (xs: string[]): string[] => [...new Set(xs)];
