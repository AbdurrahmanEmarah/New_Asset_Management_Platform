import { describe, expect, it } from 'vitest';
import { forgetJoinToken, takeJoinToken } from './join';

describe('join token', () => {
  it('moves the token from the link into session storage and out of the address bar', () => {
    window.history.pushState(null, '', '/join#abc123');
    expect(takeJoinToken()).toBe('abc123');
    expect(window.location.hash).toBe('');
    // After the sign-in redirect the fragment is gone, but the token is kept.
    expect(takeJoinToken()).toBe('abc123');
    forgetJoinToken();
    expect(takeJoinToken()).toBeNull();
  });
});
