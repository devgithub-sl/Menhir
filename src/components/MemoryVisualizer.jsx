import React from 'react';
import { Box, ArrowRight } from 'lucide-react';

export function MemoryVisualizer({ scopes }) {
    if (!scopes || scopes.length === 0) {
        return (
            <div className="h-full flex items-center justify-center text-gray-500 text-sm italic">
                No active memory
            </div>
        );
    }

    // Reverse scopes to show stack growing down (Global at top usually, or Stack like? Let's do Stack-like: Newest (Local) on top)
    // Actually, usually users prefer seeing Global at top or bottom? 
    // Let's do: Global at Bottom, Local at Top (Stack).
    const stack = [...scopes].reverse();

    return (
        <div className="flex flex-col gap-4 p-4 overflow-auto h-full bg-[#1e1e1e]">
            <h3 className="text-gray-400 font-bold text-xs uppercase tracking-wider mb-2">Memory Stack</h3>

            {stack.map((scope, index) => (
                <div key={scope.id} className="bg-[#2d2d2d] rounded-lg border border-[#333] p-3 shadow-sm">
                    <div className="flex items-center gap-2 mb-2 border-b border-[#444] pb-2">
                        <Box size={14} className="text-blue-400" />
                        <span className="text-xs font-semibold text-gray-300">
                            {index === stack.length - 1 ? 'Global Scope' : `Frame ${scope.id}`}
                        </span>
                    </div>

                    <div className="flex flex-col gap-2">
                        {Object.keys(scope.variables).length === 0 && (
                            <span className="text-gray-600 text-xs italic pl-1">Empty</span>
                        )}

                        {Object.entries(scope.variables).map(([name, varData]) => (
                            <div
                                key={name}
                                className={`flex items-center justify-between p-2 rounded ${varData.moved
                                    ? 'bg-[#252525] border border-dashed border-[#444] opacity-50'
                                    : 'bg-[#333] border-l-2 border-green-500'
                                    }`}
                            >
                                <div className="flex flex-col">
                                    <span className={`text-sm font-mono font-bold ${varData.moved ? 'text-gray-500 line-through' : 'text-blue-300'}`}>
                                        {name}
                                    </span>
                                    <span className="text-xs text-gray-500">{detectType(varData.value)}</span>
                                </div>

                                <div className="flex items-center text-xs font-mono text-gray-300">
                                    {renderValue(varData.value)}
                                    {varData.moved && <span className="ml-2 text-[10px] text-red-500 font-bold uppercase">(MOVED)</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

function detectType(val) {
    if (val === null || val === undefined) return 'None';
    if (Array.isArray(val)) return `List[${val.length}]`;
    if (typeof val === 'number') return 'int';
    if (typeof val === 'string') return 'str';
    if (typeof val === 'boolean') return 'bool';
    if (val && val.type === 'Closure') return 'Closure';
    if (val && val.enumType) return val.enumType;
    if (val && val._type) return val._type;
    return 'unknown';
}

function renderValue(val) {
    if (val === null || val === undefined) return 'None';
    if (val === true) return 'true';
    if (val === false) return 'false';

    if (Array.isArray(val)) {
        if (val.length === 0) return '[]';
        // Render first few items
        const preview = val.slice(0, 3).map(v => renderValue(v)).join(', ');
        return `[${preview}${val.length > 3 ? ', ...' : ''}]`;
    }

    if (typeof val === 'object') {
        if (val.type === 'Closure') {
            const params = val.params.map(p => p.name).join(', ');
            return `Fn(|${params}|)`;
        }
        if (val.enumType) { // Option/Result or User Enum
            if (val.value === null) return val.variant;
            // If value is object (fields), render fields
            if (val.value && typeof val.value === 'object' && !Array.isArray(val.value) && val.value._type) {
                return `${val.variant}(${renderValue(val.value)})`;
            }
            // Helper to detect User Enum Fields directly on 'val' if we changed interpreter?
            // Interpreter returns { enumType, variant, value } for Tuple-like.
            // But for struct-like `Error { code: 1 }`, the interpreter logic needs check.
            // Currently interpreter `visitEnumVariant` handles tuple-like `Some(val)`.
            // It doesn't fully support struct-like variants creation in `visitEnumVariant` explicitly yet (it returns value: null).
            // But assuming we have `val.value`, render it.
            return `${val.variant}(${renderValue(val.value)})`;
        }
        if (val._type) {
            return `${val._type} {...}`;
        }
        return '{...}';
    }
    return String(val);
}
