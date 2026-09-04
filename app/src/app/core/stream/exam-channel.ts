import { Injectable, inject } from '@angular/core';
import type { Channel } from 'stream-chat';
import { ChatClient } from './chat-client';
import { Notifier } from '../errors/notifier';
// Declares `name` as a custom channel field - see the file for why that is necessary.
import '../models/stream-chat-custom';

/** One messaging channel per exam call, sharing its id so the two are trivially linked. */
export const CHAT_CHANNEL_TYPE = 'messaging';

export type ChatOpenResult =
  | { channel: Channel }
  | { error: 'not-a-member' | 'no-channel' | 'failed' };

/**
 * The exam call's chat channel.
 *
 * Video and Chat are separate products with separate clients, so nothing links a call to a
 * channel automatically - you choose the convention. Reusing the call id as the channel id
 * is the simplest one that works, and keeping the member lists identical means the people
 * who can join the call are exactly the people who can read the room.
 *
 * **Membership is the access control.** In the `messaging` type, plain `read-channel`
 * belongs to `channel_member`; the `user` baseline students inherit only carries
 * `read-channel-owner`. So a student who is on the call but not in the channel gets
 * *"not allowed to perform action ReadChannel"*. That makes it essential that the channel
 * is always created **with** its members - and that a client never accidentally creates an
 * empty one, because no role can retrofit membership except a proctor.
 */
@Injectable({ providedIn: 'root' })
export class ExamChannel {
  private readonly chat = inject(ChatClient);
  private readonly notifier = inject(Notifier);

  /**
   * Make sure the channel exists with this exact roster. Proctors only - students hold no
   * capability to create or to manage members, by design.
   *
   * Idempotent, and called both when the call is created and whenever a proctor enters it,
   * so a call made before the chat existed (or one whose channel creation failed) is
   * repaired rather than left permanently unreadable.
   */
  async ensureFor(callId: string, memberIds: string[]): Promise<boolean> {
    const channel = this.chat.raw.channel(CHAT_CHANNEL_TYPE, callId, {
      members: memberIds,
      name: `Exam ${callId}`,
    });

    const created = await this.notifier.attempt(() => channel.create(), {
      what: 'Setting up the exam chat',
    });
    if (!created.ok) return false;

    // `create()` is a get-or-create: on an existing channel it does not add members, so
    // reconcile explicitly. This is what makes a late-added proctor or student able to read.
    const present = new Set(Object.keys(channel.state.members ?? {}));
    const missing = memberIds.filter((id) => !present.has(id));
    if (missing.length) {
      await this.notifier.attempt(() => channel.addMembers(missing), {
        what: 'Adding people to the exam chat',
      });
    }
    return true;
  }

  /**
   * Open the channel for rendering.
   *
   * `watch()` is not optional - `setAsActiveChannel` issues no network request, it reads
   * local state, so without watching first the panel renders empty and gets no updates.
   *
   * But `watch()` is also a *get-or-create*, so a student calling it on a call with no
   * channel would create an empty one and lock the room for everyone. Existence is checked
   * with a query first, which creates nothing.
   */
  async open(callId: string): Promise<ChatOpenResult> {
    const cid = `${CHAT_CHANNEL_TYPE}:${callId}`;

    const found = await this.notifier.attempt(
      () => this.chat.raw.queryChannels({ cid }, undefined, { limit: 1 }),
      { what: 'Looking up the exam chat' },
    );
    if (!found.ok) return { error: 'failed' };

    if (!found.value.length) {
      // Either it genuinely does not exist, or we cannot see it. Both mean the same thing
      // to a student: wait for a proctor, who creates and repairs the room on entry.
      return { error: 'no-channel' };
    }

    const channel = found.value[0];
    const watched = await this.notifier.attempt(() => channel.watch(), {
      what: 'Opening the exam chat',
    });
    if (!watched.ok) return { error: 'not-a-member' };

    return { channel };
  }
}
