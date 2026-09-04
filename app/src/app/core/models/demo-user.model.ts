/** A member of the fixed demo cast, as seeded by the setup script. */
export interface DemoUser {
  id: string;
  /** Display name; the UI derives avatar initials from this. */
  name: string;
  role: DemoRole;
  /** Non-expiring token minted by the setup script. Demo-only - see README. */
  token: string;
}

export type DemoRole = 'proctor' | 'student';

/** Shape of `public/demo-config.json`, written by `npm run setup`. */
export interface DemoConfigFile {
  apiKey: string;
  generatedAt: string;
  users: DemoUser[];
}

/** Two-letter avatar initials, matching the wireframes ("John" -> "JO"). */
export function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}
