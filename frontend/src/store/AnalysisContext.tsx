'use client';

import {
    createContext,
    useContext,
    useState,
    useCallback,
    ReactNode,
} from 'react';
import { AnalysisResult } from '@/types';

interface AnalysisContextValue {
    /** The latest unified analysis result (null if none yet). */
    result: AnalysisResult | null;
    /** Whether an analysis has been performed at least once. */
    hasResult: boolean;
    /** Store a new analysis result (called after any POST endpoint). */
    setResult: (result: AnalysisResult) => void;
    /** Clear the stored result. */
    clearResult: () => void;
}

const AnalysisContext = createContext<AnalysisContextValue | undefined>(
    undefined
);

export function AnalysisProvider({ children }: { children: ReactNode }) {
    const [result, setResultState] = useState<AnalysisResult | null>(null);

    const setResult = useCallback((r: AnalysisResult) => {
        setResultState(r);
    }, []);

    const clearResult = useCallback(() => {
        setResultState(null);
    }, []);

    return (
        <AnalysisContext.Provider
            value={{
                result,
                hasResult: result !== null,
                setResult,
                clearResult,
            }}
        >
            {children}
        </AnalysisContext.Provider>
    );
}

export function useAnalysis(): AnalysisContextValue {
    const ctx = useContext(AnalysisContext);
    if (!ctx) {
        throw new Error('useAnalysis must be used within an AnalysisProvider');
    }
    return ctx;
}
