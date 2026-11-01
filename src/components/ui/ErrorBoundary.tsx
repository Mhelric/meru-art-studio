import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches JavaScript errors anywhere in their child component tree,
 * logs those errors, and displays a graceful fallback UI instead of crashing the whole app.
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Uncaught error in Meru Art Studio component tree:', error, errorInfo);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleGoHome = (): void => {
    this.setState({ hasError: false, error: null });
    window.location.hash = '#portfolio';
    window.location.reload();
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-canvas p-6 text-center select-none">
          <div className="w-full max-w-md rounded-3xl border border-line bg-paper p-8 shadow-sm">
            <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-coral-soft text-coral">
              <AlertTriangle className="size-7" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-wider text-coral">
              Application Notice
            </span>
            <h2 className="mt-2 font-display text-2xl font-bold text-ink">
              Something went slightly off-canvas
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">
              An unexpected render error occurred. Your commission drafts and local state remain safe.
            </p>

            {this.state.error && (
              <div className="mt-4 overflow-hidden rounded-xl bg-canvas p-3 text-left">
                <p className="font-mono text-[11px] text-ink-mute break-words">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={this.handleReload}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-2.5 text-xs font-medium text-white transition hover:bg-coral"
              >
                <RefreshCw className="size-3.5" /> Reload Application
              </button>
              <button
                type="button"
                onClick={this.handleGoHome}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-line bg-paper px-5 py-2.5 text-xs font-medium text-ink transition hover:border-ink"
              >
                <Home className="size-3.5" /> Return to Gallery
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
