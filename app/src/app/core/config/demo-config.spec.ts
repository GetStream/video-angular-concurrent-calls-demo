import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { DemoConfig } from './demo-config';
import type { DemoConfigFile } from '../models/demo-user.model';

const FIXTURE: DemoConfigFile = {
  apiKey: 'test-key',
  generatedAt: '2026-09-04T09:27:52.162Z',
  users: [
    { id: 'proctor-john', name: 'John', role: 'proctor', token: 't1' },
    { id: 'proctor-maya', name: 'Maya', role: 'proctor', token: 't2' },
    { id: 'student-tom', name: 'Tom', role: 'student', token: 't3' },
  ],
};

describe('DemoConfig', () => {
  let config: DemoConfig;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    config = TestBed.inject(DemoConfig);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the runtime config and splits the cast by role', async () => {
    const loading = config.load();
    http.expectOne('demo-config.json').flush(FIXTURE);
    await loading;

    expect(config.loaded()).toBe(true);
    expect(config.apiKey).toBe('test-key');
    expect(config.proctors().map((u) => u.id)).toEqual(['proctor-john', 'proctor-maya']);
    expect(config.students().map((u) => u.id)).toEqual(['student-tom']);
    expect(config.byId('student-tom')?.name).toBe('Tom');
  });

  it('fails with the fix in the message when setup has not been run', async () => {
    const loading = config.load();
    http.expectOne('demo-config.json').flush('', { status: 404, statusText: 'Not Found' });

    await expect(loading).rejects.toThrow(/npm run setup/);
    expect(config.loaded()).toBe(false);
  });

  it('rejects a present-but-empty config rather than booting into a broken state', async () => {
    const loading = config.load();
    http.expectOne('demo-config.json').flush({ apiKey: '', generatedAt: '', users: [] });

    await expect(loading).rejects.toThrow(/npm run setup/);
  });

  it('throws a clear error if the API key is read before loading', () => {
    expect(() => config.apiKey).toThrow(/before it finished loading/);
    http.expectNone('demo-config.json');
  });
});
