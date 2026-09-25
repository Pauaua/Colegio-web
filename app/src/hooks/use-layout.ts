import { useWindowDimensions } from 'react-native';
import { WIDE_BREAKPOINT } from '@/theme';

/** true en pantallas anchas (web de escritorio, tablets en horizontal): sidebar + topbar + tablas. */
export function useIsWide(): boolean {
  const { width } = useWindowDimensions();
  return width >= WIDE_BREAKPOINT;
}
