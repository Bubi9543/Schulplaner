import { Component, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Fängt Render-Fehler einzelner Komponenten ab, damit ein Crash nicht die
 * ganze App in einen leeren (schwarzen) Bildschirm verwandelt. Zeigt
 * stattdessen eine freundliche Fehlerkarte mit Neu-laden-Button.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // Für Debugging in der Konsole sichtbar lassen.
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen grid place-items-center theme-aurora p-6">
          <div className="card max-w-md text-center">
            <div className="size-12 rounded-2xl bg-red-500/15 grid place-items-center mx-auto mb-4">
              <AlertTriangle className="size-6 text-red-500" />
            </div>
            <h1 className="h2 mb-2">Ups – da ist was schiefgelaufen</h1>
            <p className="subtle mb-5">
              Ein Teil der App konnte nicht geladen werden. Lade die Seite neu –
              deine Daten sind sicher gespeichert.
            </p>
            <button onClick={() => window.location.reload()} className="btn-primary mx-auto">
              <RotateCcw className="size-4" />
              Neu laden
            </button>
            {import.meta.env.DEV && (
              <pre className="mt-4 text-left text-xs text-ink-400 whitespace-pre-wrap break-words max-h-40 overflow-auto">
                {this.state.error.message}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
