"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Save } from "lucide-react";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  changePasswordSchema,
  profileSchema,
  type ChangePasswordInput,
  type ProfileInput,
} from "@/lib/validations/user";
import { changePasswordAction, updateProfileAction } from "@/server/actions/users";

export function ProfileForm({ phone }: { phone: string }) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<ProfileInput>({ resolver: zodResolver(profileSchema), defaultValues: { phone } });
  const { errors } = form.formState;

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) =>
        startTransition(async () => {
          const result = await updateProfileAction(values);
          if (result.ok) toast.success("Datos actualizados");
          else toast.error(result.error);
        }),
      )}
      className="flex flex-col gap-4 sm:flex-row sm:items-start"
    >
      <Field data-invalid={!!errors.phone} className="flex-1">
        <FieldLabel htmlFor="phone">Teléfono de contacto</FieldLabel>
        <Input id="phone" type="tel" placeholder="+56 9 1234 5678" {...form.register("phone")} />
        <FieldError errors={[errors.phone]} />
      </Field>
      <Button type="submit" variant="secondary" disabled={isPending} className="sm:mt-[1.625rem]">
        {isPending ? <Spinner /> : <Save />} Guardar
      </Button>
    </form>
  );
}

export function ChangePasswordForm() {
  const [isPending, startTransition] = useTransition();
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const { errors } = form.formState;

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) =>
        startTransition(async () => {
          const result = await changePasswordAction(values);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success("Contraseña actualizada");
          form.reset();
        }),
      )}
      className="space-y-6"
    >
      <FieldGroup>
        <Field data-invalid={!!errors.currentPassword}>
          <FieldLabel htmlFor="currentPassword">Contraseña actual</FieldLabel>
          <Input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.currentPassword}
            {...form.register("currentPassword")}
          />
          <FieldError errors={[errors.currentPassword]} />
        </Field>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field data-invalid={!!errors.newPassword}>
            <FieldLabel htmlFor="newPassword">Nueva contraseña</FieldLabel>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.newPassword}
              {...form.register("newPassword")}
            />
            <FieldDescription>Mínimo 8 caracteres, con letras y números.</FieldDescription>
            <FieldError errors={[errors.newPassword]} />
          </Field>
          <Field data-invalid={!!errors.confirmPassword}>
            <FieldLabel htmlFor="confirmPassword">Repite la nueva contraseña</FieldLabel>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.confirmPassword}
              {...form.register("confirmPassword")}
            />
            <FieldError errors={[errors.confirmPassword]} />
          </Field>
        </div>
      </FieldGroup>
      <Button type="submit" disabled={isPending}>
        {isPending ? <Spinner /> : <KeyRound />} Cambiar contraseña
      </Button>
    </form>
  );
}
