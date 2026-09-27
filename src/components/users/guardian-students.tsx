"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { GraduationCap, Link2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { NativeSelect } from "@/components/shared/native-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { formatRut } from "@/lib/rut";
import { studentSchema, type StudentInput } from "@/lib/validations/course";
import { NEW_STUDENT } from "@/lib/validations/user";
import {
  createStudentForGuardianAction,
  linkGuardianAction,
  unlinkGuardianAction,
} from "@/server/actions/courses";

type LinkedStudent = { id: string; fullName: string; rut: string; course: { name: string; year: number } };
type CourseOption = { id: string; name: string; year: number; students: { id: string; fullName: string }[] };

/** Ejecuta una Server Action, muestra el toast y refresca los datos del servidor. */
function useServerMutation() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const run = (
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
    success: string,
    onSuccess?: () => void,
  ) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(success);
      onSuccess?.();
      router.refresh();
    });
  return { isPending, run };
}

/** Pupilos de un apoderado: se vinculan eligiendo el curso y luego al estudiante (o creándolo). */
export function GuardianStudents({
  guardianId,
  guardianActive,
  students,
  courses,
}: {
  guardianId: string;
  guardianActive: boolean;
  students: LinkedStudent[];
  courses: CourseOption[];
}) {
  return (
    <Card className="mb-6 max-w-3xl rounded-2xl shadow-soft">
      <CardHeader>
        <CardTitle>Pupilos</CardTitle>
        <CardDescription>
          Estudiantes a cargo de este apoderado. Recibe los documentos dirigidos a sus cursos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {students.length === 0 ? (
          <p className="rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            Todavía no tiene pupilos vinculados.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {students.map((student) => (
              <StudentRow key={student.id} guardianId={guardianId} student={student} />
            ))}
          </ul>
        )}
        {guardianActive ? (
          <LinkStudentForm guardianId={guardianId} courses={courses} linkedIds={students.map((s) => s.id)} />
        ) : (
          <p className="text-sm text-muted-foreground">Activa la cuenta para vincularle pupilos.</p>
        )}
      </CardContent>
    </Card>
  );
}

function StudentRow({ guardianId, student }: { guardianId: string; student: LinkedStudent }) {
  const { isPending, run } = useServerMutation();
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary-soft">
        <GraduationCap className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{student.fullName}</p>
        <p className="text-sm text-muted-foreground">
          {student.course.name} {student.course.year} · {formatRut(student.rut)}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Desvincular a ${student.fullName}`}
        disabled={isPending}
        onClick={() => run(() => unlinkGuardianAction(student.id, guardianId), "Pupilo desvinculado")}
      >
        {isPending ? <Spinner /> : <X />}
      </Button>
    </li>
  );
}

function LinkStudentForm({
  guardianId,
  courses,
  linkedIds,
}: {
  guardianId: string;
  courses: CourseOption[];
  linkedIds: string[];
}) {
  const { isPending, run } = useServerMutation();
  const [courseId, setCourseId] = useState("");
  const [studentId, setStudentId] = useState("");
  const form = useForm<StudentInput>({
    resolver: zodResolver(studentSchema),
    defaultValues: { fullName: "", rut: "" },
  });
  const { errors } = form.formState;

  const course = courses.find((c) => c.id === courseId);
  const available = course?.students.filter((s) => !linkedIds.includes(s.id)) ?? [];
  const isNew = studentId === NEW_STUDENT;

  const reset = () => {
    setStudentId("");
    form.reset();
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!courseId || !studentId) {
      toast.error(!courseId ? "Elige un curso" : "Elige un estudiante");
      return;
    }
    if (isNew) {
      void form.handleSubmit((values) =>
        run(
          () => createStudentForGuardianAction(courseId, guardianId, values),
          "Estudiante agregado y vinculado",
          reset,
        ),
      )();
      return;
    }
    run(() => linkGuardianAction(studentId, guardianId), "Pupilo vinculado", reset);
  };

  if (courses.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay cursos creados. Crea uno en <strong>Cursos</strong> para vincular pupilos.
      </p>
    );
  }

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-4 rounded-xl bg-secondary-soft/40 p-4">
      <p className="font-semibold">Vincular pupilo</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="link-course">Curso</FieldLabel>
          <NativeSelect
            id="link-course"
            value={courseId}
            onChange={(event) => {
              setCourseId(event.target.value);
              setStudentId("");
            }}
          >
            <option value="">Elige un curso</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.year}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="link-student">Estudiante</FieldLabel>
          <NativeSelect
            id="link-student"
            value={studentId}
            disabled={!course}
            onChange={(event) => setStudentId(event.target.value)}
          >
            <option value="">{course ? "Elige un estudiante" : "Primero elige un curso"}</option>
            {available.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName}
              </option>
            ))}
            <option value={NEW_STUDENT}>+ Agregar estudiante nuevo…</option>
          </NativeSelect>
        </Field>
      </div>

      {isNew && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.fullName}>
            <FieldLabel htmlFor="new-student-name">Nombre del estudiante</FieldLabel>
            <Input id="new-student-name" aria-invalid={!!errors.fullName} {...form.register("fullName")} />
            <FieldError errors={[errors.fullName]} />
          </Field>
          <Field data-invalid={!!errors.rut}>
            <FieldLabel htmlFor="new-student-rut">RUT del estudiante</FieldLabel>
            <Input
              id="new-student-rut"
              placeholder="24.567.123-0"
              aria-invalid={!!errors.rut}
              {...form.register("rut", {
                onBlur: (event) => {
                  const value = String(event.target.value ?? "");
                  if (value.replace(/[^0-9kK]/g, "").length >= 2) form.setValue("rut", formatRut(value));
                },
              })}
            />
            <FieldError errors={[errors.rut]} />
          </Field>
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? <Spinner /> : <Link2 />} {isNew ? "Agregar y vincular" : "Vincular"}
        </Button>
      </div>
    </form>
  );
}
