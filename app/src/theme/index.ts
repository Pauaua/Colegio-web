/**
 * Tokens de diseño del Gestor Documental: estética pastel entre celeste y morado.
 * Ningún componente debe usar colores sueltos: todo sale de aquí.
 */
import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export const colors = {
  background: '#F7F8FE', // blanco con toque lavanda
  surface: '#FFFFFF',
  primary: '#A8C8F0', // celeste pastel
  primarySoft: '#DCEBFB',
  secondary: '#C3B1E8', // lavanda pastel
  secondarySoft: '#ECE5F8',
  accent: '#B5B8F0', // periwinkle (entre celeste y morado)
  text: '#3E3B5C', // morado grisáceo oscuro
  textMuted: '#8A87A8',
  border: '#E4E1F2',
  success: '#B8E3D0',
  warning: '#F6E0B5',
  danger: '#F2C1CC',

  /**
   * Derivados para cumplir WCAG AA en texto pequeño: textMuted (#8A87A8) sobre blanco da 3,5:1,
   * suficiente solo para texto grande o decorativo. Para texto secundario pequeño se usa textSecondary (5,3:1).
   */
  textSecondary: '#6B6889',
  successText: '#2F6B53',
  warningText: '#7A5A14',
  dangerText: '#8C3448',
  focus: '#8E95E6',
  overlay: 'rgba(62, 59, 92, 0.35)',
  white: '#FFFFFF',
} as const;

/** Degradado de encabezados, sidebar y botón principal. */
export const gradient = ['#CFE3F9', '#DCD3F5'] as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { sm: 12, md: 16, lg: 20, pill: 999 } as const;

export const fonts = {
  regular: 'Nunito_400Regular',
  semibold: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
  extrabold: 'Nunito_800ExtraBold',
} as const;

export const typography = {
  display: { fontFamily: fonts.extrabold, fontSize: 28, lineHeight: 34 },
  title: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28 },
  subtitle: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 23 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  kpi: { fontFamily: fonts.extrabold, fontSize: 30, lineHeight: 36 },
} satisfies Record<string, TextStyle>;

/** Sombra muy suave, igual en todas las plataformas. */
export const shadow: ViewStyle = Platform.select({
  web: { boxShadow: '0 6px 20px rgba(62, 59, 92, 0.06)' } as ViewStyle,
  default: {
    shadowColor: colors.text,
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
});

/** Ancho a partir del cual se usa el layout de escritorio (sidebar + topbar). */
export const WIDE_BREAKPOINT = 900;
export const CONTENT_MAX_WIDTH = 1180;

/** Etiquetas pastel por tipo de documento (fondo) — el texto siempre va en colors.text. */
export const documentTypeColors: Record<string, string> = {
  MEMO: colors.primary,
  OFICIO: colors.secondary,
  CITACION: colors.danger,
  ACUERDO: colors.success,
  ACTA: colors.accent,
  PERMISO_ADMINISTRATIVO: colors.warning,
};

export const chartPalette = [colors.primary, colors.secondary, colors.danger, colors.success, colors.accent, colors.warning];
