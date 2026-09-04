import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  model,
  resource,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { UserResponse } from 'stream-chat';
import { ChatClient } from '../../../core/stream/chat-client';
import { initials, type DemoRole } from '../../../core/models/demo-user.model';

/** How long to wait after a keystroke before querying. */
const DEBOUNCE_MS = 250;
const PAGE_SIZE = 25;

/**
 * Picks call members of one role, backed by the Chat API's `queryUsers`.
 *
 * Deliberately *not* backed by `demo-config.json`: this is the API a real integration
 * would use, it works for a cast far larger than the seeded fourteen, and it gives the
 * search field something real to do. `queryUsers` lives on the chat client - the video
 * client has no equivalent - which is another reason both clients are connected up front.
 */
@Component({
  selector: 'app-member-picker',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './member-picker.html',
  styleUrl: './member-picker.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MemberPicker {
  readonly role = input.required<DemoRole>();
  readonly label = input.required<string>();
  /** Rendered as a locked pill that cannot be removed - the call's creator. */
  readonly pinned = input<string | undefined>(undefined);
  /** Select everything on the first unfiltered page once it arrives. */
  readonly selectAllInitially = input(false);

  /** Owned by the parent, so "Start exam call" can read the roster. */
  readonly selected = model<string[]>([]);

  private readonly chat = inject(ChatClient);

  private readonly rawTerm = signal('');
  private readonly debouncedTerm = signal('');
  private debounceHandle?: ReturnType<typeof setTimeout>;
  private autoSelected = false;

  /** Names keyed by id, so a selected pill still renders after the query moves on. */
  private readonly knownNames = new Map<string, string>();

  protected readonly term = this.rawTerm.asReadonly();
  protected readonly initials = initials;

  /**
   * `resource` gives loading and error states for free, and hands the loader an
   * `abortSignal` - which `queryUsers` accepts, so a superseded keystroke's request is
   * actually cancelled rather than racing the one after it.
   */
  protected readonly results = resource<UserResponse[], { role: DemoRole; term: string }>({
    params: () => ({ role: this.role(), term: this.debouncedTerm() }),
    defaultValue: [],
    loader: async ({ params, abortSignal }) => {
      const filter = {
        role: params.role,
        ...(params.term ? { name: { $autocomplete: params.term } } : {}),
      };

      const { users } = await this.chat.raw.queryUsers(
        // `role` is a real, filterable user field but is absent from the `UserFilters`
        // type (which only declares id, name, notifications_muted, teams, username), so
        // the cast is the honest way to express a supported query.
        filter as Parameters<typeof this.chat.raw.queryUsers>[0],
        { name: 1 },
        { limit: PAGE_SIZE },
        { signal: abortSignal },
      );

      for (const user of users) {
        this.knownNames.set(user.id, (user.name as string | undefined) ?? user.id);
      }

      if (this.selectAllInitially() && !this.autoSelected && !params.term) {
        this.autoSelected = true;
        this.selected.set(users.map((u) => u.id));
      }
      return users;
    },
  });

  protected readonly selectedSet = computed(() => new Set(this.selected()));

  protected readonly pills = computed(() => {
    const pinned = this.pinned();
    const ids = this.selected().filter((id) => id !== pinned);
    const all = pinned ? [pinned, ...ids] : ids;
    return all.map((id) => ({
      id,
      name: this.knownNames.get(id) ?? id,
      locked: id === pinned,
    }));
  });

  protected readonly count = computed(() => this.pills().length);

  protected search(value: string): void {
    this.rawTerm.set(value);
    clearTimeout(this.debounceHandle);
    this.debounceHandle = setTimeout(() => this.debouncedTerm.set(value), DEBOUNCE_MS);
  }

  protected toggle(user: UserResponse): void {
    const set = new Set(this.selected());
    if (set.has(user.id)) {
      if (user.id === this.pinned()) return;
      set.delete(user.id);
    } else {
      set.add(user.id);
    }
    this.selected.set([...set]);
  }

  protected remove(id: string): void {
    if (id === this.pinned()) return;
    this.selected.set(this.selected().filter((existing) => existing !== id));
  }

  protected isSelected(id: string): boolean {
    return this.selectedSet().has(id);
  }

  protected displayName(user: UserResponse): string {
    return (user.name as string | undefined) ?? user.id;
  }
}
