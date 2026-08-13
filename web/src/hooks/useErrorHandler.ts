import { useCallback } from "react";
import { toast } from "./useToast";
import { logger } from "../lib/logger";

export function useErrorHandler() {
  const handleError = useCallback((err: unknown, context?: string) => {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan";
    const fullMessage = context ? `${context}: ${message}` : message;

    // Log to backend
    logger.error(fullMessage, {
      originalError: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });

    // Show toast to user
    toast.error(message);
  }, []);

  return { handleError };
}
