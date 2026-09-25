import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GraduationCap, Link2, Plus, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { api, errorMessage } from '@/api/client';
import { queryKeys, useCourse, useCourses, useStudents, useUsers } from '@/api/queries';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ChipGroup } from '@/components/chip';
import { EmptyState, ErrorState, SkeletonList } from '@/components/feedback';
import { RequireRole } from '@/components/require-role';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { toast } from '@/components/toast';
import { useIsWide } from '@/hooks/use-layout';
import { ADMIN_ROLES } from '@/lib/roles';
import { colors, radius, spacing } from '@/theme';

export function CoursesScreen() {
  const wide = useIsWide();
  const courses = useCourses();
  const [selected, setSelected] = useState<number | null>(null);
  const courseId = selected ?? courses.data?.[0]?.id ?? null;

  return (
    <RequireRole roles={ADMIN_ROLES}>
      <Screen title="Cursos y estudiantes" subtitle="Cursos, estudiantes y su vínculo con los apoderados" testID="courses-screen">
        {courses.isLoading ? (
          <SkeletonList rows={3} />
        ) : courses.error ? (
          <ErrorState message={errorMessage(courses.error)} onRetry={() => void courses.refetch()} />
        ) : (
          <View style={[styles.columns, wide && styles.columnsWide]}>
            <View style={[styles.side, wide && styles.sideWide]}>
              <Card title="Cursos" padded>
                {(courses.data ?? []).map((c) => (
                  <Pressable
                    key={c.id}
                    testID={`course-${c.id}`}
                    onPress={() => setSelected(c.id)}
                    style={[styles.courseItem, c.id === courseId && styles.courseActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: c.id === courseId }}
                  >
                    <GraduationCap size={18} color={colors.text} />
                    <View style={styles.flex}>
                      <AppText variant="bodyStrong">{c.name}</AppText>
                      <AppText variant="caption" tone="secondary">
                        {c.year} · {c.studentCount} estudiantes
                      </AppText>
                    </View>
                  </Pressable>
                ))}
                {!courses.data?.length ? <AppText tone="secondary">Aún no hay cursos.</AppText> : null}
              </Card>
              <NewCourseForm />
            </View>
            <View style={styles.main}>
              {courseId ? <CourseDetailCard id={courseId} /> : <EmptyState title="Cree un curso para comenzar" />}
              <NewStudentForm defaultCourseId={courseId} />
              <GuardianLinkForm />
            </View>
          </View>
        )}
      </Screen>
    </RequireRole>
  );
}

function useInvalidateSchool() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.courses }),
      queryClient.invalidateQueries({ queryKey: ['course'] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.students }),
    ]);
}

function CourseDetailCard({ id }: { id: number }) {
  const { data, isLoading } = useCourse(id);
  if (isLoading || !data) return <SkeletonList rows={2} />;
  return (
    <Card title={`${data.name} · ${data.year}`} subtitle={`${data.students.length} estudiantes`} testID="course-detail">
      {data.students.length === 0 ? (
        <AppText tone="secondary">Este curso aún no tiene estudiantes.</AppText>
      ) : (
        data.students.map((s) => (
          <View key={s.id} style={styles.student}>
            <UserRound size={18} color={colors.text} />
            <View style={styles.flex}>
              <AppText variant="bodyStrong">{s.fullName}</AppText>
              <AppText variant="caption" tone="secondary">
                RUT {s.rut} · Apoderado(a): {s.guardians.length ? s.guardians.map((g) => g.fullName).join(', ') : 'sin vincular'}
              </AppText>
            </View>
          </View>
        ))
      )}
    </Card>
  );
}

function NewCourseForm() {
  const invalidate = useInvalidateSchool();
  const [name, setName] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const create = useMutation({
    mutationFn: () => api.post('/courses', { name: name.trim(), year: Number(year) }),
    onSuccess: async () => {
      await invalidate();
      setName('');
      toast.success('Curso creado');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Card title="Nuevo curso">
      <TextField testID="course-form-name" label="Nombre" placeholder="Ej.: 4° Básico A" value={name} onChangeText={setName} />
      <TextField testID="course-form-year" label="Año" keyboardType="number-pad" maxLength={4} value={year} onChangeText={setYear} />
      <Button testID="course-form-submit" label="Crear curso" icon={Plus} compact disabled={name.trim().length < 2} loading={create.isPending} onPress={() => create.mutate()} />
    </Card>
  );
}

function NewStudentForm({ defaultCourseId }: { defaultCourseId: number | null }) {
  const invalidate = useInvalidateSchool();
  const courses = useCourses();
  const [fullName, setFullName] = useState('');
  const [rut, setRut] = useState('');
  const [courseId, setCourseId] = useState<number[]>([]);
  const target = courseId[0] ?? defaultCourseId;

  const create = useMutation({
    mutationFn: () => api.post('/students', { fullName: fullName.trim(), rut: rut.trim(), courseId: target }),
    onSuccess: async () => {
      await invalidate();
      setFullName('');
      setRut('');
      toast.success('Estudiante agregado');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Card title="Agregar estudiante">
      <View style={styles.row}>
        <TextField testID="student-form-name" label="Nombre completo" value={fullName} onChangeText={setFullName} />
        <TextField testID="student-form-rut" label="RUT" placeholder="12345678-5" value={rut} onChangeText={setRut} autoCapitalize="characters" />
      </View>
      <AppText variant="label">Curso</AppText>
      <ChipGroup
        testIDPrefix="student-form-course"
        options={(courses.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
        value={target ? [target] : []}
        onChange={setCourseId}
      />
      <Button
        testID="student-form-submit"
        label="Agregar estudiante"
        icon={Plus}
        compact
        disabled={fullName.trim().length < 3 || rut.trim().length < 8 || !target}
        loading={create.isPending}
        onPress={() => create.mutate()}
      />
    </Card>
  );
}

function GuardianLinkForm() {
  const invalidate = useInvalidateSchool();
  const guardians = useUsers({ role: 'APODERADO', isActive: true });
  const students = useStudents();
  const [guardian, setGuardian] = useState<number[]>([]);
  const [studentIds, setStudentIds] = useState<number[]>([]);

  const link = useMutation({
    mutationFn: () => api.post(`/guardians/${guardian[0]}/students`, { studentIds }),
    onSuccess: async () => {
      await invalidate();
      setStudentIds([]);
      toast.success('Vínculo guardado');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Card title="Vincular apoderado con estudiantes" subtitle="El apoderado verá los documentos dirigidos a los cursos de sus pupilos.">
      <AppText variant="label">Apoderado(a)</AppText>
      <ChipGroup
        testIDPrefix="link-guardian"
        options={(guardians.data ?? []).map((g) => ({ value: g.id, label: g.fullName }))}
        value={guardian}
        onChange={setGuardian}
      />
      <AppText variant="label">Estudiantes</AppText>
      <ChipGroup
        multiple
        testIDPrefix="link-student"
        options={(students.data ?? []).map((s) => ({ value: s.id, label: `${s.fullName} (${s.course.name})` }))}
        value={studentIds}
        onChange={setStudentIds}
      />
      <Button
        testID="link-submit"
        label="Vincular"
        icon={Link2}
        compact
        disabled={!guardian.length || !studentIds.length}
        loading={link.isPending}
        onPress={() => link.mutate()}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  columns: { gap: spacing.lg },
  columnsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  side: { gap: spacing.lg },
  sideWide: { width: 320 },
  main: { flex: 1, gap: spacing.lg },
  courseItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.sm },
  courseActive: { backgroundColor: colors.primarySoft },
  student: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
});
