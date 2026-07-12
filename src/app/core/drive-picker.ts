import { Service, inject } from '@angular/core';

import { environment } from '../../environments/environment';
import { Drive } from './drive';
import { LintApi } from './lint-api';

interface PickerDocument {
  id: string;
  name: string;
}

interface PickerResponse {
  action: string;
  docs?: PickerDocument[];
}

interface PickerBuilder {
  addView(view: unknown): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setCallback(callback: (response: PickerResponse) => void): PickerBuilder;
  build(): { setVisible(visible: boolean): void };
}

declare const google: {
  picker: {
    DocsView: new (viewId?: string) => { setMimeTypes(mimeTypes: string): unknown };
    ViewId: { DOCS: string };
    PickerBuilder: new () => PickerBuilder;
    Action: { PICKED: string; CANCEL: string };
  };
};

declare const gapi: {
  load(api: string, callback: () => void): void;
};

let apiJsLoaded: Promise<void> | undefined;

/** Loads https://apis.google.com/js/api.js exactly once, lazily. */
const loadApiJs = (): Promise<void> =>
  (apiJsLoaded ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load the Google Picker'));
    document.head.append(script);
  }));

let pickerModuleLoaded: Promise<void> | undefined;

/** Loads the `api.js` bootstrap, then the `picker` module it exposes via `gapi.load`. */
const loadPicker = (): Promise<void> =>
  (pickerModuleLoaded ??= loadApiJs().then(
    () => new Promise((resolve) => gapi.load('picker', () => resolve())),
  ));

/**
 * Wraps the Google Picker so file selection stays a per-file `drive.file`
 * grant instead of a broad Drive scope. Nothing here loads until a Drive
 * menu item is actually clicked.
 */
@Service()
export class DrivePicker {
  private readonly api = inject(LintApi);
  private readonly drive = inject(Drive);

  private async apiKey(): Promise<string> {
    return environment.googleApiKey || (await this.api.config()).apiKey;
  }

  /** Opens the picker scoped to Google Docs; resolves `null` if the user cancels. */
  async pickDocument(): Promise<{ id: string; name: string } | null> {
    const [apiKey, token] = await Promise.all([this.apiKey(), this.drive.requestToken()]);
    if (!apiKey) throw new Error('Google Drive picker is not configured');
    await loadPicker();

    return new Promise((resolve) => {
      const view = new google.picker.DocsView(google.picker.ViewId.DOCS).setMimeTypes(
        'application/vnd.google-apps.document',
      );
      const picker = new google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(token)
        .setDeveloperKey(apiKey)
        .setCallback((response) => {
          if (response.action === google.picker.Action.PICKED && response.docs?.length) {
            const [doc] = response.docs;
            resolve({ id: doc.id, name: doc.name });
          } else if (response.action === google.picker.Action.CANCEL) {
            resolve(null);
          }
        })
        .build();
      picker.setVisible(true);
    });
  }
}
