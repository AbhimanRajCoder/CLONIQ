'use client';

import { AnalysisProvider } from '@/store/AnalysisContext';
import { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
    return <AnalysisProvider>{children}</AnalysisProvider>;
}
