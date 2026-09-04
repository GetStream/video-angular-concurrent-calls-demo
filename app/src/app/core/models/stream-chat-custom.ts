import type { DefaultChannelData } from 'stream-chat-angular';

/**
 * Custom Stream Chat types for this app.
 *
 * In stream-chat v9 the generic payloads are shaped by declaration merging rather than by
 * type parameters: `name` is not a built-in field on `ChannelData`, it is a *custom* one,
 * so setting it without declaring it here fails to compile. Extending
 * `DefaultChannelData` keeps everything stream-chat-angular's own components rely on.
 *
 * Docs: chat-sdk/angular → concepts → custom types.
 */
declare module 'stream-chat' {
  interface CustomChannelData extends DefaultChannelData {
    /** Shown in the channel header; we set it to the exam's call id. */
    name?: string;
  }
}

export {};
