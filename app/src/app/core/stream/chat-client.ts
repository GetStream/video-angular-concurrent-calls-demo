import { Injectable, inject, signal } from '@angular/core';
import { ChatClientService, StreamI18nService } from 'stream-chat-angular';
import { DemoConfig } from '../config/demo-config';
import { Notifier } from '../errors/notifier';
import type { DemoUser } from '../models/demo-user.model';

/**
 * Wraps `stream-chat-angular`'s client service.
 *
 * Video and Chat are separate clients over separate websockets for the same user - that is
 * the documented way to combine them, not a workaround.
 */
@Injectable({ providedIn: 'root' })
export class ChatClient {
  private readonly config = inject(DemoConfig);
  private readonly notifier = inject(Notifier);
  private readonly chatService = inject(ChatClientService);
  private readonly i18n = inject(StreamI18nService);

  readonly connected = signal(false);

  /** The raw `StreamChat` client, for APIs the Angular wrapper doesn't surface (e.g. queryUsers). */
  get raw() {
    return this.chatService.chatClient;
  }

  async connect(user: DemoUser): Promise<boolean> {
    const result = await this.notifier.attempt(
      async () => {
        await this.chatService.init(this.config.apiKey, user.id, user.token);
        // Without this every label in the stock components renders as "streamChat...".
        this.i18n.setTranslation();
      },
      { what: 'Connecting to Stream Chat', fatal: true, retry: () => void this.connect(user) },
    );
    this.connected.set(result.ok);
    return result.ok;
  }

  async disconnect(): Promise<void> {
    if (!this.connected()) return;
    this.connected.set(false);
    await this.notifier.attempt(() => this.chatService.disconnectUser(), {
      what: 'Disconnecting from Stream Chat',
    });
  }
}
