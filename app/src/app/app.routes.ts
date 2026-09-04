import type { Routes } from '@angular/router';
import { requireProctor } from './core/auth/require-proctor-guard';
import { requireUser } from './core/auth/require-user-guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/user-select/user-select').then((m) => m.UserSelect),
    title: 'Pick who you are',
  },
  {
    path: 'lobby',
    canActivate: [requireUser],
    loadComponent: () => import('./features/lobby/lobby').then((m) => m.Lobby),
    title: 'Lobby',
  },
  {
    path: 'recordings',
    // `requireUser` first: it is what reconnects the clients after a refresh, and the
    // proctor check reads the restored user that it establishes.
    canActivate: [requireUser, requireProctor],
    loadComponent: () => import('./features/recordings/recordings').then((m) => m.Recordings),
    title: 'Recordings',
  },
  {
    path: 'exam/:callId',
    canActivate: [requireUser],
    loadComponent: () => import('./features/exam-call/exam-call').then((m) => m.ExamCall),
    title: 'Exam call',
  },
  { path: '**', redirectTo: '' },
];
