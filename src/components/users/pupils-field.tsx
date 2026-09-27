"use client";

import { GraduationCap, Plus, Trash2 } from "lucide-react";
import {
  useFieldArray,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
} from "react-hook-form";

import { NativeSelect } from "@/components/shared/native-select";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatRut } from "@/lib/rut";
import { NEW_STUDENT, type CreateUserInput } from "@/lib/validations/user";

export type PupilCourseOption = {
  id: string;
  name: string;
  year: number;
  students: { id: string; fullName: string }[];
};

export const EMPTY_PUPIL = { courseId: "", studentId: "", fullName: "", rut: "" };

/**
 * Pupilos del apoderado que se está creando: por cada uno se elige el curso y luego un
 * estudiante ya matriculado o "Estudiante nuevo" (se matricula en el mismo paso).
 */
export function PupilsField({
  control,
  register,
  errors,
  courses,
  setValue,
}: {
  control: Control<CreateUserInput>;
  register: UseFormRegister<CreateUserInput>;
  errors: FieldErrors<CreateUserInput>;
  courses: PupilCourseOption[];
  setValue: UseFormSetValue<CreateUserInput>;
}) {
  const { fields, append, remove } = useFieldArray({ control, name: "pupils" });
  const pupils = useWatch({ control, name: "pupils" }) ?? [];

  return (
    <fieldset className="space-y-4 rounded-xl border bg-secondary-soft/30 p-4 sm:p-5">
      <legend className="sr-only">Pupilos</legend>
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary-soft">
          <GraduationCap className="size-4" />
        </span>
        <div>
          <p className="font-semibold">Pupilos</p>
          <p className="text-sm text-muted-foreground">
            Estudiantes a cargo de este apoderado. Si el estudiante aún no está matriculado, elige “Estudiante
            nuevo” y quedará inscrito en el curso.
          </p>
        </div>
      </div>

      {courses.length === 0 ? (
        <p className="rounded-lg bg-warning px-3 py-2 text-sm text-warning-foreground">
          No hay cursos creados. Crea al menos uno en <strong>Cursos</strong> para poder vincular pupilos.
        </p>
      ) : (
        <ul className="space-y-4">
          {fields.map((field, index) => {
            const pupil = pupils[index] ?? EMPTY_PUPIL;
            const course = courses.find((c) => c.id === pupil.courseId);
            const chosenElsewhere = pupils.filter((_, i) => i !== index).map((p) => p.studentId);
            const pupilErrors = errors.pupils?.[index];
            const isNew = pupil.studentId === NEW_STUDENT;
            return (
              <li key={field.id} className="space-y-4 rounded-xl border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Pupilo {index + 1}</p>
                  {fields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Quitar pupilo ${index + 1}`}
                      onClick={() => remove(index)}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field data-invalid={!!pupilErrors?.courseId}>
                    <FieldLabel htmlFor={`pupil-${index}-course`}>Curso</FieldLabel>
                    <NativeSelect
                      id={`pupil-${index}-course`}
                      aria-invalid={!!pupilErrors?.courseId}
                      {...register(`pupils.${index}.courseId`, {
                        // Otro curso, otra lista de estudiantes: se limpia la elección anterior.
                        onChange: () => setValue(`pupils.${index}.studentId`, ""),
                      })}
                    >
                      <option value="">Elige un curso</option>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.year}
                        </option>
                      ))}
                    </NativeSelect>
                    <FieldError errors={[pupilErrors?.courseId]} />
                  </Field>
                  <Field data-invalid={!!pupilErrors?.studentId}>
                    <FieldLabel htmlFor={`pupil-${index}-student`}>Estudiante</FieldLabel>
                    <NativeSelect
                      id={`pupil-${index}-student`}
                      disabled={!course}
                      aria-invalid={!!pupilErrors?.studentId}
                      {...register(`pupils.${index}.studentId`)}
                    >
                      <option value="">{course ? "Elige un estudiante" : "Primero elige un curso"}</option>
                      {course?.students
                        .filter((s) => !chosenElsewhere.includes(s.id))
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.fullName}
                          </option>
                        ))}
                      <option value={NEW_STUDENT}>+ Estudiante nuevo…</option>
                    </NativeSelect>
                    <FieldError errors={[pupilErrors?.studentId]} />
                  </Field>
                </div>
                {isNew && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field data-invalid={!!pupilErrors?.fullName}>
                      <FieldLabel htmlFor={`pupil-${index}-name`}>Nombre del estudiante</FieldLabel>
                      <Input
                        id={`pupil-${index}-name`}
                        autoComplete="off"
                        aria-invalid={!!pupilErrors?.fullName}
                        {...register(`pupils.${index}.fullName`)}
                      />
                      <FieldError errors={[pupilErrors?.fullName]} />
                    </Field>
                    <Field data-invalid={!!pupilErrors?.rut}>
                      <FieldLabel htmlFor={`pupil-${index}-rut`}>RUT del estudiante</FieldLabel>
                      <Input
                        id={`pupil-${index}-rut`}
                        placeholder="24.567.123-0"
                        aria-invalid={!!pupilErrors?.rut}
                        {...register(`pupils.${index}.rut`, {
                          onBlur: (event) => {
                            const value = String(event.target.value ?? "");
                            if (value.replace(/[^0-9kK]/g, "").length >= 2) {
                              setValue(`pupils.${index}.rut`, formatRut(value));
                            }
                          },
                        })}
                      />
                      <FieldError errors={[pupilErrors?.rut]} />
                    </Field>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {courses.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={fields.length >= 10}
            onClick={() => append({ ...EMPTY_PUPIL })}
          >
            <Plus /> Agregar otro pupilo
          </Button>
          {errors.pupils?.root?.message || errors.pupils?.message ? (
            <FieldDescription className="text-destructive">
              {errors.pupils?.root?.message ?? errors.pupils?.message}
            </FieldDescription>
          ) : null}
        </div>
      )}
    </fieldset>
  );
}
