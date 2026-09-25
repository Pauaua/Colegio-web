import { FileQuestion, Home } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <EmptyState
        icon={FileQuestion}
        title="No encontramos esta página"
        description="Puede que el enlace esté mal escrito o que el contenido ya no exista."
        className="w-full max-w-lg"
        action={
          <Button asChild>
            <Link href="/">
              <Home />
              Volver al inicio
            </Link>
          </Button>
        }
      />
    </main>
  );
}
