import {
  provideBrowserGlobalErrorListeners,
  provideAppInitializer,
  provideZoneChangeDetection,
  inject,
  type ApplicationConfig,
} from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { routes } from './app.routes';
import { DemoConfig } from './core/config/demo-config';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // zone.js is kept deliberately: stream-chat-angular does not support zoneless mode.
    // Every component staying OnPush (the CLI default) plus signal-derived state is what
    // keeps the per-frame ticks from the Stream websockets cheap.
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(),
    provideRouter(routes, withComponentInputBinding()),
    // Required by stream-chat-angular even when not translating: without it every label in
    // the stock components renders as "streamChat...".
    provideTranslateService(),
    // The app must not render before it knows the API key and the cast.
    provideAppInitializer(() => inject(DemoConfig).load()),
  ],
};
