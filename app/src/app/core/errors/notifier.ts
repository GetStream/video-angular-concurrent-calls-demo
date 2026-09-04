import { Injectable, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

/** A failure the user cannot proceed past, rendered in place of the affected surface. */
export interface FatalError {
  what: string;
  message: string;
  retry?: () => void;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: unknown };

/**
 * Every call into a Stream SDK goes through here.
 *
 * The rule for this demo is that no SDK failure is swallowed: a reference app that hides
 * errors teaches the wrong thing, and most of these failures are ones a real deployment
 * genuinely hits (revoked permission, expired token, unplugged device, refused capability).
 *
 * Transient failures become a snackbar; failures the user cannot continue past become a
 * `fatal` signal that a route renders instead of its content.
 */
@Injectable({ providedIn: 'root' })
export class Notifier {
  private readonly snackBar = inject(MatSnackBar);
  private readonly fatalError = signal<FatalError | null>(null);

  readonly fatal = this.fatalError.asReadonly();

  /**
   * Run an SDK call, reporting any failure. Returns a result rather than throwing, so call
   * sites handle the outcome explicitly instead of relying on an ambient try/catch.
   */
  async attempt<T>(
    op: () => Promise<T>,
    ctx: { what: string; fatal?: boolean; retry?: () => void },
  ): Promise<Result<T>> {
    try {
      return { ok: true, value: await op() };
    } catch (error) {
      // A cancelled screen-share picker and a superseded autocomplete request are both
      // expected outcomes, not failures - reporting them would make the demo cry wolf.
      if (isExpectedCancellation(error)) return { ok: false, error };

      const message = describe(error);
      console.error(`[stream] ${ctx.what} failed:`, error);

      if (ctx.fatal) {
        this.fatalError.set({ what: ctx.what, message, retry: ctx.retry });
      } else {
        this.snackBar.open(`${ctx.what}: ${message}`, ctx.retry ? 'Retry' : 'Dismiss', {
          duration: ctx.retry ? 12_000 : 6_000,
        });
      }
      return { ok: false, error };
    }
  }

  /** Transient message with no SDK call behind it. */
  notify(message: string): void {
    this.snackBar.open(message, 'Dismiss', { duration: 6_000 });
  }

  clearFatal(): void {
    this.fatalError.set(null);
  }
}

/** `NotAllowedError` from a share/permission dialog the user dismissed, or an aborted fetch. */
export function isExpectedCancellation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'AbortError' || error.name === 'NotAllowedError';
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unexpected error';
}
