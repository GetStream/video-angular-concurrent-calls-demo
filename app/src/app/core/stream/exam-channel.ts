import { Injectable, inject } from '@angular/core';
import type { Channel } from 'stream-chat';
import { ChatClient } from './chat-client';
import { Notifier } from '../errors/notifier';
// Declares `name` as a custom channel field - see the file for why that is necessary.
import '../models/stream-chat-custom';

/** One messaging channel per exam call, sharing its id so the two are trivially linked. */
export const CHAT_CHANNEL_TYPE = 'messaging';

export type ChatOpenResult = { channel: Channel } | { error: 'not-a-member' | 'failed' };

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
 * *"not allowed to perform action ReadChannel"*, which is what `open` reads the 403 as.
 *
 * That makes it essential that the channel is always created **with** its members, in the
 * lobby, beside the call. Note the sharp edge this leaves: `watch()` is a *get-or-create*,
 * so opening the panel for a call whose channel was never created will create an empty one,
 * and nothing in this app retrofits membership onto an existing channel. The room is created
 * once and only once, which is the invariant the whole design rests on.
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
   * One request, and the failure is classified from its own status rather than from a
   * preliminary lookup: a **403** is the API refusing `ReadChannel`, which in the
   * `messaging` type means exactly one thing - you are not a member - because plain
   * `read-channel` belongs to `channel_member` and the roles here only carry
   * `read-channel-owner`. Anything else is transport or server trouble.
   *
   * No `Notifier` snackbar here, deliberately: the panel *is* this call's error surface and
   * renders the outcome with a retry, so reporting it twice would just be noise. The
   * failure is still logged rather than swallowed.
   */
  async open(callId: string): Promise<ChatOpenResult> {
    const channel = this.chat.raw.channel(CHAT_CHANNEL_TYPE, callId);
    try {
      await channel.watch();
      return { channel };
    } catch (error) {
      const status = (error as { status?: number }).status;
      console.warn(`[stream] watch(${CHAT_CHANNEL_TYPE}:${callId}) failed (${status}):`, error);
      return { error: status === 403 ? 'not-a-member' : 'failed' };
    }
  }
}
