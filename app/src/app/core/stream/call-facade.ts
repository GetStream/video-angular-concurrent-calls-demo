import { computed, type Injector, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  CallingState,
  SfuModels,
  type Call,
  type CallClosedCaption,
  type CallSessionResponse,
  type CallStatsReport,
  type MemberResponse,
  type OwnCapability,
  type StreamVideoParticipant,
} from '@stream-io/video-client';
import { distinctUntilChanged, map, type Observable } from 'rxjs';

type DeviceStatus = 'enabled' | 'disabled' | undefined;

/**
 * Signal view over one `Call`'s RxJS state.
 *
 * A plain class rather than a service, because a proctor needs two of these at once (the
 * exam call and the whisper call) and they must tear down together. The `Injector` passed in
 * is the route's, so every subscription dies when the route does.
 *
 * Consumption rule for the whole app: template state comes from `toSignal` here. `| async` would
 * be equally correct - it calls `markForCheck()` - but one paradigm is easier to hold to, and
 * `toSignal` gives `computed()` for free. What is never acceptable is `obs.subscribe(v => this.x = v)` -
 * that marks nothing dirty, so with OnPush the view silently never refreshes. It *looks*
 * fine under Default change detection because zone.js ticks anyway, which is exactly how it
 * breaks the moment a component becomes OnPush - and OnPush is the CLI default.
 *
 * Note the fields are declared and then assigned in the constructor rather than initialised
 * inline: under ES2022 class-field semantics inline initialisers run *before* constructor
 * parameters are assigned, so `this.call` would not exist yet.
 */
export class CallFacade {
  readonly call: Call;
  private readonly injector: Injector;

  // --- participants -------------------------------------------------------------------
  readonly participants: Signal<StreamVideoParticipant[]>;
  readonly localParticipant: Signal<StreamVideoParticipant | undefined>;
  readonly remoteParticipants: Signal<StreamVideoParticipant[]>;
  readonly participantCount: Signal<number>;
  readonly hasOngoingScreenShare: Signal<boolean>;

  // --- lifecycle ----------------------------------------------------------------------
  readonly callingState: Signal<CallingState>;
  readonly members: Signal<MemberResponse[]>;
  readonly session: Signal<CallSessionResponse | undefined>;
  readonly backstage: Signal<boolean>;

  // --- capabilities -------------------------------------------------------------------
  /**
   * Always read capabilities from here, never from a cached join response: the observable
   * merges the coordinator's capabilities with the SFU's grants, and the grants win.
   */
  readonly ownCapabilities: Signal<OwnCapability[]>;

  // --- features -----------------------------------------------------------------------
  readonly recording: Signal<boolean>;
  readonly captioning: Signal<boolean>;
  readonly closedCaptions: Signal<CallClosedCaption[]>;

  /**
   * The browser refused to play audio without a user gesture. Per-`Call`, so a proctor has
   * two of these and the banner has to consider both.
   */
  readonly audioBlocked: Signal<boolean>;

  // --- devices ------------------------------------------------------------------------
  /**
   * Bound to `optimisticStatus$`, not `status$`. `disableMode` is fixed at 'stop-tracks',
   * so every toggle pays a fresh `getUserMedia` (~100-300ms); on `status$` the buttons feel
   * broken. The optimistic value flips synchronously.
   */
  readonly micStatus: Signal<DeviceStatus>;
  readonly cameraStatus: Signal<DeviceStatus>;
  readonly screenShareStatus: Signal<DeviceStatus>;

  // --- stats --------------------------------------------------------------------------
  /**
   * Subscribed unconditionally on purpose: the SDK's stats poller short-circuits unless
   * something is observing this, so a lazily-subscribed latency badge would silently
   * always read zero.
   */
  readonly statsReport: Signal<CallStatsReport | undefined>;
  readonly latencyMs: Signal<number>;
  /**
   * The SFU's own verdict on *our* connection. Derived rather than read off
   * `localParticipant()` in a template: that object is replaced on every audio-level patch,
   * so reading a scalar off it would mark consumers dirty many times a second.
   */
  readonly connectionQuality: Signal<SfuModels.ConnectionQuality>;

  // --- derived ------------------------------------------------------------------------
  readonly joined: Signal<boolean>;
  readonly micOn: Signal<boolean>;
  readonly cameraOn: Signal<boolean>;
  readonly sharingScreen: Signal<boolean>;

  constructor(call: Call, injector: Injector) {
    this.call = call;
    this.injector = injector;
    const state = call.state;

    this.participants = this.sig(state.participants$, []);
    this.localParticipant = this.sig(state.localParticipant$, undefined);
    this.remoteParticipants = this.sig(state.remoteParticipants$, []);
    this.participantCount = this.sig(state.participantCount$, 0);
    this.hasOngoingScreenShare = this.sig(state.hasOngoingScreenShare$, false);

    this.callingState = this.sig(state.callingState$, CallingState.IDLE);
    this.members = this.sig(state.members$, []);
    this.session = this.sig(state.session$, undefined);
    this.backstage = this.sig(state.backstage$, true);

    this.ownCapabilities = this.sig(state.ownCapabilities$, []);

    this.recording = this.sig(state.recording$, false);
    this.captioning = this.sig(state.captioning$, false);
    this.closedCaptions = this.sig(state.closedCaptions$, []);
    this.audioBlocked = this.sig(call.blockedAudioTracker.autoplayBlocked$, false);

    this.micStatus = this.sig(call.microphone.state.optimisticStatus$, undefined);
    this.cameraStatus = this.sig(call.camera.state.optimisticStatus$, undefined);
    this.screenShareStatus = this.sig(call.screenShare.state.status$, undefined);

    this.statsReport = this.sig(state.callStatsReport$, undefined);
    this.latencyMs = this.derive(
      state.callStatsReport$,
      (report) => report?.publisherStats?.averageRoundTripTimeInMs ?? 0,
      0,
    );
    this.connectionQuality = this.derive(
      state.localParticipant$,
      (participant) => participant?.connectionQuality ?? SfuModels.ConnectionQuality.UNSPECIFIED,
      SfuModels.ConnectionQuality.UNSPECIFIED,
    );

    this.joined = computed(() => this.callingState() === CallingState.JOINED);
    this.micOn = computed(() => this.micStatus() === 'enabled');
    this.cameraOn = computed(() => this.cameraStatus() === 'enabled');
    this.sharingScreen = computed(() => this.screenShareStatus() === 'enabled');
  }

  /** True when the local user holds a capability. Read from `ownCapabilities`. */
  can(capability: OwnCapability): Signal<boolean> {
    return computed(() => this.ownCapabilities().includes(capability));
  }

  /**
   * `distinctUntilChanged` before every `toSignal` is load-bearing, not tidiness: the SDK
   * throttles nothing, and `audioLevelChanged` patches every participant's audio level on
   * each event. Filtering here means a frame that changes nothing writes no signal and
   * marks no component dirty, which is what keeps zone.js's per-frame ticks cheap.
   */
  private sig<T>(source: Observable<T>, initialValue: T): Signal<T> {
    return toSignal(source.pipe(distinctUntilChanged()), {
      injector: this.injector,
      initialValue,
    });
  }

  private derive<T, R>(
    source: Observable<T>,
    project: (value: T) => R,
    initialValue: R,
  ): Signal<R> {
    return toSignal(source.pipe(map(project), distinctUntilChanged()), {
      injector: this.injector,
      initialValue,
    });
  }
}
