import { TestBed } from '@angular/core/testing';
import { CallingState, SfuModels } from '@stream-io/video-client';
import { ConnectionBanner } from '../connection-banner/connection-banner';
import { LatencyBadge } from '../latency-badge/latency-badge';
import { NetworkQuality } from './network-quality';
import { RecordingBadge } from '../recording-badge/recording-badge';

describe('call status indicators', () => {
  function render<T extends object>(component: new () => T, inputs: Record<string, unknown>) {
    const fixture = TestBed.createComponent(component);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  describe('NetworkQuality', () => {
    it('fills bars according to the SFU’s verdict', () => {
      const good = render(NetworkQuality, { quality: SfuModels.ConnectionQuality.EXCELLENT });
      expect(good.querySelector('.bars')?.className).toContain('bars--excellent');

      const poor = render(NetworkQuality, { quality: SfuModels.ConnectionQuality.POOR });
      expect(poor.querySelector('.bars')?.className).toContain('bars--poor');
    });

    it('names the state for screen readers', () => {
      const host = render(NetworkQuality, { quality: SfuModels.ConnectionQuality.POOR });
      expect(host.querySelector('.bars')?.getAttribute('aria-label')).toBe('Poor connection');
    });

    it('only warns in words where the viewer can act on it', () => {
      // Ten students on screen means ten chances to cry wolf about somebody else's wifi.
      const remote = render(NetworkQuality, { quality: SfuModels.ConnectionQuality.POOR });
      expect(remote.querySelector('.warn')).toBeNull();

      const own = render(NetworkQuality, {
        quality: SfuModels.ConnectionQuality.POOR,
        showLabel: true,
      });
      expect(own.querySelector('.warn')?.textContent).toContain('Poor connection');
    });

    it('says nothing loud when the SFU has not decided yet', () => {
      const host = render(NetworkQuality, {
        quality: SfuModels.ConnectionQuality.UNSPECIFIED,
        showLabel: true,
      });
      expect(host.querySelector('.bars')?.className).toContain('bars--unknown');
      expect(host.querySelector('.warn')).toBeNull();
    });
  });

  describe('LatencyBadge', () => {
    it('grades the round trip', () => {
      expect(render(LatencyBadge, { ms: 42 }).querySelector('.rtt')?.className).toContain(
        'rtt--good',
      );
      expect(render(LatencyBadge, { ms: 250 }).querySelector('.rtt')?.className).toContain(
        'rtt--ok',
      );
      expect(render(LatencyBadge, { ms: 900 }).querySelector('.rtt')?.className).toContain(
        'rtt--bad',
      );
    });

    it('renders nothing before stats have arrived', () => {
      // Zero is "no report yet", not "a perfect connection".
      expect(render(LatencyBadge, { ms: 0 }).querySelector('.rtt')).toBeNull();
    });
  });

  describe('ConnectionBanner', () => {
    it('stays out of the way while the call is connected', () => {
      expect(
        render(ConnectionBanner, { state: CallingState.JOINED }).querySelector('.banner'),
      ).toBeNull();
    });

    it('explains a migration rather than letting it look like a fault', () => {
      const host = render(ConnectionBanner, { state: CallingState.MIGRATING });
      expect(host.querySelector('.banner')?.textContent).toContain('closer server');
      expect(host.querySelector('.banner__action')).toBeNull();
    });

    it('offers recovery only for the terminal state', () => {
      const retrying = render(ConnectionBanner, { state: CallingState.RECONNECTING });
      expect(retrying.querySelector('.banner__action')).toBeNull();

      const failed = render(ConnectionBanner, { state: CallingState.RECONNECTING_FAILED });
      expect(failed.querySelector('.banner')?.className).toContain('banner--fatal');
      expect(failed.querySelector('.banner__action')?.textContent).toContain('Rejoin');
    });
  });

  describe('RecordingBadge', () => {
    it('tells everyone in the call, with no capability check', () => {
      expect(render(RecordingBadge, { recording: false }).querySelector('.rec')).toBeNull();
      expect(
        render(RecordingBadge, { recording: true }).querySelector('.rec')?.textContent,
      ).toContain('REC');
    });
  });
});
