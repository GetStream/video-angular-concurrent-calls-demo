import { Injectable, computed, inject, signal } from '@angular/core';
import { DemoConfig } from '../config/demo-config';
import { ChatClient } from '../stream/chat-client';
import { VideoClient } from '../stream/video-client';
import type { DemoUser } from '../models/demo-user.model';

const STORAGE_KEY = 'exam-demo/current-user-id';

/**
 * Who you are demoing as.
 *
 * Picking a user on the first screen *is* the whole identity step - there is no sign-in.
 * Persisted to sessionStorage so a page refresh mid-demo doesn't send you back to the
 * picker, but scoped to the tab so several browser profiles can hold different users.
 */
@Injectable({ providedIn: 'root' })
export class CurrentUser {
  private readonly config = inject(DemoConfig);
  private readonly video = inject(VideoClient);
  private readonly chat = inject(ChatClient);
  private readonly current = signal<DemoUser | null>(null);

  readonly user = this.current.asReadonly();
  readonly isProctor = computed(() => this.current()?.role === 'proctor');
  readonly isStudent = computed(() => this.current()?.role === 'student');

  /** Re-adopt the user from a previous page load, if they're still in the seeded cast. */
  restore(): DemoUser | null {
    if (this.current()) return this.current();
    const id = read();
    const user = id ? this.config.byId(id) : undefined;
    if (user) this.current.set(user);
    return this.current();
  }

  /** Select a user and connect both Stream clients. Resolves false if either failed. */
  async signIn(user: DemoUser): Promise<boolean> {
    this.current.set(user);
    write(user.id);
    const [video, chat] = await Promise.all([
      this.video.connect(user),
      this.chat.connect(user),
    ]);
    if (!video || !chat) {
      await this.signOut();
      return false;
    }
    return true;
  }

  async signOut(): Promise<void> {
    this.current.set(null);
    write(null);
    await Promise.all([this.video.disconnect(), this.chat.disconnect()]);
  }
}

function read(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function write(id: string | null): void {
  try {
    if (id) sessionStorage.setItem(STORAGE_KEY, id);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Blocked storage: the picker just reappears after a refresh.
  }
}
