import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarUrl, initials } from "@/lib/avatar";
import { cn } from "@/lib/utils";

type Props = {
  fullName: string;
  /** Resultado de avatarUrl(); null muestra las iniciales. */
  src: string | null;
  className?: string;
  fallbackClassName?: string;
};

export function UserAvatar({ fullName, src, className, fallbackClassName }: Props) {
  return (
    <Avatar className={className}>
      {src && <AvatarImage src={src} alt={`Foto de ${fullName}`} />}
      <AvatarFallback className={cn("bg-secondary-soft font-semibold text-foreground", fallbackClassName)}>
        {initials(fullName)}
      </AvatarFallback>
    </Avatar>
  );
}

/** Tamaño de la foto según el texto que acompaña: xs para text-xs, sm para text-sm, md para dos líneas. */
const CHIP_SIZES = {
  xs: { avatar: "size-5", fallback: "text-[0.5625rem]" },
  sm: { avatar: "size-6", fallback: "text-[0.625rem]" },
  md: { avatar: "size-9", fallback: "text-xs" },
} as const;

type ChipProps = {
  fullName: string;
  src: string | null;
  size?: keyof typeof CHIP_SIZES;
  className?: string;
  /** Contenido en lugar del nombre (p. ej. nombre + correo en dos líneas). */
  children?: React.ReactNode;
};

/** Foto pequeña junto al nombre de una persona (autor de un documento, fila de usuario…). */
export function UserChip({ fullName, src, size = "sm", className, children }: ChipProps) {
  const sizes = CHIP_SIZES[size];
  return (
    <span className={cn("inline-flex min-w-0 items-center", size === "md" ? "gap-3" : "gap-1.5", className)}>
      <UserAvatar fullName={fullName} src={src} className={sizes.avatar} fallbackClassName={sizes.fallback} />
      {children ?? <span className="truncate">{fullName}</span>}
    </span>
  );
}

/** Atajo para autores que vienen de Prisma con { id, fullName, avatarKey }. */
export function AuthorChip({
  author,
  ...props
}: Omit<ChipProps, "fullName" | "src"> & {
  author: { id: string; fullName: string; avatarKey: string | null };
}) {
  return <UserChip fullName={author.fullName} src={avatarUrl(author.id, author.avatarKey)} {...props} />;
}
