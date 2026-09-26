"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/roles";
import { formatRut } from "@/lib/rut";
import { userGroupHref } from "@/lib/user-groups";
import {
  createUserSchema,
  updateUserSchema,
  type CreateUserInput,
  type UpdateUserInput,
} from "@/lib/validations/user";
import { createUserAction, updateUserAction } from "@/server/actions/users";

type Props =
  | { mode: "create"; defaultRole?: Role }
  | { mode: "edit"; userId: string; defaultValues: UpdateUserInput; isSelf: boolean };

export function UserForm(props: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isEdit = props.mode === "edit";

  const form = useForm<CreateUserInput | UpdateUserInput>({
    resolver: zodResolver(isEdit ? updateUserSchema : createUserSchema),
    defaultValues: isEdit
      ? props.defaultValues
      : { fullName: "", rut: "", email: "", role: props.defaultRole, phone: "", password: "" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result =
        props.mode === "edit" ? await updateUserAction(props.userId, values) : await createUserAction(values);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(isEdit ? "Usuario actualizado" : "Usuario creado");
      router.push(userGroupHref(values.role));
      router.refresh();
    }),
  );

  return (
    <Card className="max-w-3xl rounded-2xl shadow-soft">
      <CardContent className="p-6">
        <form onSubmit={onSubmit} noValidate className="space-y-8">
          <FieldGroup>
            <Field data-invalid={!!errors.fullName}>
              <FieldLabel htmlFor="fullName">Nombre completo</FieldLabel>
              <Input
                id="fullName"
                autoComplete="off"
                aria-invalid={!!errors.fullName}
                {...form.register("fullName")}
              />
              <FieldError errors={[errors.fullName]} />
            </Field>

            <div className="grid gap-6 sm:grid-cols-2">
              <Field data-invalid={!!errors.rut}>
                <FieldLabel htmlFor="rut">RUT</FieldLabel>
                <Input
                  id="rut"
                  placeholder="12.345.678-5"
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
              <Field data-invalid={!!errors.email}>
                <FieldLabel htmlFor="email">Correo</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  autoComplete="off"
                  aria-invalid={!!errors.email}
                  {...form.register("email")}
                />
                <FieldError errors={[errors.email]} />
              </Field>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <Field data-invalid={!!errors.role}>
                <FieldLabel htmlFor="role">Rol</FieldLabel>
                <Controller
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <Select
                      value={field.value ?? ""}
                      onValueChange={field.onChange}
                      disabled={isEdit && props.isSelf}
                    >
                      <SelectTrigger id="role" className="w-full" aria-invalid={!!errors.role}>
                        <SelectValue placeholder="Elige un rol" />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((role) => (
                          <SelectItem key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {isEdit && props.isSelf && (
                  <FieldDescription>No puedes cambiar tu propio rol.</FieldDescription>
                )}
                <FieldError errors={[errors.role]} />
              </Field>
              <Field data-invalid={!!errors.phone}>
                <FieldLabel htmlFor="phone">Teléfono (opcional)</FieldLabel>
                <Input id="phone" type="tel" placeholder="+56 9 1234 5678" {...form.register("phone")} />
                <FieldError errors={[errors.phone]} />
              </Field>
            </div>

            <Field data-invalid={!!errors.password}>
              <FieldLabel htmlFor="password">
                {isEdit ? "Nueva contraseña (opcional)" : "Contraseña inicial"}
              </FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.password}
                {...form.register("password")}
              />
              <FieldDescription>
                {isEdit
                  ? "Déjala vacía para no cambiarla. Mínimo 8 caracteres, con letras y números."
                  : "Mínimo 8 caracteres, con letras y números. Compártela con la persona de forma segura."}
              </FieldDescription>
              <FieldError errors={[errors.password]} />
            </Field>
          </FieldGroup>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Spinner /> : <Save />}
              {isEdit ? "Guardar cambios" : "Crear usuario"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
