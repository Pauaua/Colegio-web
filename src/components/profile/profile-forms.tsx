"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, KeyRound, Save, Trash2 } from "lucide-react";
import { useRef, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  AVATAR_SIZE,
  AVATAR_SOURCE_ACCEPT,
  MAX_AVATAR_SOURCE_SIZE,
  MAX_AVATAR_UPLOAD_SIZE,
} from "@/lib/avatar";
import {
  changePasswordSchema,
  profileSchema,
  type ChangePasswordInput,
  type ProfileInput,
} from "@/lib/validations/user";
import {
  changePasswordAction,
  removeAvatarAction,
  updateAvatarAction,
  updateProfileAction,
} from "@/server/actions/users";

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

/** Recorta la imagen al centro, la reduce a AVATAR_SIZE px y la convierte a JPEG. */
async function toAvatarJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const context = canvas.getContext("2d")!;
  // Fondo blanco: las zonas transparentes de un PNG no quedan negras en el JPEG.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE,
  );
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob"))), "image/jpeg", 0.88),
  );
}

type AvatarFormProps = { fullName: string; src: string | null };

export function AvatarForm({ fullName, src }: AvatarFormProps) {
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function upload(file: File) {
    if (!AVATAR_SOURCE_ACCEPT.split(",").includes(file.type)) {
      toast.error("Usa una imagen JPG, PNG o WebP");
      return;
    }
    if (file.size > MAX_AVATAR_SOURCE_SIZE) {
      toast.error("La imagen supera los 15 MB");
      return;
    }
    startTransition(async () => {
      let jpeg: Blob;
      try {
        jpeg = await toAvatarJpeg(file);
      } catch {
        toast.error("No pudimos leer esa imagen");
        return;
      }
      if (jpeg.size > MAX_AVATAR_UPLOAD_SIZE) {
        toast.error("La imagen es demasiado grande");
        return;
      }
      const formData = new FormData();
      formData.set("avatar", jpeg, "avatar.jpg");
      const result = await updateAvatarAction(formData);
      if (result.ok) toast.success("Foto de perfil actualizada");
      else toast.error(result.error);
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await removeAvatarAction();
      if (result.ok) toast.success("Foto de perfil eliminada");
      else toast.error(result.error);
    });
  }

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <UserAvatar fullName={fullName} src={src} className="size-24" fallbackClassName="text-2xl" />
      <div className="flex flex-col items-center gap-3 sm:items-start">
        <p className="text-center text-sm text-muted-foreground sm:text-left">
          JPG, PNG o WebP. Se recorta en forma cuadrada, al centro de la imagen.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={AVATAR_SOURCE_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) upload(file);
            }}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={() => inputRef.current?.click()}
          >
            {isPending ? <Spinner /> : <Camera />} {src ? "Cambiar foto" : "Subir foto"}
          </Button>
          {src && (
            <Button type="button" variant="ghost" disabled={isPending} onClick={remove}>
              <Trash2 /> Quitar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
