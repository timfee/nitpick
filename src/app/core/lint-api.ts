import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { LintReport } from '../../shared/lint';
import { Auth } from './auth';

@Injectable({ providedIn: 'root' })
export class LintApi {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);

  clientId(): Promise<{ clientId: string }> {
    return firstValueFrom(this.http.get<{ clientId: string }>('/api/config'));
  }

  check(text: string): Promise<LintReport> {
    return firstValueFrom(
      this.http.post<LintReport>(
        '/api/lint',
        { text },
        { headers: { Authorization: `Bearer ${this.auth.idToken()}` } },
      ),
    );
  }
}
