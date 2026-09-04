/**
 * The fixed demo cast. Single source of truth: the setup script seeds these users and
 * writes them (with tokens) into the Angular app's runtime config, so the app never
 * hard-codes a user list of its own.
 *
 * Ids are prefixed with the role so they read clearly in logs, call members and the
 * Stream dashboard. Avatars are not set - the UI renders the first two letters of the
 * name as initials, matching the wireframes.
 */

export type DemoRole = 'proctor' | 'student';

export interface CastMember {
  /** Stream user id. */
  id: string;
  /** Display name; the UI derives initials from this. */
  name: string;
  /** Application-level Stream role. */
  role: DemoRole;
}

export const PROCTORS: CastMember[] = [
  { id: 'proctor-john', name: 'John', role: 'proctor' },
  { id: 'proctor-maya', name: 'Maya', role: 'proctor' },
  { id: 'proctor-samir', name: 'Samir', role: 'proctor' },
  { id: 'proctor-greta', name: 'Greta', role: 'proctor' },
];

export const STUDENTS: CastMember[] = [
  { id: 'student-tom', name: 'Tom', role: 'student' },
  { id: 'student-ana', name: 'Ana', role: 'student' },
  { id: 'student-nils', name: 'Nils', role: 'student' },
  { id: 'student-priya', name: 'Priya', role: 'student' },
  { id: 'student-mei', name: 'Mei', role: 'student' },
  { id: 'student-omar', name: 'Omar', role: 'student' },
  { id: 'student-lena', name: 'Lena', role: 'student' },
  { id: 'student-diego', name: 'Diego', role: 'student' },
  { id: 'student-ivy', name: 'Ivy', role: 'student' },
  { id: 'student-kofi', name: 'Kofi', role: 'student' },
];

export const CAST: CastMember[] = [...PROCTORS, ...STUDENTS];
