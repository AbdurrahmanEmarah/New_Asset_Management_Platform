import { describe, expect, it } from 'vitest';
import { emailProblem, slugFromName, slugProblem } from './slug';

describe('slugFromName', () => {
  it.each([
    ['Gulf Facilities Co.', 'gulf-facilities'],
    ['Al Noor Hospital Group', 'al-noor-hospital'],
    ['Café Délice & Sons LLC', 'cafe-delice-and-sons'],
    ['  Metro   Print Works ', 'metro-print-works'],
  ])('%s → %s', (name, slug) => expect(slugFromName(name)).toBe(slug));
});

describe('slugProblem', () => {
  it('accepts a normal sub-domain', () => expect(slugProblem('gulf-fm')).toBeNull());
  it('rejects reserved words', () => expect(slugProblem('admin')).toContain('reserved'));
  it('rejects capitals and spaces', () => expect(slugProblem('Gulf FM')).toContain('lowercase'));
});

describe('emailProblem', () => {
  it('accepts an address', () => expect(emailProblem('mona@gulf-fm.ae')).toBeNull());
  it('rejects a name', () => expect(emailProblem('Mona Haddad')).not.toBeNull());
});
