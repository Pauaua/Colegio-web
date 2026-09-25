import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { GraduationCap, KeyRound, LogOut, ShieldCheck, ShieldOff, Users } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { z } from 'zod';
import { api, errorMessage } from '@/api/client';
import { queryKeys, useMe } from '@/api/queries';
import type { Me, MfaSetup, Session } from '@/api/types';
import { AppText } from '@/components/app-text';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Banner, ErrorState, SkeletonList } from '@/components/feedback';
import { Screen } from '@/components/screen';
import { RoleTag, Tag } from '@/components/tag';
import { TextField } from '@/components/text-field';
import { toast } from '@/components/toast';
import { useIsWide } from '@/hooks/use-layout';
import { useLogout } from '@/hooks/use-logout';
import { isAdmin } from '@/lib/roles';
import { useSession } from '@/store/session';
import { colors, radius, spacing } from '@/theme';

export function ProfileScreen() {
  const wide = useIsWide();
  const logout = useLogout();
  const me = useMe();

  return (
    <Screen title="Mi perfil" subtitle="Datos de su cuenta y seguridad" testID="profile-screen">
      {me.isLoading ? (
        <SkeletonList rows={3} />
      ) : me.error || !me.data ? (
        <ErrorState message={errorMessage(me.error)} onRetry={() => void me.refetch()} />
      ) : (
        <View style={[styles.columns, wide && styles.columnsWide]}>
          <View style={styles.col}>
            <MyData me={me.data} />
            {isAdmin(me.data.role) && !wide ? <AdminLinks /> : null}
            <Button testID="profile-logout" label="Cerrar sesión" icon={LogOut} variant="secondary" onPress={() => void logout()} />
          </View>
          <View style={styles.col}>
            <ChangePassword />
            {me.data.mfaAvailable ? <MfaCard me={me.data} /> : null}
          </View>
        </View>
      )}
    </Screen>
  );
}

function MyData({ me }: { me: Me }) {
  return (
    <Card testID="profile-data">
      <View style={styles.identity}>
        <Avatar name={me.fullName} size={56} />
        <View style={styles.flex}>
          <AppText variant="subtitle">{me.fullName}</AppText>
          <RoleTag role={me.role} />
        </View>
      </View>
      <Row label="Usuario" value={me.username} />
      <Row label="Email" value={me.email} />
      <Row label="RUT" value={me.rut} />
      {me.phone ? <Row label="Teléfono" value={me.phone} /> : null}
      {me.pupils.length ? (
        <View style={styles.block}>
          <AppText variant="label" tone="secondary">
            Pupilos
          </AppText>
          {me.pupils.map((p) => (
            <AppText key={p.id} variant="bodyStrong">
              {p.fullName} · {p.course.name}
            </AppText>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.dataRow}>
      <AppText variant="label" tone="secondary" style={styles.dataLabel}>
        {label}
      </AppText>
      <AppText style={styles.flex}>{value}</AppText>
    </View>
  );
}

function AdminLinks() {
  return (
    <Card title="Administración">
      <Button label="Usuarios" icon={Users} variant="secondary" fullWidth onPress={() => router.navigate('/panel/usuarios')} />
      <Button label="Cursos y estudiantes" icon={GraduationCap} variant="secondary" fullWidth onPress={() => router.navigate('/panel/cursos')} />
    </Card>
  );
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Ingrese su contraseña actual'),
    newPassword: z
      .string()
      .min(8, 'Mínimo 8 caracteres')
      .regex(/[A-Za-z]/, 'Debe incluir letras')
      .regex(/\d/, 'Debe incluir números'),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: 'Las contraseñas no coinciden' });
type PasswordForm = z.infer<typeof passwordSchema>;

function ChangePassword() {
  const setSession = useSession((s) => s.setSession);
  const { control, handleSubmit, reset } = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
  });
  const change = useMutation({
    mutationFn: async (v: PasswordForm) => (await api.post<Session>('/auth/change-password', { currentPassword: v.currentPassword, newPassword: v.newPassword })).data,
    onSuccess: async (session) => {
      await setSession({ accessToken: session.accessToken, refreshToken: session.refreshToken, user: session.user });
      reset();
      toast.success('Contraseña actualizada. Se cerraron sus otras sesiones.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const field = (name: keyof PasswordForm, label: string) => (
    <Controller
      control={control}
      name={name}
      render={({ field: f, fieldState }) => (
        <TextField testID={`password-${name}`} label={label} password value={f.value} onChangeText={f.onChange} error={fieldState.error?.message} />
      )}
    />
  );

  return (
    <Card title="Cambiar contraseña">
      {field('currentPassword', 'Contraseña actual')}
      {field('newPassword', 'Nueva contraseña')}
      {field('confirm', 'Repetir nueva contraseña')}
      <Button testID="password-submit" label="Actualizar contraseña" icon={KeyRound} loading={change.isPending} onPress={() => void handleSubmit((v) => change.mutate(v))()} />
    </Card>
  );
}

function MfaCard({ me }: { me: Me }) {
  const queryClient = useQueryClient();
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.me });

  const start = useMutation({
    mutationFn: async () => (await api.post<MfaSetup>('/auth/mfa/setup')).data,
    onSuccess: setSetup,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const enable = useMutation({
    mutationFn: () => api.post('/auth/mfa/enable', { code }),
    onSuccess: async () => {
      await refresh();
      setSetup(null);
      setCode('');
      toast.success('Verificación en dos pasos activada');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const disable = useMutation({
    mutationFn: () => api.post('/auth/mfa/disable', { password, code }),
    onSuccess: async () => {
      await refresh();
      setCode('');
      setPassword('');
      toast.success('Verificación en dos pasos desactivada');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (me.mfaEnabled) {
    return (
      <Card title="Verificación en dos pasos (MFA)" right={<Tag label="Activa" color={colors.success} />} testID="mfa-card">
        <AppText tone="secondary">Al iniciar sesión se le pedirá el código de su aplicación de autenticación.</AppText>
        <TextField label="Contraseña" password value={password} onChangeText={setPassword} testID="mfa-disable-password" />
        <TextField label="Código actual" keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode} testID="mfa-disable-code" />
        <Button label="Desactivar MFA" icon={ShieldOff} variant="danger" loading={disable.isPending} disabled={!password || code.length !== 6} onPress={() => disable.mutate()} />
      </Card>
    );
  }

  return (
    <Card title="Verificación en dos pasos (MFA)" right={<Tag label="Inactiva" color={colors.border} />} testID="mfa-card">
      {!setup ? (
        <>
          <AppText tone="secondary">
            Proteja su cuenta con un código de 6 dígitos de Google Authenticator, Microsoft Authenticator u otra aplicación similar.
          </AppText>
          <Button testID="mfa-setup" label="Activar MFA" icon={ShieldCheck} loading={start.isPending} onPress={() => start.mutate()} />
        </>
      ) : (
        <>
          <Banner tone="info" title="1. Escanee este código QR con su aplicación de autenticación" />
          <View style={styles.qrWrap}>
            <Image source={{ uri: setup.qrDataUrl }} style={styles.qr} accessibilityLabel="Código QR para MFA" testID="mfa-qr" />
          </View>
          <AppText variant="caption" tone="secondary" selectable center>
            ¿No puede escanearlo? Ingrese esta clave: {setup.secret}
          </AppText>
          <Banner tone="info" title="2. Ingrese el código que muestra la aplicación" />
          <TextField testID="mfa-code" label="Código" keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode} />
          <Button testID="mfa-enable" label="Confirmar y activar" icon={ShieldCheck} loading={enable.isPending} disabled={code.length !== 6} onPress={() => enable.mutate()} />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  columns: { gap: spacing.lg },
  columnsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  col: { flex: 1, gap: spacing.lg },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  block: { gap: spacing.xs },
  dataRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'baseline' },
  dataLabel: { width: 80 },
  qrWrap: { alignItems: 'center' },
  qr: { width: 220, height: 220, borderRadius: radius.md, backgroundColor: colors.white },
});
