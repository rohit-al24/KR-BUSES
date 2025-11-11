import React from 'react';

type State = { hasError: boolean; error?: Error | null };

class ErrorBoundary extends React.Component<React.PropsWithChildren<{}>, State> {
  constructor(props: React.PropsWithChildren<{}>) {
    super(props as any);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    // log to console for now
    console.error('ErrorBoundary caught', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 max-w-2xl mx-auto">
          <div className="border rounded-md p-4 bg-destructive/10 text-destructive">
            <h3 className="font-semibold text-lg">Something went wrong</h3>
            <p className="mt-2 text-sm">{this.state.error?.message || 'An unexpected error occurred.'}</p>
          </div>
        </div>
      );
    }

    return this.props.children as React.ReactElement;
  }
}

export default ErrorBoundary;
