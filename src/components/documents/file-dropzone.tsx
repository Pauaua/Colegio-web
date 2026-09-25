"use client";

import { CheckCircle2, FileUp, RotateCcw, X } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatFileSize, FILE_INPUT_ACCEPT } from "@/lib/files";
import { cn } from "@/lib/utils";
import { fileMetaSchema, type FileMeta } from "@/lib/validations/document";

export type UploadedFile = FileMeta & { fileKey: string };

type UploadState =
  | { status: "idle" }
  | { status: "uploading"; file: File; progress: number }
  | { status: "done"; file: File; uploaded: UploadedFile }
  | { status: "error"; file?: File; message: string };

type UploadUrlResponse = {
  fileKey: string;
  upload: { url: string; method: "PUT"; headers: Record<string, string> };
};

/** PUT con XMLHttpRequest: fetch() aún no expone el progreso de subida. */
function putWithProgress(
  target: UploadUrlResponse["upload"],
  file: File,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(target.method, target.url);
    for (const [name, value] of Object.entries(target.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Error ${xhr.status}`));
    xhr.onerror = () => reject(new Error("Error de red"));
    xhr.onabort = () => reject(new DOMException("Cancelado", "AbortError"));
    signal.addEventListener("abort", () => xhr.abort());
    xhr.send(file);
  });
}

export function FileDropzone({
  onUploaded,
  onCleared,
  invalid,
}: {
  onUploaded: (file: UploadedFile) => void;
  onCleared: () => void;
  invalid?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<UploadState>({ status: "idle" });
  const [isDragging, setIsDragging] = useState(false);

  async function handleFile(file: File) {
    abortRef.current?.abort();
    onCleared();

    const meta = { fileName: file.name, mimeType: file.type, fileSize: file.size };
    const check = fileMetaSchema.safeParse(meta);
    if (!check.success) {
      setState({ status: "error", file, message: check.error.issues[0]?.message ?? "Archivo inválido" });
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: "uploading", file, progress: 0 });

    try {
      const response = await fetch("/api/documents/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(meta),
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "No se pudo preparar la subida");

      const { fileKey, upload } = body as UploadUrlResponse;
      await putWithProgress(
        upload,
        file,
        (progress) => setState({ status: "uploading", file, progress }),
        controller.signal,
      );

      const uploaded = { ...check.data, fileKey };
      setState({ status: "done", file, uploaded });
      onUploaded(uploaded);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState({
        status: "error",
        file,
        message: `No pudimos subir el archivo (${error instanceof Error ? error.message : "error desconocido"}).`,
      });
    }
  }

  function clear() {
    abortRef.current?.abort();
    setState({ status: "idle" });
    onCleared();
    if (inputRef.current) inputRef.current.value = "";
  }

  const hasFile = state.status === "uploading" || state.status === "done";

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={FILE_INPUT_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {!hasFile ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            const file = event.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
          aria-describedby={state.status === "error" ? "dropzone-error" : undefined}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed bg-card px-6 py-10 text-center transition-colors",
            "hover:border-primary hover:bg-primary-soft/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
            isDragging && "border-primary bg-primary-soft/60",
            (invalid || state.status === "error") && "border-destructive/60",
          )}
        >
          <span className="grid size-14 place-items-center rounded-2xl bg-brand-gradient">
            <FileUp className="size-7" strokeWidth={1.5} />
          </span>
          <span className="font-semibold">Arrastra el archivo aquí o haz clic para elegirlo</span>
          <span className="text-sm text-muted-foreground">PDF, DOCX, JPG o PNG · máximo 10 MB</span>
        </button>
      ) : (
        <div className="rounded-2xl border bg-card p-4 shadow-soft">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary-soft">
              {state.status === "done" ? (
                <CheckCircle2 className="size-5 text-success-foreground" />
              ) : (
                <FileUp className="size-5" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{state.file.name}</p>
              <p className="text-sm text-muted-foreground">
                {formatFileSize(state.file.size)} ·{" "}
                {state.status === "done" ? "Subido" : `Subiendo… ${state.progress}%`}
              </p>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={clear} aria-label="Quitar archivo">
              <X />
            </Button>
          </div>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Progreso de subida"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={state.status === "done" ? 100 : state.progress}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-200"
              style={{ width: `${state.status === "done" ? 100 : state.progress}%` }}
            />
          </div>
        </div>
      )}

      {state.status === "error" && (
        <div
          id="dropzone-error"
          role="alert"
          className="flex items-center justify-between gap-3 text-sm text-destructive"
        >
          <span>{state.message}</span>
          {state.file && (
            <Button type="button" variant="ghost" size="sm" onClick={() => void handleFile(state.file!)}>
              <RotateCcw />
              Reintentar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
