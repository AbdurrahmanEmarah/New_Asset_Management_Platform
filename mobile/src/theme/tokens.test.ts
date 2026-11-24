import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cssName, dark, light, radius, type ColorTokens } from './tokens';

const css = readFileSync(join(__dirname, '../../../web/shared/theme/tokens.css'), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const values: Record<string, string> = {};
  for (const match of body.matchAll(/(--[a-z-]+):\s*([^;]+);/g)) values[match[1]!] = match[2]!.trim();
  return values;
}

describe('tokens', () => {
  it.each([
    ['light', "[data-theme='light']", light],
    ['dark', "[data-theme='dark']", dark],
  ] as const)('%s matches web/shared/theme/tokens.css', (_name, selector, tokens: ColorTokens) => {
    const web = block(selector);
    const ours = Object.fromEntries(
      (Object.keys(tokens) as (keyof ColorTokens)[]).map((k) => [cssName(k), tokens[k]]),
    );
    const webColors = Object.fromEntries(Object.entries(web).filter(([k]) => k !== '--color-scheme'));
    expect(ours).toEqual(webColors);
  });

  it('shares the radius', () => {
    expect(css).toContain(`--radius: ${radius}px;`);
  });
});
