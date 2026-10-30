import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { AxiosError } from 'axios';
import { afterEach } from 'vitest';

import { apiClient, installAuthHooks } from '@/services/api/client';

import { signOutStore } from './auth';

afterEach(() => {
  cleanup();
  // Signed out by default (no bootstrap refresh); tests sign in with signInAs().
  signOutStore();
  installAuthHooks(null);
});

signOutStore();

// findBy* / waitFor wait up to 3 s (default 1 s): snackbars and dialogs can be slow
// on a busy machine under coverage (seen at Phase 4 sign-off, load average > 30).
configure({ asyncUtilTimeout: 3000 });

// Unit tests never touch the network: a request no test mocked (e.g. the header
// bell on a page test) fails at once like an offline browser.
apiClient.defaults.adapter = (config) =>
  Promise.reject(new AxiosError('Network Error (tests are offline)', 'ERR_NETWORK', config));
