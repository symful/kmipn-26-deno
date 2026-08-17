import { Component, ErrorInfo, ReactNode } from "react";
import { logger } from "../lib/logger";
import { colors } from "../theme/tokens";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error("ErrorBoundary caught", { error: error.message, errorInfo: info.componentStack });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-sigap-background p-6">
          <div className="max-w-md w-full bg-white rounded-lg shadow p-6 text-center">
            <h1 className="text-2xl font-bold mb-2">Terjadi kesalahan</h1>
            <p className="text-sigap-textMuted mb-4">
              Aplikasi mengalami kesalahan tak terduga. Silakan muat ulang halaman.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded text-white"
              style={{ backgroundColor: colors.perluTindakan }}
            >
              Muat ulang
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
