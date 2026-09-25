"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FileText, Save, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { FileDropzone, type UploadedFile } from "@/components/documents/file-dropzone";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { documentFormSchema, type DocumentFormValues } from "@/lib/validations/document";
import {
  createDocumentAction,
  searchRecipientsAction,
  suggestFolioAction,
  updateDocumentAction,
  type RecipientOption,
} from "@/server/actions/documents";

type Mode =
  | { type: "create"; today: string }
  | {
      type: "edit";
      documentId: string;
      defaultValues: DocumentFormValues;
      initialRecipients: RecipientOption[];
      fileName: string;
    };

type Props = {
  mode: Mode;
  documentTypes: { id: string; name: string; color: string }[];
  courses: { id: string; name: string; guardianCount: number }[];
};

const VISIBILITY_OPTIONS = [
  { value: "DOCENTE", label: "Docentes", description: "Todos los docentes podrán verlo y descargarlo." },
  {
    value: "APODERADO",
    label: "Apoderados",
    description: "Todos los apoderados podrán verlo y descargarlo.",
  },
] as const;

/** Formulario de documento: subida (con archivo) o edición de metadatos y visibilidad. */
export function DocumentForm({ mode, documentTypes, courses }: Props) {
  const router = useRouter();
  const isEdit = mode.type === "edit";
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<RecipientOption[]>(isEdit ? mode.initialRecipients : []);
  // Al editar, el folio existente se respeta: no se reemplaza por una sugerencia.
  const [folioEditedByUser, setFolioEditedByUser] = useState(isEdit);
  const [isSubmitting, startSubmit] = useTransition();

  const form = useForm<DocumentFormValues>({
    resolver: zodResolver(documentFormSchema),
    defaultValues: isEdit
      ? mode.defaultValues
      : {
          title: "",
          documentTypeId: "",
          documentDate: mode.today,
          folioNumber: undefined as unknown as number,
          description: "",
          visibility: [],
          recipientIds: [],
          courseIds: [],
          requiresAcknowledgement: false,
        },
  });
  const { errors } = form.formState;

  // Sugerencia automática de folio: siguiente número libre del tipo en el año de la fecha.
  const [documentTypeId, documentDate] = useWatch({
    control: form.control,
    name: ["documentTypeId", "documentDate"],
  });
  const folioYear = Number(documentDate?.slice(0, 4));
  useEffect(() => {
    if (!documentTypeId || !folioYear || folioEditedByUser) return;
    let cancelled = false;
    void suggestFolioAction({ documentTypeId, year: folioYear }).then((result) => {
      if (!cancelled && result.ok) {
        form.setValue("folioNumber", result.data.folioNumber, { shouldValidate: true });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [documentTypeId, folioYear, folioEditedByUser, form]);

  const onSubmit = form.handleSubmit((values) => {
    if (mode.type === "edit") {
      startSubmit(async () => {
        const result = await updateDocumentAction(mode.documentId, values);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Cambios guardados");
        router.push(`/documentos/${mode.documentId}`);
        router.refresh();
      });
      return;
    }
    if (!uploadedFile) {
      setFileError("Adjunta el archivo del documento");
      return;
    }
    startSubmit(async () => {
      const result = await createDocumentAction({ ...values, ...uploadedFile });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Documento guardado");
      router.push(`/documentos/${result.data.id}`);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        <Card className="rounded-2xl shadow-soft">
          <CardHeader>
            <CardTitle>Archivo</CardTitle>
            <CardDescription>
              {isEdit
                ? "El archivo no se puede reemplazar; si cambió, sube un documento nuevo."
                : "Se sube de forma segura apenas lo eliges."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isEdit ? (
              <div className="flex items-center gap-3 rounded-2xl border bg-muted/40 p-4">
                <FileText className="size-5 shrink-0 text-muted-foreground" />
                <span className="truncate font-medium">{mode.fileName}</span>
              </div>
            ) : (
              <FileDropzone
                invalid={!!fileError}
                onUploaded={(file) => {
                  setUploadedFile(file);
                  setFileError(null);
                  if (!form.getValues("title")) {
                    const suggested = file.fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
                    form.setValue("title", suggested.slice(0, 200));
                  }
                }}
                onCleared={() => setUploadedFile(null)}
              />
            )}
            {fileError && <FieldError className="mt-2">{fileError}</FieldError>}
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-soft">
          <CardHeader>
            <CardTitle>Clasificación</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={!!errors.title}>
                <FieldLabel htmlFor="title">Título</FieldLabel>
                <Input id="title" aria-invalid={!!errors.title} {...form.register("title")} />
                <FieldError errors={[errors.title]} />
              </Field>

              <div className="grid gap-6 sm:grid-cols-3">
                <Field data-invalid={!!errors.documentTypeId}>
                  <FieldLabel htmlFor="documentTypeId">Tipo</FieldLabel>
                  <Controller
                    control={form.control}
                    name="documentTypeId"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger
                          id="documentTypeId"
                          aria-invalid={!!errors.documentTypeId}
                          className="w-full"
                        >
                          <SelectValue placeholder="Elige un tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          {documentTypes.map((type) => (
                            <SelectItem key={type.id} value={type.id}>
                              <span
                                className="size-2.5 rounded-full"
                                style={{ backgroundColor: type.color }}
                              />
                              {type.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[errors.documentTypeId]} />
                </Field>

                <Field data-invalid={!!errors.documentDate}>
                  <FieldLabel htmlFor="documentDate">Fecha del documento</FieldLabel>
                  <Input
                    id="documentDate"
                    type="date"
                    aria-invalid={!!errors.documentDate}
                    {...form.register("documentDate")}
                  />
                  <FieldError errors={[errors.documentDate]} />
                </Field>

                <Field data-invalid={!!errors.folioNumber}>
                  <FieldLabel htmlFor="folioNumber">Folio</FieldLabel>
                  <Input
                    id="folioNumber"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    aria-invalid={!!errors.folioNumber}
                    {...form.register("folioNumber", {
                      valueAsNumber: true,
                      onChange: () => setFolioEditedByUser(true),
                    })}
                  />
                  {!folioEditedByUser && documentTypeId ? (
                    <FieldDescription className="flex items-center gap-1">
                      <Sparkles className="size-3.5" /> Siguiente folio disponible de{" "}
                      {folioYear || "este año"}
                    </FieldDescription>
                  ) : null}
                  <FieldError errors={[errors.folioNumber]} />
                </Field>
              </div>

              <Field data-invalid={!!errors.description}>
                <FieldLabel htmlFor="description">Descripción (opcional)</FieldLabel>
                <Textarea id="description" rows={4} {...form.register("description")} />
                <FieldError errors={[errors.description]} />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="rounded-2xl shadow-soft">
          <CardHeader>
            <CardTitle>¿Quién puede verlo?</CardTitle>
            <CardDescription>El equipo directivo siempre ve todos los documentos.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <FieldSet>
                <FieldLegend variant="label">Visible para</FieldLegend>
                <Controller
                  control={form.control}
                  name="visibility"
                  render={({ field }) => (
                    <div className="space-y-3">
                      {VISIBILITY_OPTIONS.map((option) => (
                        <Field key={option.value} orientation="horizontal">
                          <Checkbox
                            id={`visibility-${option.value}`}
                            checked={field.value.includes(option.value)}
                            onCheckedChange={(checked) =>
                              field.onChange(
                                checked
                                  ? [...field.value, option.value]
                                  : field.value.filter((v) => v !== option.value),
                              )
                            }
                          />
                          <div className="space-y-0.5">
                            <FieldLabel htmlFor={`visibility-${option.value}`}>{option.label}</FieldLabel>
                            <FieldDescription>{option.description}</FieldDescription>
                          </div>
                        </Field>
                      ))}
                    </div>
                  )}
                />
              </FieldSet>

              <Field>
                <FieldLabel>Destinatarios específicos</FieldLabel>
                <FieldDescription>
                  Por ejemplo, el apoderado citado. Lo verán aunque no esté marcado arriba.
                </FieldDescription>
                <RecipientPicker
                  search={searchRecipientsAction}
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
              </Field>

              {courses.length > 0 && (
                <FieldSet>
                  <FieldLegend variant="label">Todos los apoderados de un curso</FieldLegend>
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
                              onCheckedChange={(checked) =>
                                field.onChange(
                                  checked
                                    ? [...field.value, course.id]
                                    : field.value.filter((v) => v !== course.id),
                                )
                              }
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

              <Controller
                control={form.control}
                name="requiresAcknowledgement"
                render={({ field }) => (
                  <Field orientation="horizontal" data-invalid={!!errors.requiresAcknowledgement}>
                    <Checkbox
                      id="requiresAcknowledgement"
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                    />
                    <div className="space-y-0.5">
                      <FieldLabel htmlFor="requiresAcknowledgement">Requiere acuse de recibo</FieldLabel>
                      <FieldDescription>Los destinatarios deberán confirmar que lo leyeron.</FieldDescription>
                      <FieldError errors={[errors.requiresAcknowledgement]} />
                    </div>
                  </Field>
                )}
              />
            </FieldGroup>
          </CardContent>
        </Card>

        <Button type="submit" className="h-11 w-full text-base" disabled={isSubmitting}>
          {isSubmitting ? <Spinner /> : <Save />}
          {isSubmitting ? "Guardando…" : isEdit ? "Guardar cambios" : "Guardar documento"}
        </Button>
      </div>
    </form>
  );
}
