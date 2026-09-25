"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Trash2, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { formatRut } from "@/lib/rut";
import { courseSchema, studentSchema, type CourseInput, type StudentInput } from "@/lib/validations/course";
import {
  createCourseAction,
  createStudentAction,
  deleteCourseAction,
  deleteStudentAction,
  linkGuardianAction,
  searchGuardiansAction,
  unlinkGuardianAction,
  updateCourseAction,
  type GuardianOption,
} from "@/server/actions/courses";

type Result = { ok: true } | { ok: false; error: string };

/** Ejecuta una Server Action, muestra el toast y refresca los datos del servidor. */
function useServerMutation() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const run = (action: () => Promise<Result>, success: string, onSuccess?: () => void) =>
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

// ─── Curso: crear / editar ──────────────────────────────────────────────

export function CourseDialog({
  course,
  defaultYear,
}: {
  course?: { id: string; name: string; year: number };
  defaultYear: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { isPending, run } = useServerMutation();
  const form = useForm<CourseInput>({
    resolver: zodResolver(courseSchema),
    defaultValues: course ? { name: course.name, year: course.year } : { name: "", year: defaultYear },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    if (course) {
      run(
        () => updateCourseAction(course.id, values),
        "Curso actualizado",
        () => setOpen(false),
      );
    } else {
      run(
        async () => {
          const result = await createCourseAction(values);
          if (result.ok) router.push(`/cursos/${result.data.id}`);
          return result;
        },
        "Curso creado",
        () => {
          setOpen(false);
          form.reset();
        },
      );
    }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {course ? (
          <Button variant="outline">
            <Pencil /> Editar curso
          </Button>
        ) : (
          <Button>
            <Plus /> Nuevo curso
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} noValidate className="space-y-6">
          <DialogHeader>
            <DialogTitle>{course ? "Editar curso" : "Nuevo curso"}</DialogTitle>
            <DialogDescription>Por ejemplo, «3° Básico A» del año {defaultYear}.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="course-name">Nombre</FieldLabel>
              <Input id="course-name" aria-invalid={!!errors.name} {...form.register("name")} />
              <FieldError errors={[errors.name]} />
            </Field>
            <Field data-invalid={!!errors.year}>
              <FieldLabel htmlFor="course-year">Año</FieldLabel>
              <Input
                id="course-year"
                type="number"
                inputMode="numeric"
                aria-invalid={!!errors.year}
                {...form.register("year", { valueAsNumber: true })}
              />
              <FieldError errors={[errors.year]} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending && <Spinner />}
              {course ? "Guardar" : "Crear curso"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteCourseButton({ courseId, disabled }: { courseId: string; disabled: boolean }) {
  const router = useRouter();
  const { isPending, run } = useServerMutation();
  return (
    <Button
      variant="outline"
      className="text-destructive hover:text-destructive"
      disabled={disabled || isPending}
      title={disabled ? "Solo se pueden eliminar cursos sin estudiantes" : undefined}
      onClick={() =>
        run(
          () => deleteCourseAction(courseId),
          "Curso eliminado",
          () => router.push("/cursos"),
        )
      }
    >
      {isPending ? <Spinner /> : <Trash2 />} Eliminar curso
    </Button>
  );
}

// ─── Estudiantes ────────────────────────────────────────────────────────

export function AddStudentForm({ courseId }: { courseId: string }) {
  const { isPending, run } = useServerMutation();
  const form = useForm<StudentInput>({
    resolver: zodResolver(studentSchema),
    defaultValues: { fullName: "", rut: "" },
  });
  const { errors } = form.formState;

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) =>
        run(
          () => createStudentAction(courseId, values),
          "Estudiante agregado",
          () => form.reset(),
        ),
      )}
      className="grid gap-4 sm:grid-cols-[1fr_200px_auto] sm:items-start"
    >
      <Field data-invalid={!!errors.fullName}>
        <FieldLabel htmlFor="student-name">Nombre del estudiante</FieldLabel>
        <Input id="student-name" aria-invalid={!!errors.fullName} {...form.register("fullName")} />
        <FieldError errors={[errors.fullName]} />
      </Field>
      <Field data-invalid={!!errors.rut}>
        <FieldLabel htmlFor="student-rut">RUT</FieldLabel>
        <Input
          id="student-rut"
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
      <Button type="submit" disabled={isPending} className="sm:mt-[1.625rem]">
        {isPending ? <Spinner /> : <Plus />} Agregar
      </Button>
    </form>
  );
}

export function DeleteStudentButton({ studentId, name }: { studentId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const { isPending, run } = useServerMutation();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Eliminar a ${name}`}>
          <Trash2 />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Eliminar a {name}?</DialogTitle>
          <DialogDescription>Se quitará del curso junto con sus vínculos de apoderados.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={() =>
              run(
                () => deleteStudentAction(studentId),
                "Estudiante eliminado",
                () => setOpen(false),
              )
            }
          >
            {isPending ? <Spinner /> : <Trash2 />} Eliminar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Apoderados ─────────────────────────────────────────────────────────

export function GuardianChip({
  studentId,
  guardian,
}: {
  studentId: string;
  guardian: { id: string; fullName: string; isActive: boolean };
}) {
  const { isPending, run } = useServerMutation();
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary-soft pr-1 pl-3 text-sm">
      {guardian.fullName}
      {!guardian.isActive && <span className="text-xs text-muted-foreground">(inactivo)</span>}
      <Button
        variant="ghost"
        size="icon-xs"
        className="rounded-full"
        aria-label={`Desvincular a ${guardian.fullName}`}
        disabled={isPending}
        onClick={() => run(() => unlinkGuardianAction(studentId, guardian.id), "Apoderado desvinculado")}
      >
        {isPending ? <Spinner /> : <X />}
      </Button>
    </span>
  );
}

export function LinkGuardianButton({ studentId, linkedIds }: { studentId: string; linkedIds: string[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GuardianOption[]>([]);
  const [isSearching, startSearch] = useTransition();
  const { isPending, run } = useServerMutation();

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const timeout = setTimeout(
      () =>
        startSearch(async () => {
          const result = await searchGuardiansAction(q);
          setResults(result.ok ? result.data : []);
        }),
      250,
    );
    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-full" disabled={isPending}>
          {isPending ? <Spinner /> : <UserPlus />} Vincular apoderado
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Nombre, correo o RUT del apoderado…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {isSearching ? (
              <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                <Spinner /> Buscando…
              </div>
            ) : (
              <CommandEmpty>
                {query.trim().length < 2 ? "Escribe al menos 2 letras" : "No hay apoderados con ese dato"}
              </CommandEmpty>
            )}
            {query.trim().length >= 2 && results.length > 0 && (
              <CommandGroup>
                {results.map((guardian) => (
                  <CommandItem
                    key={guardian.id}
                    value={guardian.id}
                    disabled={linkedIds.includes(guardian.id)}
                    onSelect={() => {
                      setOpen(false);
                      setQuery("");
                      run(() => linkGuardianAction(studentId, guardian.id), "Apoderado vinculado");
                    }}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{guardian.fullName}</p>
                      <p className="truncate text-xs text-muted-foreground">{guardian.email}</p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
