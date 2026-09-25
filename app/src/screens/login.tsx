import { zodResolver } from '@hookform/resolvers/zod';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { FolderOpen, KeyRound, LogIn, ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { z } from 'zod';
import { api, errorMessage } from '@/api/client';
import type { LoginResponse, Session } from '@/api/types';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Banner } from '@/components/feedback';
import { TextField } from '@/components/text-field';
import { useSession } from '@/store/session';
import { colors, gradient, radius, shadow, spacing } from '@/theme';

const credentialsSchema = z.object({
  username: z.string().trim().min(1, 'Ingrese su usuario o email'),
  password: z.string().min(1, 'Ingrese su contraseña'),
});
const codeSchema = z.object({ code: z.string().regex(/^\d{6}$/, 'El código tiene 6 dígitos') });

type Credentials = z.infer<typeof credentialsSchema>;

export function LoginScreen() {
  const setSession = useSession((s) => s.setSession);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const credentials = useForm<Credentials>({ resolver: zodResolver(credentialsSchema), defaultValues: { username: '', password: '' } });
  const codeForm = useForm<{ code: string }>({ resolver: zodResolver(codeSchema), defaultValues: { code: '' } });

  const finish = async (session: Session) => {
    await setSession({ accessToken: session.accessToken, refreshToken: session.refreshToken, user: session.user });
    router.replace('/panel');
  };

  const submitCredentials = credentials.handleSubmit(async (values) => {
    setError(null);
    try {
      const { data } = await api.post<LoginResponse>('/auth/login', values);
      if (data.mfaRequired) setMfaToken(data.mfaToken);
      else await finish(data);
    } catch (e) {
      setError(errorMessage(e, 'No se pudo iniciar sesión'));
    }
  });

  const submitCode = codeForm.handleSubmit(async ({ code }) => {
    setError(null);
    try {
      const { data } = await api.post<Session>('/auth/mfa/verify', { mfaToken, code });
      await finish(data);
    } catch (e) {
      setError(errorMessage(e, 'Código incorrecto'));
    }
  });

  return (
    <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.root}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card} testID="login-screen">
            <View style={styles.brand}>
              <View style={styles.logo}>
                <FolderOpen size={30} color={colors.text} strokeWidth={1.5} />
              </View>
              <AppText variant="title" center accessibilityRole="header">
                Gestor Documental
              </AppText>
              <AppText tone="secondary" center>
                Escuela Básica G-733 Chorombo Bajo · María Pinto
              </AppText>
            </View>

            {error ? <Banner tone="danger" title={error} testID="login-error" /> : null}

            {!mfaToken ? (
              <View style={styles.form}>
                <Controller
                  control={credentials.control}
                  name="username"
                  render={({ field, fieldState }) => (
                    <TextField
                      testID="login-username"
                      label="Usuario o email"
                      placeholder="directora.chorombo"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="username"
                      keyboardType="email-address"
                      returnKeyType="next"
                      value={field.value}
                      onChangeText={field.onChange}
                      onBlur={field.onBlur}
                      error={fieldState.error?.message}
                    />
                  )}
                />
                <Controller
                  control={credentials.control}
                  name="password"
                  render={({ field, fieldState }) => (
                    <TextField
                      testID="login-password"
                      label="Contraseña"
                      password
                      autoComplete="current-password"
                      returnKeyType="go"
                      onSubmitEditing={() => void submitCredentials()}
                      value={field.value}
                      onChangeText={field.onChange}
                      onBlur={field.onBlur}
                      error={fieldState.error?.message}
                    />
                  )}
                />
                <Button
                  testID="login-submit"
                  label="Ingresar"
                  icon={LogIn}
                  fullWidth
                  loading={credentials.formState.isSubmitting}
                  onPress={() => void submitCredentials()}
                />
              </View>
            ) : (
              <View style={styles.form}>
                <Banner
                  tone="info"
                  icon={ShieldCheck}
                  title="Verificación en dos pasos"
                  message="Ingrese el código de 6 dígitos de su aplicación de autenticación."
                />
                <Controller
                  control={codeForm.control}
                  name="code"
                  render={({ field, fieldState }) => (
                    <TextField
                      testID="login-mfa-code"
                      label="Código"
                      placeholder="123456"
                      keyboardType="number-pad"
                      autoComplete="one-time-code"
                      maxLength={6}
                      onSubmitEditing={() => void submitCode()}
                      value={field.value}
                      onChangeText={field.onChange}
                      error={fieldState.error?.message}
                    />
                  )}
                />
                <Button
                  testID="login-mfa-submit"
                  label="Verificar"
                  icon={KeyRound}
                  fullWidth
                  loading={codeForm.formState.isSubmitting}
                  onPress={() => void submitCode()}
                />
                <Button
                  label="Volver"
                  variant="ghost"
                  fullWidth
                  onPress={() => {
                    setMfaToken(null);
                    setError(null);
                    codeForm.reset();
                  }}
                />
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xxl,
    gap: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  brand: { alignItems: 'center', gap: spacing.sm },
  logo: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.secondarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  form: { gap: spacing.lg },
});
