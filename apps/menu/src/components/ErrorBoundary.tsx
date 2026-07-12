import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/** Catches rendering errors and shows a recovery UI instead of a blank screen */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-screen bg-tg-bg flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-[#E53935]/10 flex items-center justify-center mb-4 text-3xl">
            ⚠️
          </div>
          <h2 className="text-xl font-bold text-tg-text mb-2">Something went wrong</h2>
          <p className="text-tg-hint text-sm mb-6 max-w-xs">
            The app ran into an unexpected error. Try refreshing to get back on track.
          </p>
          <button
            onClick={this.handleRetry}
            className="bg-brand-primary text-white py-3 px-8 rounded-xl font-bold text-sm active:opacity-90 transition-opacity"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
