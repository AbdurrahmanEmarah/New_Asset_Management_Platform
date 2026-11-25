import { Text as RNText, type TextProps } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, type ColorTokens } from '@/theme/tokens';

type Variant = 'body' | 'small' | 'title' | 'heading' | 'label' | 'mono' | 'strong';

const variants: Record<Variant, { fontFamily: string; fontSize: number; lineHeight?: number; letterSpacing?: number }> = {
  body: { fontFamily: fonts.sans, fontSize: 16, lineHeight: 22 },
  strong: { fontFamily: fonts.sansBold, fontSize: 16, lineHeight: 21 },
  small: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 19 },
  title: { fontFamily: fonts.sansHeavy, fontSize: 26, lineHeight: 32, letterSpacing: -0.5 },
  heading: { fontFamily: fonts.sansHeavy, fontSize: 21, lineHeight: 26 },
  label: { fontFamily: fonts.mono, fontSize: 12, letterSpacing: 1.5 },
  mono: { fontFamily: fonts.monoMedium, fontSize: 14 },
};

export function Text({
  variant = 'body',
  color = 'text',
  style,
  ...props
}: TextProps & { variant?: Variant; color?: keyof ColorTokens }) {
  const { colors } = useTheme();
  return <RNText {...props} style={[variants[variant], { color: colors[color] }, style]} />;
}
