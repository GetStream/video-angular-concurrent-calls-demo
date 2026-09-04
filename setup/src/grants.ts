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

/** Grants for the `default` call type, which the exam call uses. */
export const EXAM_GRANTS: Record<string, string[]> = {
  [ROLE.MEMBER_STUDENT]: [...MEMBER_BASE, ...PUBLISH],
  [ROLE.MEMBER_PROCTOR]: [...MEMBER_BASE, ...PUBLISH, ...PROCTOR_EXTRA],
  // the app-level roles grant nothing inside a call
  [ROLE.STUDENT]: [],
  [ROLE.PROCTOR]: [],
};

/**
 * Grants for the `audio_room` call type, which the proctors' whisper channel uses.
 *
 * `send-audio` is the meaningful addition: `audio_room` defaults to a request-to-speak
 * workflow. `end-call` is needed because "End exam" ends both calls - the whisper call must
 * never outlive the exam call. No recording permission, because `recording.mode` is
 * `auto-on` and the server starts it, so the client never calls `startRecording()`.
 */
export const WHISPER_GRANTS: Record<string, string[]> = {
  [ROLE.MEMBER_PROCTOR]: [
    ...MEMBER_BASE,
    PERMISSION.SEND_AUDIO,
    PERMISSION.END_CALL,
  ],
  // students are never whisper members and hold no role that grants join-call here
  [ROLE.MEMBER_STUDENT]: [],
  [ROLE.STUDENT]: [],
  [ROLE.PROCTOR]: [],
};

/** Application-level grants: only the ability to start a call is decided here. */
export const APP_GRANTS: Record<string, string[]> = {
  [ROLE.PROCTOR]: [PERMISSION.CREATE_CALL],
  [ROLE.STUDENT]: [],
};
