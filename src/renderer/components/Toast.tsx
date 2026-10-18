import React, { createContext, useContext, useState, useCallback } from 'react';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

interface ToastContextValue {
  showToast: (type: Toast['type'], message: string) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((type: Toast['type'], message: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const colorMap: Record<Toast['type'], string> = {
    success: 'border-green-600 bg-green-900/80 text-green-100',
    error: 'border-red-600 bg-red-900/80 text-red-100',
    warning: 'border-yellow-600 bg-yellow-900/80 text-yellow-100',
    info: 'border-violet-600 bg-violet-900/80 text-violet-100',
  };

  const iconMap: Record<Toast['type'], string> = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-2 px-4 py-3 rounded-lg border backdrop-blur-sm
                        text-sm font-medium shadow-xl animate-fade-in max-w-sm ${colorMap[t.type]}`}
          >
            <span className="text-base">{iconMap[t.type]}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
