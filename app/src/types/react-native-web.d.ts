import 'react-native';

declare module 'react-native' {
  /** react-native-web agrega estos estados a Pressable (en móvil siempre son undefined). */
  interface PressableStateCallbackType {
    hovered?: boolean;
    focused?: boolean;
  }
}
