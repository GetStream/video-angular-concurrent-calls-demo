import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { DemoConfig } from '../../core/config/demo-config';
import { UserSelect } from './user-select';

/**
 * Proves the boot path end to end without a browser: runtime config is fetched, parsed and
 * rendered by a component that instantiates a Material component.
 */
describe('UserSelect (step 2 skeleton)', () => {
  it('renders the seeded cast from demo-config.json', async () => {
    TestBed.configureTestingModule({
      imports: [UserSelect],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    const loading = TestBed.inject(DemoConfig).load();
    TestBed.inject(HttpTestingController)
      .expectOne('demo-config.json')
      .flush({
        apiKey: 'test-key',
        generatedAt: '2026-09-04T09:27:52.162Z',
        users: [
          { id: 'proctor-john', name: 'John', role: 'proctor', token: 't1' },
          { id: 'student-tom', name: 'Tom', role: 'student', token: 't2' },
        ],
      });
    await loading;

    const fixture = TestBed.createComponent(UserSelect);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('proctor-john');
    expect(text).toContain('student-tom');
    expect(text).toContain('1 proctors');
    // Material actually instantiated, not just imported.
    expect(fixture.nativeElement.querySelector('mat-card')).not.toBeNull();
    // Initials, as the wireframe avatars render them.
    expect(text).toContain('JO');
    expect(text).toContain('TO');
  });
});
