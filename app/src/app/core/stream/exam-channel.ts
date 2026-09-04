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
   * Create the call's room, with the same roster as the call.
   *
   * Called once, immediately after `call.getOrCreate()` - the two get-or-creates sit
   * together because they describe one thing: an exam and the room that belongs to it.
   * Nothing else ever creates this channel (see `open`), so there is no second writer to
   * reconcile against and no repair path to maintain.
   */
  async createFor(callId: string, memberIds: string[]): Promise<boolean> {
    const channel = this.chat.raw.channel(CHAT_CHANNEL_TYPE, callId, {
      members: memberIds,
      name: `Exam ${callId}`,
    });
    const result = await this.notifier.attempt(() => channel.create(), {
      what: 'Creating the exam chat room',
    });
    return result.ok;
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
      // Either it genuinely does not exist, or we cannot see it. Both look the same from
      // here, and neither is something this client should try to fix - the room is created
      // once, beside the call, and never retrofitted.
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
