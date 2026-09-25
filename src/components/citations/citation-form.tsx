"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { RecipientPicker } from "@/components/documents/recipient-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { createCitationSchema, type CreateCitationInput } from "@/lib/validations/citation";
import { createCitationAction, searchCitationRecipientsAction } from "@/server/actions/citations";
import type { RecipientOption } from "@/server/actions/documents";

type Props = {
  courses: { id: string; name: string; guardianCount: number }[];
  minDate: string;
};

export function CitationForm({ courses, minDate }: Props) {
  const router = useRouter();
  const [recipients, setRecipients] = useState<RecipientOption[]>([]);
  const [isPending, startTransition] = useTransition();

  const form = useForm<CreateCitationInput>({
    resolver: zodResolver(createCitationSchema),
    defaultValues: {
      title: "",
      citationDate: "",
      citationTime: "",
      citationPlace: "",
      description: "",
      recipientIds: [],
      courseIds: [],
    },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await createCitationAction(values);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Citación enviada. Los apoderados ya pueden verla y responder.");
      router.push(`/documentos/${result.data.id}`);
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card className="rounded-2xl shadow-soft">
        <CardHeader>
          <CardTitle>Datos de la reunión</CardTitle>
          <CardDescription>Con estos datos se genera automáticamente el PDF de la citación.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field data-invalid={!!errors.title}>
              <FieldLabel htmlFor="title">Motivo</FieldLabel>
              <Input
                id="title"
                placeholder="Ej.: Entrevista para revisar el avance académico"
                aria-invalid={!!errors.title}
                {...form.register("title")}
              />
              <FieldError errors={[errors.title]} />
            </Field>
            <div className="grid gap-6 sm:grid-cols-3">
              <Field data-invalid={!!errors.citationDate}>
                <FieldLabel htmlFor="citationDate">Fecha</FieldLabel>
                <Input
                  id="citationDate"
                  type="date"
                  min={minDate}
                  aria-invalid={!!errors.citationDate}
                  {...form.register("citationDate")}
                />
                <FieldError errors={[errors.citationDate]} />
              </Field>
              <Field data-invalid={!!errors.citationTime}>
                <FieldLabel htmlFor="citationTime">Hora</FieldLabel>
                <Input
                  id="citationTime"
                  type="time"
                  aria-invalid={!!errors.citationTime}
                  {...form.register("citationTime")}
                />
                <FieldError errors={[errors.citationTime]} />
              </Field>
              <Field data-invalid={!!errors.citationPlace}>
                <FieldLabel htmlFor="citationPlace">Lugar</FieldLabel>
                <Input
                  id="citationPlace"
                  placeholder="Ej.: Sala de profesores"
                  aria-invalid={!!errors.citationPlace}
                  {...form.register("citationPlace")}
                />
                <FieldError errors={[errors.citationPlace]} />
              </Field>
            </div>
            <Field data-invalid={!!errors.description}>
              <FieldLabel htmlFor="description">Detalle (opcional)</FieldLabel>
              <Textarea
                id="description"
                rows={5}
                placeholder="Información adicional para el apoderado."
                {...form.register("description")}
              />
              <FieldError errors={[errors.description]} />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card className="rounded-2xl shadow-soft">
          <CardHeader>
            <CardTitle>¿A quién citas?</CardTitle>
            <CardDescription>
              Cada apoderado citado podrá confirmar, rechazar o pedir otro horario.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={!!errors.recipientIds}>
                <FieldLabel>Apoderados</FieldLabel>
                <FieldDescription>Busca por nombre del apoderado o del estudiante.</FieldDescription>
                <RecipientPicker
                  search={searchCitationRecipientsAction}
                  placeholder="Buscar apoderado o estudiante…"
                  value={recipients}
                  onChange={(next) => {
                    setRecipients(next);
                    form.setValue(
                      "recipientIds",
                      next.map((r) => r.id),
                      { shouldValidate: form.formState.isSubmitted },
                    );
                  }}
                />
                <FieldError errors={[errors.recipientIds]} />
              </Field>

              {courses.length > 0 && (
                <FieldSet>
                  <FieldLegend variant="label">O todos los apoderados de un curso</FieldLegend>
                  <Controller
                    control={form.control}
                    name="courseIds"
                    render={({ field }) => (
                      <div className="grid gap-3">
                        {courses.map((course) => (
                          <Field key={course.id} orientation="horizontal">
                            <Checkbox
                              id={`course-${course.id}`}
                              checked={field.value.includes(course.id)}
                              onCheckedChange={(checked) => {
                                field.onChange(
                                  checked
                                    ? [...field.value, course.id]
                                    : field.value.filter((v) => v !== course.id),
                                );
                                if (form.formState.isSubmitted) void form.trigger("recipientIds");
                              }}
                            />
                            <FieldLabel htmlFor={`course-${course.id}`} className="font-normal">
                              {course.name}
                              <span className="text-muted-foreground">
                                ({course.guardianCount} apoderado{course.guardianCount === 1 ? "" : "s"})
                              </span>
                            </FieldLabel>
                          </Field>
                        ))}
                      </div>
                    )}
                  />
                </FieldSet>
              )}
            </FieldGroup>
          </CardContent>
        </Card>

        <Button type="submit" className="h-11 w-full text-base" disabled={isPending}>
          {isPending ? <Spinner /> : <Send />}
          {isPending ? "Enviando…" : "Enviar citación"}
        </Button>
      </div>
    </form>
  );
}
