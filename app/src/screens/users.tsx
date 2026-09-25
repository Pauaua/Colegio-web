import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, UserPlus, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, TextInput, View } from 'react-native';
import { z } from 'zod';
import { api, errorMessage } from '@/api/client';
import { queryKeys, useUsers } from '@/api/queries';
import type { Role, User } from '@/api/types';
import { AppText } from '@/components/app-text';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ChipGroup } from '@/components/chip';
import { EmptyState, ErrorState, SkeletonList } from '@/components/feedback';
import { RequireRole } from '@/components/require-role';
import { Screen } from '@/components/screen';
import { SwitchRow } from '@/components/switch-row';
import { RoleTag, Tag } from '@/components/tag';
import { TextField } from '@/components/text-field';
import { toast } from '@/components/toast';
import { ADMIN_ROLES, ALL_ROLES, ROLE_LABELS } from '@/lib/roles';
import { useCurrentUser } from '@/store/session';
import { colors, fonts, radius, spacing } from '@/theme';

const roleOptions = ALL_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

const newUserSchema = z.object({
  fullName: z.string().trim().min(3, 'Ingrese el nombre completo'),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,60}$/, 'Solo letras minúsculas, números, punto o guion'),
  email: z.email('Email inválido'),
  rut: z.string().trim().min(8, 'Ingrese el RUT (ej.: 12345678-5)'),
  phone: z.string().trim().optional(),
  password: z
    .string()
    .min(8, 'Mínimo 8 caracteres')
    .regex(/[A-Za-z]/, 'Debe incluir letras')
    .regex(/\d/, 'Debe incluir números'),
  role: z.enum(['DIRECTOR', 'SOSTENEDOR', 'EQUIPO_DIRECTIVO', 'DOCENTE', 'APODERADO']),
});
type NewUser = z.infer<typeof newUserSchema>;

export function UsersScreen() {
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role[]>([]);
  const { data, isLoading, error, refetch } = useUsers();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter(
      (u) => (!roleFilter.length || roleFilter.includes(u.role)) && (!q || `${u.fullName} ${u.email} ${u.username} ${u.rut}`.toLowerCase().includes(q)),
    );
  }, [data, query, roleFilter]);

  return (
    <RequireRole roles={ADMIN_ROLES}>
      <Screen
        title="Usuarios"
        subtitle="Cuentas del equipo directivo, docentes y apoderados"
        actions={!creating ? <Button testID="user-new" label="Nuevo usuario" icon={UserPlus} onPress={() => setCreating(true)} /> : undefined}
        testID="users-screen"
      >
        {creating ? <NewUserForm onDone={() => setCreating(false)} /> : null}

        <View style={styles.filters}>
          <View style={styles.search}>
            <Search size={18} color={colors.textSecondary} />
            <TextInput
              testID="user-search"
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar por nombre, email o RUT"
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              accessibilityLabel="Buscar usuario"
            />
          </View>
          <ChipGroup testIDPrefix="user-filter-role" options={roleOptions} value={roleFilter} onChange={setRoleFilter} />
        </View>

        {isLoading ? (
          <SkeletonList rows={4} />
        ) : error ? (
          <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
        ) : filtered.length === 0 ? (
          <EmptyState title="No hay usuarios con esos criterios" />
        ) : (
          <View style={styles.list}>
            {filtered.map((u) => (
              <UserRow key={u.id} user={u} />
            ))}
          </View>
        )}
      </Screen>
    </RequireRole>
  );
}

function UserRow({ user }: { user: User }) {
  const me = useCurrentUser();
  const queryClient = useQueryClient();
  const [editingRole, setEditingRole] = useState(false);
  const isMe = me?.id === user.id;

  const update = useMutation({
    mutationFn: (body: Partial<Pick<User, 'role' | 'isActive'>>) => api.patch(`/users/${user.id}`, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.usersAll });
      toast.success('Usuario actualizado');
      setEditingRole(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Card testID={`user-row-${user.id}`} style={!user.isActive && styles.inactive}>
      <View style={styles.userHeader}>
        <Avatar name={user.fullName} />
        <View style={styles.flex}>
          <AppText variant="bodyStrong">{user.fullName}</AppText>
          <AppText variant="caption" tone="secondary">
            {user.username} · {user.email} · RUT {user.rut}
          </AppText>
        </View>
        <View style={styles.tags}>
          <RoleTag role={user.role} />
          {!user.isActive ? <Tag label="Desactivado" color={colors.border} /> : null}
          {user.mfaEnabled ? <Tag label="MFA" color={colors.success} /> : null}
        </View>
      </View>

      {editingRole ? (
        <View style={styles.block}>
          <AppText variant="label">Cambiar rol</AppText>
          <ChipGroup
            testIDPrefix={`user-${user.id}-role`}
            options={roleOptions}
            value={[user.role]}
            onChange={(v) => {
              if (v[0] && v[0] !== user.role) update.mutate({ role: v[0] });
            }}
          />
          <Button label="Cancelar" variant="ghost" compact onPress={() => setEditingRole(false)} />
        </View>
      ) : null}

      {!isMe ? (
        <View style={styles.actions}>
          <View style={styles.flex}>
            <SwitchRow
              testID={`user-${user.id}-active`}
              label={user.isActive ? 'Cuenta activa' : 'Cuenta desactivada'}
              value={user.isActive}
              onChange={(isActive) => update.mutate({ isActive })}
            />
          </View>
          {!editingRole ? <Button label="Cambiar rol" variant="secondary" compact onPress={() => setEditingRole(true)} /> : null}
        </View>
      ) : (
        <AppText variant="caption" tone="secondary">
          Esta es su cuenta: no puede cambiar su propio rol ni desactivarla.
        </AppText>
      )}
    </Card>
  );
}

function NewUserForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const { control, handleSubmit, formState } = useForm<NewUser>({
    resolver: zodResolver(newUserSchema),
    defaultValues: { fullName: '', username: '', email: '', rut: '', phone: '', password: '', role: 'APODERADO' },
  });

  const create = useMutation({
    mutationFn: (values: NewUser) => api.post('/users', { ...values, phone: values.phone || null }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.usersAll });
      toast.success('Usuario creado');
      onDone();
    },
    onError: (e) => toast.error(errorMessage(e, 'No se pudo crear el usuario')),
  });

  const field = (name: Exclude<keyof NewUser, 'role'>, label: string, extra: object = {}) => (
    <Controller
      control={control}
      name={name}
      render={({ field: f, fieldState }) => (
        <TextField testID={`user-form-${name}`} label={label} value={f.value} onChangeText={f.onChange} onBlur={f.onBlur} error={fieldState.error?.message} autoCapitalize="none" {...extra} />
      )}
    />
  );

  return (
    <Card title="Nuevo usuario" right={<Button label="Cerrar" icon={X} variant="ghost" compact onPress={onDone} />} testID="user-form">
      <View style={styles.formGrid}>
        {field('fullName', 'Nombre completo', { autoCapitalize: 'words' })}
        {field('username', 'Nombre de usuario')}
        {field('email', 'Email', { keyboardType: 'email-address' })}
        {field('rut', 'RUT')}
        {field('phone', 'Teléfono (opcional)', { keyboardType: 'phone-pad' })}
        {field('password', 'Contraseña inicial', { password: true })}
      </View>
      <Controller
        control={control}
        name="role"
        render={({ field: f }) => (
          <View style={styles.block}>
            <AppText variant="label">Rol</AppText>
            <ChipGroup testIDPrefix="user-form-role" options={roleOptions} value={[f.value]} onChange={(v) => v[0] && f.onChange(v[0])} />
          </View>
        )}
      />
      <Button testID="user-form-submit" label="Crear usuario" icon={UserPlus} loading={create.isPending || formState.isSubmitting} onPress={() => void handleSubmit((v) => create.mutate(v))()} />
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  filters: { gap: spacing.md },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    minHeight: 46,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 15, color: colors.text, outlineStyle: 'none' } as object,
  list: { gap: spacing.md },
  inactive: { opacity: 0.7 },
  userHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  tags: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  block: { gap: spacing.sm },
  formGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
});
