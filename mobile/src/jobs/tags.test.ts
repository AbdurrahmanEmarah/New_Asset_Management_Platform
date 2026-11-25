import { tagFromQr, tagProblem } from './tags';

describe('tags', () => {
  it('reads a bare tag or a link ending in one', () => {
    expect(tagFromQr('INV-00417')).toBe('INV-00417');
    expect(tagFromQr(' inv-00417 ')).toBe('INV-00417');
    expect(tagFromQr('https://acme.inventra.app/a/INV-00417?src=qr')).toBe('INV-00417');
    expect(tagFromQr('hello world')).toBeNull();
    expect(tagFromQr('')).toBeNull();
  });

  it('explains a typed tag it cannot use', () => {
    expect(tagProblem('')).toBe('Type the code printed under the QR tag first.');
    expect(tagProblem('INV 00417')).toBe('Use letters, digits and dashes only, like INV-00417.');
    expect(tagProblem('INV-00417')).toBeNull();
  });
});
