/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { ErrorModal } from '../components/ui/ErrorModal';

interface ErrorContextType {
  showError: (message: string, title?: string) => void;
  hideError: () => void;
}

const ErrorContext = createContext<ErrorContextType | undefined>(undefined);

export function ErrorProvider({ children }: { children: ReactNode }) {
  const [errorConfig, setErrorConfig] = useState<{ message: string; title?: string } | null>(null);

  const showError = useCallback((message: string, title?: string) => {
    setErrorConfig({ message, title });
  }, []);

  const hideError = useCallback(() => {
    setErrorConfig(null);
  }, []);

  return (
    <ErrorContext.Provider value={{ showError, hideError }}>
      {children}
      {errorConfig && (
        <ErrorModal 
          message={errorConfig.message} 
          title={errorConfig.title}
          onClose={hideError} 
        />
      )}
    </ErrorContext.Provider>
  );
}

export function useError() {
  const context = useContext(ErrorContext);
  if (context === undefined) {
    throw new Error('useError must be used within an ErrorProvider');
  }
  return context;
}
