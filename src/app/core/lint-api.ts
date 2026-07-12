import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { FixResponse, LintFinding, LintReport, StyleSelection } from '../../shared/lint';
import { Auth } from './auth';

export interface ApiConfig {
  clientId: string;
  model: string;
  apiKey: string;
}

@Service()
export class LintApi {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);

  config(): Promise<ApiConfig> {
    return firstValueFrom(this.http.get<ApiConfig>('/api/config'));
  }

  check(text: string, styles?: StyleSelection[]): Promise<LintReport> {
    return firstValueFrom(
      this.http.post<LintReport>('/api/lint', { text, styles }, this.authorized()),
    );
  }

  fix(text: string, findings: LintFinding[]): Promise<FixResponse> {
    return firstValueFrom(
      this.http.post<FixResponse>('/api/fix', { text, findings }, this.authorized()),
    );
  }

  private authorized() {
    return { headers: { Authorization: `Bearer ${this.auth.idToken()}` } };
  }
}
