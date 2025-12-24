import React from 'react';

export function CodeEditor({ code, onChange }) {
    return (
        <div className="flex flex-col h-full bg-[#1e1e1e] border-r border-[#333]">
            <div className="px-4 py-2 bg-[#252526] text-gray-400 text-xs font-semibold tracking-wider border-b border-[#333] flex items-center">
                <span>MAIN.PYRUST</span>
            </div>
            <textarea
                className="flex-1 w-full bg-[#1e1e1e] text-[#d4d4d4] font-mono text-sm p-4 resize-none focus:outline-none"
                value={code}
                onChange={(e) => onChange(e.target.value)}
                spellCheck="false"
                style={{ tabSize: 4 }}
                onKeyDown={(e) => {
                    if (e.key === 'Tab') {
                        e.preventDefault();
                        const start = e.target.selectionStart;
                        const end = e.target.selectionEnd;
                        const value = e.target.value;
                        onChange(value.substring(0, start) + '    ' + value.substring(end));

                        // Need to set cursor position after render, simplified for now
                        setTimeout(() => {
                            e.target.selectionStart = e.target.selectionEnd = start + 4;
                        }, 0);
                    }
                }}
            />
        </div>
    );
}
