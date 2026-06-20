import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../auth/passwords.js';

describe('passwords', () => {
  it('hashes and verifies correctly', async () => {
    const hash = await hashPassword('correct-horse-battery');
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(await verifyPassword('correct-horse-battery', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('produces different hashes for the same password (salted)', async () => {
    const a = await hashPassword('same-password-12');
    const b = await hashPassword('same-password-12');
    expect(a).not.toBe(b);
  });
});
