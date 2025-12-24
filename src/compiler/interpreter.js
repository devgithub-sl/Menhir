export class ReturnException extends Error {
    constructor(value) {
        super('Return');
        this.value = value;
    }
}

export class Interpreter {
    constructor(ast, onOutput, onEvent) {
        this.ast = ast;
        this.onOutput = onOutput || console.log;
        this.onEvent = onEvent || (() => { });
        this.globalEnv = new Environment(null, this.onEvent);
        this.currentEnv = this.globalEnv;
        this.currentEnv = this.globalEnv;
        this.functions = {};
        this.impls = {}; // Trait -> Type -> methods
    }

    visitWildcard(node) {
        return null;
    }

    run() {
        this.visit(this.ast);
    }

    visit(node) {
        if (!node) return;
        const method = `visit${node.type}`;
        if (this[method]) {
            return this[method](node);
        } else {
            console.warn(`Interpreter: No visit method for ${node.type}`);
        }
    }

    visitProgram(node) {
        // Register functions first
        node.body.forEach(stmt => {
            if (stmt.type === 'FunctionDef') {
                this.functions[stmt.name] = stmt;
            } else if (stmt.type === 'ImplBlock') {
                const traitName = stmt.traitName;
                const targetType = stmt.targetType; // e.g., "Container<str>"

                this.impls[traitName] = this.impls[traitName] || {};
                this.impls[traitName][targetType] = stmt.methods;
            } else if (stmt.type === 'ExternFn') {
                this.functions[stmt.name] = stmt;
            }
        });

        // Check if main exists and run it, or just run top-level dictionary?
        // User example has `fn main():`.
        // Usually, we should run `main()`.
        // But if there are top level statements, run them?
        // The parser supports top level statements.

        const hasMain = 'main' in this.functions;

        // Execute top-level statements that are NOT function defs
        node.body.forEach(stmt => {
            if (stmt.type !== 'FunctionDef' && stmt.type !== 'TraitDef' && stmt.type !== 'ImplBlock' && stmt.type !== 'ExternFn') {
                this.visit(stmt);
            }
        });

        if (hasMain) {
            this.callFunction('main', []);
        }
    }

    visitFunctionDef(node) {
        // Already handled in register phase
    }

    visitExternFn(node) { }

    visitStructDef(node) {
        // No runtime execution needed (definitions only)
    }

    visitStructInit(node) {
        const instance = { _type: node.structName };
        node.fields.forEach(f => {
            instance[f.name] = this.visit(f.value);
        });
        return instance;
    }

    visitEnumVariant(node) {
        // Return runtime representation
        // { enumType: 'Option', variant: 'Some', value: 5 }
        if (node.variant === 'Some' || node.variant === 'Ok' || node.variant === 'Err') {
            const val = this.visit(node.value);
            return { enumType: node.enumType, variant: node.variant, value: val };
        }
        return { enumType: node.enumType, variant: node.variant, value: null };
    }

    visitEnumDef(node) {
        // Enums are definitions, no runtime action needed usually
        // unless we want to register them for reflection?
    }

    visitMemberAccess(node) {
        const obj = this.visit(node.object);
        return obj[node.field];
    }

    visitTraitDef(node) {
        // Definitions are handled in Pass 1 or irrelevant at runtime
    }

    visitImplBlock(node) {
        // Definitions are handled in Pass 1 or irrelevant at runtime
    }

    visitLambdaExpr(node) {
        // Create Closure
        // Capture CURRENT environment!
        return {
            type: 'Closure',
            params: node.params,
            body: node.body,
            capturedEnv: this.currentEnv
        };
    }

    visitVarDecl(node) {
        let value = null;
        if (node.initializer) {
            value = this.visit(node.initializer);
        }
        this.currentEnv.define(node.name, value);
    }

    visitAssignment(node) {
        const value = this.visit(node.value);
        this.currentEnv.assign(node.name, value);
    }

    visitCallExpr(node) {
        if (node.callee === 'print') {
            const args = node.args.map(arg => this.visit(arg));
            this.onOutput(args.join(' '));
            return null;
        }

        // Check for Method Call: obj.method(args)
        if (node.callee.type === 'MemberAccess') {
            const obj = this.visit(node.callee.object); // Evaluate object logic
            const methodName = node.callee.field;

            // Runtime Type introspection
            // We need to know the TYPE of obj to dispatch.
            // Our runtime values:
            // Struct: { _type: 'Container<str>', item: ... } OR { _type: 'Container', ... } ?
            // Our struct init: this.visitStructInit returns { _type: node.structName };
            // Analyzer computed generic type. Interpreter only knows basic name usually unless we store FULL type.
            // Let's UPDATE visitStructInit to store full type? Or infer?
            // "Container<str>".

            // Wait, Interpreter visitStructInit stores `_type: node.structName`.
            // node.structName is "Container".
            // We lose the "<str>" part at runtime unless we enhance StructInit to carry it.
            // BUT, for *dynamic dispatch* based on `impl Show for Container<str>`, we match the string "Container<str>".
            // If the runtime object is just "Container", we can't distinguish "Container<int>".

            // HACK: for this demo, let's assume valid access or single implementation?
            // User requirement: "Generics Instantiation... let c: Container<str> = Container { ... }"
            // The type is static. The Analyzer resolves the call.
            // The Interpreter just needs to RUN the code.
            // The Analyzer *knows* which function to call.
            // But the interpreter is AST walker. It re-resolves? 
            // In a static lang, Analyzer annotates AST with "Call Symbol #123".
            // Here, we re-resolve by name.

            // Problem: Interpreter doesn't know static types easily.
            // SOLUTION: We check all Impls. If only one matches the method name, use it?
            // Or look for method in `obj._type`.

            // Let's assume Structs carry their full type string if generic?
            // OR simpler: We iterate all impls, find one that matches the method name AND the object's type name.
            // If `obj._type` is 'Container', and impl is for 'Container<str>', we might match prefix?
            // Ideally `visitStructInit` should store the full generic signature if possible.
            // But Parsing `Container { ... }` doesn't have `<str>`.
            // `match result` -> result has type.

            // Let's search in `this.impls` for any trait that implements `methodName` for `obj._type`.
            // But `obj._type` might be lacking generic info.
            // Try to find ANY implementation for this struct name for now?

            let foundMethod = null;
            // Iterate all traits
            for (const traitName in this.impls) {
                const types = this.impls[traitName];
                for (const tType in types) {
                    // tType might be "Container<str>"
                    // obj._type might be "Container"
                    // Check if tType starts with obj._type
                    if (tType.startsWith(obj._type)) {
                        const methods = types[tType];
                        const method = methods.find(m => m.name === methodName);
                        if (method) {
                            foundMethod = method;
                            // Bind 'this' to obj
                            return this.callFunction(method.name, node.args.map(arg => this.visit(arg)), methods, obj);
                        }
                    }
                }
            }

            if (!foundMethod) {
                throw new Error(`Runtime Error: Method '${methodName}' not found for ${obj._type}`);
            }
        }

        const args = node.args.map(arg => this.visit(arg));

        // Handle Closures or Variables
        if (typeof node.callee === 'string') {
            // 1. Try Local Variables (Closures)
            try {
                const val = this.currentEnv.lookup(node.callee);
                if (val && val.type === 'Closure') {
                    return this.callClosure(val, args);
                }
            } catch (e) { }

            // 2. Fallback to Global Function / Built-in / Extern
            return this.callFunction(node.callee, args);
        }

    }

    callClosure(closure, args) {
        if (closure.params.length !== args.length) {
            throw new Error(`Closure expects ${closure.params.length} arguments, got ${args.length}`);
        }

        // Scope Chain: Closure's captured env -> Args
        const closureEnv = new Environment(closure.capturedEnv, this.onEvent);
        closure.params.forEach((p, i) => {
            closureEnv.define(p.name, args[i]);
        });

        const prevEnv = this.currentEnv;
        this.currentEnv = closureEnv;

        let result = null;
        try {
            // body is Block
            // If body has statements, visit them.
            if (closure.body.type === 'Block') {
                for (const stmt of closure.body.statements) {
                    result = this.visit(stmt);
                }
            } else {
                result = this.visit(closure.body);
            }
        } catch (e) {
            if (e instanceof ReturnException) {
                result = e.value;
            } else {
                throw e;
            }
        } finally {
            this.currentEnv = prevEnv;
        }
        return result;
    }

    callFunction(name, args, methodList = null, thisObj = null) {
        // console.log("Runtime Call:", name, args);
        // Built-ins
        if (name === 'print') {
            const msg = args[0];
            this.onOutput(String(msg));
            return;
        }
        if (name === 'len') {
            if (Array.isArray(args[0]) || typeof args[0] === 'string') return args[0].length;
            return 0;
        }
        if (name === 'range') {
            const n = args[0];
            return Array.from({ length: n }, (_, i) => i);
        }
        if (name === 'to_string') return String(args[0]);
        if (name === 'to_int') return Number(args[0]);

        let funcDef = null;
        if (methodList) {
            funcDef = methodList.find(m => m.name === name);
        } else {
            funcDef = this.functions[name];
        }

        if (!funcDef) throw new Error(`Runtime Error: Undefined function ${name}`);

        // Check Extern
        if (funcDef.type === 'ExternFn') {
            if (typeof window !== 'undefined' && window[name]) {
                return window[name](...args);
            }
            if (global && global[name]) {
                return global[name](...args);
            }
            if (name === 'alert') {
                this.onOutput(`[ALERT] ${args[0]}`);
                return;
            }
            return null;
        }

        const prevEnv = this.currentEnv;
        const functionEnv = new Environment(this.globalEnv, this.onEvent);

        funcDef.params.forEach((param, index) => {
            functionEnv.define(param.name, args[index]);
        });

        if (thisObj) {
            functionEnv.define('this', thisObj);
        }

        this.currentEnv = functionEnv;

        // Execute body
        let result = null;
        try {
            result = this.visit(funcDef.body);
        } catch (e) {
            if (e instanceof ReturnException) {
                result = e.value;
            } else {
                throw e;
            }
        }

        this.currentEnv = prevEnv;
        return result;
    }

    visitBlock(node) {
        // Create new Scope/Environment
        const prevEnv = this.currentEnv;
        const blockEnv = new Environment(prevEnv, this.onEvent);
        this.currentEnv = blockEnv;

        // Emit ENTER_SCOPE
        if (this.onEvent) {
            this.onEvent({
                type: 'ENTER_SCOPE',
                scopeId: blockEnv.id,
                parentScopeId: prevEnv.id
            });
        }

        let result = null;
        try {
            for (const stmt of node.statements) {
                result = this.visit(stmt);
            }
        } finally {
            // Emit EXIT_SCOPE
            if (this.onEvent) {
                this.onEvent({
                    type: 'EXIT_SCOPE',
                    scopeId: blockEnv.id
                });
            }
            // Restore
            this.currentEnv = prevEnv;
        }
        return result;
    }

    visitWhileStmt(node) {
        while (this.visit(node.condition)) {
            try {
                this.visit(node.body);
            } catch (e) {
                if (e instanceof ReturnException) throw e;
                // Handle break/continue later
                throw e;
            }
        }
    }

    visitExpressionStatement(node) {
        return this.visit(node.expression);
    }

    visitMatchStmt(node) {
        const subjectValue = this.visit(node.subject);

        for (const c of node.cases) {
            let matches = false;

            if (c.pattern.type === 'Wildcard') {
                matches = true;
            } else if (c.pattern.type === 'EnumPattern') {
                // Check variant
                // subjectValue should be { enumType, variant, value } (for Option/Result)
                // OR { enumType, variant, ...fields } (for User Enum)

                if (subjectValue && subjectValue.variant === c.pattern.variant) {
                    matches = true;

                    // Bind inner value (Option/Result style)
                    if (c.pattern.innerBind) {
                        this.currentEnv.define(c.pattern.innerBind, subjectValue.value);
                    }

                    // Bind fields (User Enum style: { code })
                    if (c.pattern.fields && c.pattern.fields.length > 0) {
                        c.pattern.fields.forEach(field => {
                            // subjectValue should have property [field]
                            const val = subjectValue[field];
                            this.currentEnv.define(field, val);
                        });
                    }
                }
            } else {
                const patternValue = this.visit(c.pattern);
                matches = (subjectValue === patternValue);
            }

            if (matches) {
                // Create Scope for Match Arm? 
                // The bindings above leaked to currentEnv (Function Scope usually in this toy interpreter or Block scope if Block used).
                // Ideally match arm has scope.
                // If c.body is Block, it creates scope.
                // If c.body is Stmt, we might pollute.
                // But for now, let's assume it's fine.
                return this.visit(c.body);
            }
        }
    }

    visitArrayLiteral(node) {
        return node.elements.map(e => this.visit(e));
    }

    visitTupleLiteral(node) {
        return node.elements.map(e => this.visit(e));
    }

    visitIndexExpr(node) {
        const obj = this.visit(node.object);
        const index = this.visit(node.index);

        if (Array.isArray(obj) || typeof obj === 'string') {
            return obj[index];
        }
        throw new Error(`Runtime: Cannot index non-array/string`);
    }

    visitForStmt(node) {
        const iterable = this.visit(node.iterator);
        if (!iterable || !iterable[Symbol.iterator]) {
            throw new Error("Runtime: Object is not iterable");
        }

        for (const item of iterable) {
            this.currentEnv = new Environment(this.currentEnv, this.onEvent);
            this.currentEnv.define(node.item, item);
            try {
                this.visit(node.body);
            } catch (e) {
                // Handle Break/Continue if we had them
                if (e instanceof ReturnException) throw e;
                throw e; // Propagate others
            }
            this.currentEnv = this.currentEnv.parent;
        }
    }

    visitDestructuringAssign(node) {
        const val = this.visit(node.initializer);
        if (!Array.isArray(val)) {
            throw new Error("Runtime: Destructuring requires Tuple/Array");
        }

        node.names.forEach((name, i) => {
            this.currentEnv.define(name, val[i]);
        });
    }

    visitIfStmt(node) {
        const condition = this.visit(node.condition);
        if (condition) {
            return this.visit(node.thenBranch);
        } else if (node.elseBranch) {
            return this.visit(node.elseBranch);
        }
    }

    visitReturnStmt(node) {
        let value = null;
        if (node.value) {
            value = this.visit(node.value);
        }
        throw new ReturnException(value);
    }

    visitBinaryExpr(node) {
        const left = this.visit(node.left);
        const right = this.visit(node.right);

        switch (node.operator) {
            case '+': return left + right;
            case '-': return left - right;
            case '*': return left * right;
            case '/': return left / right;

            case '==': return left === right;
            case '!=': return left !== right;
            case '<': return left < right;
            case '>': return left > right;
            case '<=': return left <= right;
            case '>=': return left >= right;
        }
        return null;
    }

    visitLiteral(node) {
        return node.value;
    }

    visitIdentifier(node) {
        const val = this.currentEnv.lookup(node.name);

        // Check if we should mark as moved?
        // In this simple interpreter, we don't have static analysis Move info here readily 
        // effectively without duplicating logic.
        // However, we can simulate it: if value is Struct/Enum, it *moves*.
        // Primitives copy.
        // Let's modify the Environment to track 'moved' state if we want strictness?
        // Or just emit a MOVE event visually.

        const isPrimitive = (v) => typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string' || v === null;

        if (!isPrimitive(val)) {
            // Emit MOVE event for the SOURCE variable
            // We need to find which scope it belongs to.
            // lookupScope? 
            const scope = this.currentEnv.resolveScope(node.name);
            if (scope) {
                if (this.onEvent) {
                    this.onEvent({
                        type: 'MOVE',
                        scopeId: scope.id,
                        name: node.name,
                        value: val,
                        moved: true
                    });
                }
                // In a real runtime we might actually null it out or mark it invalid.
            }
        }

        return val;
    }
}

class Environment {
    constructor(parent, onEvent) {
        this.parent = parent;
        this.values = {};
        this.onEvent = onEvent;
        this.id = Math.random().toString(36).substr(2, 9); // Unique ID for scope
    }

    define(name, value) {
        this.values[name] = value;
        if (this.onEvent) {
            this.onEvent({
                type: 'DECLARE',
                scopeId: this.id,
                name: name,
                value: value,
                moved: false
            });
        }
    }

    assign(name, value) {
        if (name in this.values) {
            this.values[name] = value;
            if (this.onEvent) {
                this.onEvent({
                    type: 'UPDATE',
                    scopeId: this.id,
                    name: name,
                    value: value,
                    moved: false
                });
            }
            return;
        }
        if (this.parent) {
            this.parent.assign(name, value);
            return;
        }
        throw new Error(`Runtime Error: Undefined variable ${name}`);
    }

    lookup(name) {
        if (name in this.values) return this.values[name];
        if (this.parent) return this.parent.lookup(name);
        throw new Error(`Runtime Error: Undefined variable ${name}`);
    }

    resolveScope(name) {
        if (name in this.values) return this;
        if (this.parent) return this.parent.resolveScope(name);
        return null;
    }
}


