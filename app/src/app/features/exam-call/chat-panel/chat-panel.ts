import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  signal,
  type OnInit,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  ChannelService,
  StreamAutocompleteTextareaModule,
  StreamChatModule,
  ThemeService,
} from 'stream-chat-angular';
import { ExamChannel } from '../../../core/stream/exam-channel';

/**
 * The exam call's chat, using stream-chat-angular's stock components.
 *
 * There is no channel list here - one call, one room - so the channel is watched directly
 * and handed to `ChannelService.setAsActiveChannel`, and `ChannelService.init()` is
 * deliberately never called. `init()` would set up the channel-*list* websocket handlers,
 * and those ignore the filter you gave it: an unrelated `notification.message_new` can
 * append a channel and, if the active one is later removed, silently switch the active
 * channel out from under a call-scoped panel.
 */
@Component({
  selector: 'app-chat-panel',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    StreamChatModule,
    // Exactly one textarea module - the library's "opt-in architecture". The autocomplete
    // one costs more bundle but gives @mentions, which a proctor asking one student a
    // question actually wants.
    StreamAutocompleteTextareaModule,
  ],
  templateUrl: './chat-panel.html',
  styleUrl: './chat-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatPanel implements OnInit {
  readonly callId = input.required<string>();

  private readonly examChannel = inject(ExamChannel);
  private readonly channelService = inject(ChannelService);
  private readonly theme = inject(ThemeService);

  protected readonly ready = signal(false);
  protected readonly problem = signal<'none' | 'no-channel' | 'not-a-member' | 'failed'>('none');

  ngOnInit(): void {
    void this.open();
  }

  constructor() {
    // The library owns its theme: `ChannelComponent` renders
    // `class="str-chat__theme-{{ theme$ }}"` on its own root, defaulting to 'light'. Putting
    // the dark class on an ancestor does nothing, because the component's root overrides it
    // further down the tree - the switch has to go through the service.
    this.theme.theme$.next('dark');

    // The panel is collapsible, so let the component own read state rather than having the
    // library mark everything read the moment the channel becomes active behind a closed
    // panel.
    this.channelService.shouldMarkActiveChannelAsRead = false;

    inject(DestroyRef).onDestroy(() => {
      // Leaving the call should not leave a stale active channel behind for the next one.
      this.channelService.deselectActiveChannel();
    });
  }

  protected async open(): Promise<void> {
    this.problem.set('none');
    this.ready.set(false);

    const result = await this.examChannel.open(this.callId());
    if ('error' in result) {
      this.problem.set(result.error);
      return;
    }

    this.channelService.setAsActiveChannel(result.channel);
    this.ready.set(true);
  }
}
