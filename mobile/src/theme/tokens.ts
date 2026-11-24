/**
 * Inventra design tokens for the field app.
 * Same semantic names and values as web/shared/theme/tokens.css
 * (light = "Field Kit", dark = "Control Room"). tokens.test.ts fails if they drift apart.
 */
export type ColorTokens = {
  bg: string;
  surface: string;
  sunken: string;
  line: string;
  lineSoft: string;
  text: string;
  muted: string;
  action: string;
  onAction: string;
  actionSoft: string;
  brand: string;
  brandInk: string;
  focus: string;
  side: string;
  sideText: string;
  sideMuted: string;
  sideOn: string;
  scrim: string;
  ok: string;
  okBg: string;
  warn: string;
  warnBg: string;
  fault: string;
  faultBg: string;
  info: string;
  infoBg: string;
  none: string;
  noneBg: string;
};

export const light: ColorTokens = {
  bg: '#fbfbf8',
  surface: '#ffffff',
  sunken: '#f4f6f4',
  line: '#d9dfdb',
  lineSoft: '#ebefec',
  text: '#10261f',
  muted: '#4f5f59',
  action: '#13493a',
  onAction: '#ffffff',
  actionSoft: '#e3eee9',
  brand: '#f2c230',
  brandInk: '#10261f',
  focus: '#13493a',
  side: '#10261f',
  sideText: '#dce5e1',
  sideMuted: '#9fb1aa',
  sideOn: '#1c3a31',
  scrim: 'rgb(16 38 31 / 45%)',
  ok: '#155c39',
  okBg: '#ddf0e5',
  warn: '#6e4c00',
  warnBg: '#fbefc4',
  fault: '#951b12',
  faultBg: '#fbe0dd',
  info: '#1a4f8c',
  infoBg: '#dee9f7',
  none: '#3f4d48',
  noneBg: '#e9edeb',
};

export const dark: ColorTokens = {
  bg: '#0f1216',
  surface: '#171b21',
  sunken: '#13171c',
  line: '#2b323c',
  lineSoft: '#222830',
  text: '#e7eaee',
  muted: '#9aa3ae',
  action: '#f0a53a',
  onAction: '#14110b',
  actionSoft: '#2c2416',
  brand: '#f0a53a',
  brandInk: '#14110b',
  focus: '#f0a53a',
  side: '#0b0e11',
  sideText: '#dde2e8',
  sideMuted: '#8b95a1',
  sideOn: '#1f252d',
  scrim: 'rgb(0 0 0 / 60%)',
  ok: '#6fd39a',
  okBg: '#16301f',
  warn: '#ebc95a',
  warnBg: '#352b12',
  fault: '#f7877b',
  faultBg: '#3a1a18',
  info: '#86bcf5',
  infoBg: '#162a40',
  none: '#aeb6c0',
  noneBg: '#232930',
};

/** Shared by both modes, as in tokens.css. */
export const radius = 6;
export const radiusLg = 8;
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 } as const;

/** Smallest touch target in the field app (gloves, sunlight). */
export const touchTarget = 48;

/** Loaded in app/_layout.tsx; until then the platform's system font is used. */
export const fonts = {
  sans: 'PublicSans_400Regular',
  sansMedium: 'PublicSans_500Medium',
  sansBold: 'PublicSans_700Bold',
  sansHeavy: 'PublicSans_800ExtraBold',
  mono: 'DMMono_400Regular',
  monoMedium: 'DMMono_500Medium',
} as const;

/** Converts a camelCase token name to its CSS custom property name (lineSoft → --line-soft). */
export function cssName(token: keyof ColorTokens): string {
  return '--' + token.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
}
