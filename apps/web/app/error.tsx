"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/observability";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error(error, { stage: "route_segment_error", digest: error.digest });
  }, [error]);

  const handleReset = () => reset();

  return (
    <main
      role="alert"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-muted-foreground">
        We hit an unexpected error loading this page. Our team has been notified.
      </p>
      <Button onClick={handleReset}>Try again</Button>
    </main>
  );
}
