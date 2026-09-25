"use client";

import { Archive, ArchiveRestore, CheckCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { Spinner } from "@/components/ui/spinner";
import {
  acknowledgeDocumentAction,
  deleteDocumentAction,
  setDocumentArchivedAction,
} from "@/server/actions/documents";

export function AcknowledgeButton({ documentId, className }: { documentId: string; className?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      className={className}
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await acknowledgeDocumentAction(documentId);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success("¡Listo! Confirmaste la lectura del documento.");
          router.refresh();
        })
      }
    >
      {isPending ? <Spinner /> : <CheckCheck />}
      Confirmar lectura
    </Button>
  );
}

export function ArchiveButton({ documentId, archived }: { documentId: string; archived: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await setDocumentArchivedAction(documentId, !archived);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(archived ? "Documento restaurado" : "Documento archivado");
          router.refresh();
        })
      }
    >
      {isPending ? <Spinner /> : archived ? <ArchiveRestore /> : <Archive />}
      {archived ? "Restaurar" : "Archivar"}
    </Button>
  );
}

export function DeleteDocumentButton({ documentId, title }: { documentId: string; title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="text-destructive hover:bg-destructive-soft/40 hover:text-destructive"
        >
          <Trash2 /> Eliminar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Eliminar este documento?</DialogTitle>
          <DialogDescription>
            «{title}» dejará de estar disponible para todos. La eliminación queda registrada en la auditoría y
            el archivo se conserva como respaldo.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteDocumentAction(documentId);
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                setOpen(false);
                toast.success("Documento eliminado");
                router.push("/documentos");
              })
            }
          >
            {isPending ? <Spinner /> : <Trash2 />}
            Eliminar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
