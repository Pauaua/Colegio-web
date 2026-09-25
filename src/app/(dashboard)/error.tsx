"use client";

import { CloudAlert, RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      icon={CloudAlert}
      title="Algo no salió como esperábamos"
      description="Tuvimos un problema al cargar esta página. Puedes intentarlo otra vez en unos segundos."
      action={
        <Button onClick={() => retry()}>
          <RotateCcw />
          Reintentar
        </Button>
      }
    />
  );
}
