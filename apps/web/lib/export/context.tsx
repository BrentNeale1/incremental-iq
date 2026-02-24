'use client';

import * as React from 'react';

interface ExportContextValue {
  data: Record<string, unknown>[];
  filename: string;
  setExportData: (data: Record<string, unknown>[], filename: string) => void;
}

const ExportContext = React.createContext<ExportContextValue>({
  data: [],
  filename: 'export',
  setExportData: () => {},
});

export function ExportProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = React.useState<Record<string, unknown>[]>([]);
  const [filename, setFilename] = React.useState('export');

  const setExportData = React.useCallback(
    (newData: Record<string, unknown>[], newFilename: string) => {
      setData(newData);
      setFilename(newFilename);
    },
    [],
  );

  const value = React.useMemo(
    () => ({ data, filename, setExportData }),
    [data, filename, setExportData],
  );

  return (
    <ExportContext.Provider value={value}>{children}</ExportContext.Provider>
  );
}

export function useExportContext() {
  return React.useContext(ExportContext);
}
