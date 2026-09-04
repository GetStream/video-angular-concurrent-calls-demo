import type { Routes } from '@angular/router';
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
    path: 'exam/:callId',
    canActivate: [requireUser],
    loadComponent: () => import('./features/exam-call/exam-call').then((m) => m.ExamCall),
    title: 'Exam call',
  },
  { path: '**', redirectTo: '' },
];
