import React from 'react';
import { Terminal as TerminalIcon } from 'lucide-react';

export function Terminal({ output, status, error }) {
    return (
        <div className="flex flex-col h-full bg-[#1e1e1e]">
            <div className="px-4 py-2 bg-[#252526] border-b border-[#333] flex items-center justify-between">
                <div className="flex items-center gap-2 text-gray-400 text-xs font-semibold tracking-wider">
                    <TerminalIcon size={14} />
                    <span>TERMINAL</span>
                </div>
                <div className="flex items-center gap-2">
                    {error ? (
                        <span className="text-red-400 text-xs flex items-center gap-1">
                            ● Analysis Failed
                        </span>
                    ) : (
                        <span className="text-green-400 text-xs flex items-center gap-1">
                            ● Static Analysis Passed
                        </span>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-auto p-4 font-mono text-sm">
                {output.map((line, i) => (
                    <div key={i} className="text-gray-300 font-mono mb-1 whitespace-pre-wrap">
                        {line}
                    </div>
                ))}
                {error && (
                    <div className="text-red-400 mt-4 border-t border-red-900/50 pt-2 font-mono">
                        {error.map((err, i) => (
                            <div key={i}>Error: {err}</div>
                        ))}
                    </div>
                )}
                <div className="text-gray-500 mt-2">_</div>
            </div>
        </div>
    );
}
