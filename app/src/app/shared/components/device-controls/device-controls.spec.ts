import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';
import type { Call } from '@stream-io/video-client';
import { BackgroundFilter } from '../../../core/stream/background-filter';
import { DevicePreferences } from '../../../core/stream/device-preferences';
import { DeviceControls } from './device-controls';

const MICS: MediaDeviceInfo[] = [
  { deviceId: 'mic-a', label: 'Headset', kind: 'audioinput', groupId: 'g' } as MediaDeviceInfo,
  { deviceId: 'mic-b', label: '', kind: 'audioinput', groupId: 'g' } as MediaDeviceInfo,
];

/** Enough of a `Call` for the pickers, recording what was selected on it. */
function fakeCall(id: string) {
  const selected = { camera: 'cam-a', mic: 'mic-a', speaker: undefined as string | undefined };
  const calls: string[] = [];
  return {
    id,
    calls,
    selected,
    camera: {
      listDevices: () => of([{ deviceId: 'cam-a', label: 'Webcam' } as MediaDeviceInfo]),
      select: async (deviceId: string) => {
        calls.push(`camera:${deviceId}`);
      },
      state: { selectedDevice$: new BehaviorSubject<string | undefined>(selected.camera) },
    },
    microphone: {
      listDevices: () => of(MICS),
      select: async (deviceId: string) => {
        calls.push(`mic:${deviceId}`);
      },
      state: { selectedDevice$: new BehaviorSubject<string | undefined>(selected.mic) },
    },
    speaker: {
      listDevices: () => of([{ deviceId: 'spk-a', label: 'Speakers' } as MediaDeviceInfo]),
      select: (deviceId: string) => {
        calls.push(`speaker:${deviceId}`);
      },
      state: {
        isDeviceSelectionSupported: true,
        selectedDevice$: new BehaviorSubject<string | undefined>(undefined),
      },
    },
  };
}

class FakeBackgroundFilter {
  readonly supported = () => true;
  readonly choice = () => 'none' as const;
  readonly loading = () => false;
  readonly degraded = () => false;
  applied: { call: unknown; choice: string }[] = [];
  async probeSupport(): Promise<boolean> {
    return true;
  }
  async apply(call: unknown, choice: string): Promise<void> {
    this.applied.push({ call, choice });
  }
}

function setup(mirrorTo: ReturnType<typeof fakeCall>[] = []) {
  const exam = fakeCall('exam');
  const background = new FakeBackgroundFilter();
  TestBed.configureTestingModule({
    imports: [DeviceControls],
    providers: [{ provide: BackgroundFilter, useValue: background }],
  });
  const fixture = TestBed.createComponent(DeviceControls);
  fixture.componentRef.setInput('call', exam as unknown as Call);
  fixture.componentRef.setInput('mirrorTo', mirrorTo as unknown as Call[]);
  fixture.detectChanges();
  return { fixture, exam, background, prefs: TestBed.inject(DevicePreferences) };
}

const el = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
/** Reads the kind off each trigger, so the assertion does not depend on Material's markup. */
const pickerKinds = (fixture: { nativeElement: unknown }) =>
  Array.from(el(fixture).querySelectorAll('[data-kind]')).map((b) =>
    b.getAttribute('data-kind'),
  );

describe('DeviceControls', () => {
  it('offers a picker for each device, and one for the background', () => {
    const { fixture } = setup();

    // The background is a picker like the others rather than a pair of chips beside them,
    // so it belongs in the same row and the same assertion.
    expect(pickerKinds(fixture)).toEqual(['microphone', 'camera', 'speaker', 'background']);
  });

  it('mirrors the microphone choice onto every call the user holds', async () => {
    const whisper = fakeCall('whisper');
    const { fixture, exam } = setup([whisper]);

    await (
      fixture.componentInstance as unknown as { selectMic(id: string): Promise<void> }
    ).selectMic('mic-b');

    // Per-`Call` device state: choosing a headset has to reach both, or the whisper channel
    // keeps capturing from the old microphone.
    expect(exam.calls).toContain('mic:mic-b');
    expect(whisper.calls).toContain('mic:mic-b');
  });

  it('mirrors the speaker choice too, because SpeakerManager state is per call', async () => {
    const whisper = fakeCall('whisper');
    const { fixture, exam } = setup([whisper]);

    await (
      fixture.componentInstance as unknown as { selectSpeaker(id: string): Promise<void> }
    ).selectSpeaker('spk-a');

    expect(exam.calls).toContain('speaker:spk-a');
    expect(whisper.calls).toContain('speaker:spk-a');
  });

  it('does not mirror the camera: the whisper call publishes no video', async () => {
    const whisper = fakeCall('whisper');
    const { fixture, exam } = setup([whisper]);

    await (
      fixture.componentInstance as unknown as { selectCamera(id: string): Promise<void> }
    ).selectCamera('cam-a');

    expect(exam.calls).toContain('camera:cam-a');
    expect(whisper.calls).toEqual([]);
  });

  it('registers the background filter on the publishing call only', async () => {
    const whisper = fakeCall('whisper');
    const { fixture, exam, background } = setup([whisper]);

    await (
      fixture.componentInstance as unknown as { setBackground(c: string): Promise<void> }
    ).setBackground('blur');

    expect(background.applied).toEqual([{ call: exam, choice: 'blur' }]);
  });

  it('remembers the choice, so the next call joins with the same devices', async () => {
    const { fixture, prefs } = setup();

    await (
      fixture.componentInstance as unknown as { selectMic(id: string): Promise<void> }
    ).selectMic('mic-b');

    expect(prefs.micId()).toBe('mic-b');
  });

  it('labels a device that reports no name, rather than showing an empty option', () => {
    const { fixture } = setup();
    const mic = (
      fixture.componentInstance as unknown as {
        pickers(): { kind: string; options: { id: string; label: string }[] }[];
      }
    )
      .pickers()
      .find((p) => p.kind === 'microphone');

    // MICS[1] reports `label: ''`, which browsers do until permission is granted.
    expect(mic?.options).toEqual([
      { id: 'mic-a', label: 'Headset' },
      { id: 'mic-b', label: 'Microphone mic-b' },
    ]);
  });
});
