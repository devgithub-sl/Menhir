export class SemanticAnalyzer {
    constructor(ast) {
        this.ast = ast;
        this.globalScope = new Scope(null);
        this.currentScope = this.globalScope;
        this.currentScope = this.globalScope;
        this.functions = {}; // Name -> { params, returnType }
        this.structs = {}; // Name -> { fields: { name, type }[], genericParam: string }
        this.traits = {}; // Name -> { methods: { name, returnType }[] }
        this.impls = {}; // TraitName -> { TargetType (string) -> methods[] }
        this.errors = [];
    }

    visitWildcard(node) {
        return 'any';
    }

    analyze() {
        this.visit(this.ast);
        return this.errors;
    }

    error(msg) {
        this.errors.push(msg);
    }

    visit(node) {
        if (!node) return;
        const method = `visit${node.type}`;
        if (this[method]) {
            return this[method](node);
        } else {
            console.warn(`No visit method for ${node.type}`);
        }
    }

    visitProgram(node) {
        // Pass 1: Register functions
        node.body.forEach(stmt => {
            if (stmt.type === 'FunctionDef') {
                this.functions[stmt.name] = {
                    params: stmt.params,
                    returnType: stmt.returnType
                };
            } else if (stmt.type === 'StructDef') {
                if (this.structs[stmt.name]) {
                    this.error(`Struct '${stmt.name}' is already defined`);
                }
                this.structs[stmt.name] = {
                    fields: stmt.fields,
                    genericParam: stmt.genericParam
                };
            } else if (stmt.type === 'TraitDef') {
                this.traits[stmt.name] = { methods: stmt.methods };
                // Init impls map for this trait
                this.impls[stmt.name] = {};
            } else if (stmt.type === 'ImplBlock') {
                // We'll analyze Impl body in Pass 2, but register existence now?
                // Actually, Pass 1 should register structure.
                // Pass 2 analyzes bodies.
                const traitName = stmt.traitName;
                const targetType = stmt.targetType; // e.g., "Container<str>"

                if (!this.impls[traitName]) {
                    // Possible if trait defined later? Analyzer usually assumes definition before use or 2-pass handles it.
                    // We are in Pass 1. If TraitDef is after ImplBlock, this fails.
                    // Let's assume order doesn't matter or user defines Trait first.
                    // For safety, just init.
                    this.impls[traitName] = this.impls[traitName] || {};
                }

                this.impls[traitName][targetType] = stmt.methods;
            }
        });

        // Inject Standard Library
        this.functions['print'] = { params: [{ name: 'msg', type: 'any' }], returnType: 'void' };
        this.functions['len'] = { params: [{ name: 'arr', type: '[any]' }], returnType: 'int' };
        this.functions['range'] = { params: [{ name: 'n', type: 'int' }], returnType: '[int]' };
        this.functions['to_string'] = { params: [{ name: 'x', type: 'any' }], returnType: 'str' };
        this.functions['to_int'] = { params: [{ name: 'x', type: 'any' }], returnType: 'int' };
        this.functions['alert'] = { params: [{ name: 'msg', type: 'str' }], returnType: 'void' };

        // Pass 2: Analyze body
        node.body.forEach(stmt => this.visit(stmt));
    }

    visitExpressionStatement(node) {
        this.visit(node.expression);
    }

    visitFunctionDef(node) {
        this.currentScope = new Scope(this.currentScope);

        node.params.forEach(p => {
            this.currentScope.define(p.name, p.type, false); // Params are immutable by default unless specified? Assuming immutable for now.
        });

        this.visit(node.body);

        this.currentScope = this.currentScope.parent;
    }

    visitBlock(node) {
        // Push Scope
        this.currentScope = new Scope(this.currentScope);

        node.statements.forEach(stmt => this.visit(stmt));

        // Pop Scope
        this.currentScope = this.currentScope.parent;
    }

    visitLambdaExpr(node) {
        // Lambda Scope (captures current scope as parent)
        this.currentScope = new Scope(this.currentScope);

        // Define params
        node.params.forEach(p => {
            // Type inference for params?
            // User provided 'any' or explicit type.
            this.currentScope.define(p.name, p.type || 'any', false);
        });

        this.visit(node.body);

        this.currentScope = this.currentScope.parent;

        // Return type? 'function' or specific signature?
        return 'function';
    }

    visitWhileStmt(node) {
        const conditionType = this.visit(node.condition);
        if (conditionType !== 'bool') {
            this.error(`While condition must be a boolean, got ${conditionType}`);
        }
        this.visit(node.body);
    }

    visitStructDef(node) {
        // Already registered
    }

    visitStructInit(node) {
        const structDef = this.structs[node.structName];
        if (!structDef) {
            this.error(`Undefined struct '${node.structName}'`);
            return 'unknown';
        }

        // Check fields
        const processedFields = new Set();
        node.fields.forEach(f => {
            const fieldDef = structDef.fields.find(fd => fd.name === f.name);
            if (!fieldDef) {
                this.error(`Struct '${node.structName}' has no field '${f.name}'`);
                return; // continue
            }

            const valueType = this.visit(f.value);

            // Generic Type Check
            // If field expects T, we accept any type provided valid inference matches later?
            // Actually, we should check against "expectedType" if we know T.
            // But here we are visiting Init. We don't 'know' T from outside context easily yet 
            // without passing recursive expected types.
            // For now, if field assumes T, we accept valueType.
            if (structDef.genericParam && fieldDef.type === structDef.genericParam) {
                // Allow
            } else {
                if (valueType !== fieldDef.type) {
                    this.error(`Type mismatch in '${node.structName}.${f.name}': expected ${fieldDef.type}, got ${valueType}`);
                }
            }

            // Check Move in Initializer
            if (f.value.type === 'Identifier') {
                this.handleMove(f.value.name);
            }

            processedFields.add(f.name);
        });

        // Check missing fields
        structDef.fields.forEach(fd => {
            if (!processedFields.has(fd.name)) {
                this.error(`Missing field '${fd.name}' in struct '${node.structName}' instantiation`);
            }
        });

        // Return valid type
        if (structDef.genericParam) {
            // Re-infer T from fields? or use explicit?
            // User example: `let c: Container<str> = Container { ... }`
            // The declared type is `Container<str>`.
            // The init expression `Container { ... }` type should be compatible.
            // Inference: Find a field that uses T.
            const fieldWithT = structDef.fields.find(f => f.type === structDef.genericParam);
            if (fieldWithT) {
                // Find corresponding value provided
                const valNode = node.fields.find(f => f.name === fieldWithT.name);
                if (valNode) {
                    const inferredT = this.visit(valNode.value);
                    return `${node.structName}<${inferredT}>`;
                }
            }
            return `${node.structName}<unknown>`;
        }

        // Return valid type
        if (structDef.genericParam) {
            // Re-infer T from fields? or use explicit?
            // User example: `let c: Container<str> = Container { ... }`
            // The declared type is `Container<str>`.
            // The init expression `Container { ... }` type should be compatible.
            // Inference: Find a field that uses T.
            const fieldWithT = structDef.fields.find(f => f.type === structDef.genericParam);
            if (fieldWithT) {
                // Find corresponding value provided
                const valNode = node.fields.find(f => f.name === fieldWithT.name);
                if (valNode) {
                    const inferredT = this.visit(valNode.value);
                    return `${node.structName}<${inferredT}>`;
                }
            }
            return `${node.structName}<unknown>`;
        }

        return node.structName;
    }

    visitMemberAccess(node) {
        const objectType = this.visit(node.object);
        if (this.isPrimitive(objectType)) {
            this.error(`Cannot access member '${node.field}' on primitive type ${objectType}`);
            return 'unknown';
        }

        const baseType = objectType.split('<')[0];
        const structDef = this.structs[baseType];

        // Debugging
        // console.log(`Accessing ${node.field} on ${objectType} (Base: ${baseType})`);

        if (!structDef) {
            return 'unknown';
        }

        const fieldDef = structDef.fields.find(f => f.name === node.field);
        if (!fieldDef) {
            this.error(`Struct '${objectType}' has no field '${node.field}'`);
            return 'unknown';
        }

        // Handle Generic Field Access
        // If fieldDef.type is 'T' (genericParam), resolve it from objectType
        if (structDef.genericParam && fieldDef.type === structDef.genericParam) {
            // objectType: "Container<str>"
            // Extract "str"
            const match = objectType.match(/<(.+)>/);
            if (match) {
                // console.log(`Resolved Generic Field ${node.field}: T -> ${match[1]}`);
                return match[1]; // "str"
            }
        }

        return fieldDef.type;
    }

    visitMatchStmt(node) {
        const subjectType = this.visit(node.subject);

        if (node.subject.type === 'Identifier') {
            this.handleMove(node.subject.name);
        }

        node.cases.forEach(c => {
            if (c.pattern.type === 'Wildcard') {
                // Compatible
            } else if (c.pattern.type === 'EnumPattern') {
                const validVariants = {
                    'Some': 'Option', 'None': 'Option',
                    'Ok': 'Result', 'Err': 'Result'
                };

                if (validVariants.hasOwnProperty(c.pattern.variant)) {
                    const variantFamily = validVariants[c.pattern.variant];
                    if (!subjectType.startsWith(variantFamily)) {
                        this.error(`Pattern ${c.pattern.variant} expects ${variantFamily} type, got ${subjectType}`);
                    }

                    if (c.pattern.innerBind) {
                        const match = subjectType.match(/<(.+)>/);
                        let innerType = 'any';
                        if (match) {
                            const inners = match[1].split(',').map(s => s.trim());
                            if (variantFamily === 'Option') innerType = inners[0];
                            if (variantFamily === 'Result') {
                                if (c.pattern.variant === 'Ok') innerType = inners[0];
                                if (c.pattern.variant === 'Err') innerType = inners[1] || 'any';
                            }
                        }
                        this.currentScope.define(c.pattern.innerBind, innerType);
                    }
                }
                else {
                    const enumName = c.pattern.enumName;

                    if (enumName && subjectType !== enumName) {
                        this.error(`Pattern expects ${enumName}, got ${subjectType}`);
                    }

                    if (c.pattern.fields && c.pattern.fields.length > 0) {
                        c.pattern.fields.forEach(f => {
                            this.currentScope.define(f, 'any');
                        });
                    }
                }

            } else {
                const patternType = this.visit(c.pattern);
                if (patternType !== subjectType) {
                    this.error(`Match pattern type mismatch: Expected ${subjectType}, got ${patternType}`);
                }
            }

            this.visit(c.body);
        });
    }

    visitArrayLiteral(node) {
        if (node.elements.length === 0) return '[any]';

        const firstType = this.visit(node.elements[0]);
        for (let i = 1; i < node.elements.length; i++) {
            const t = this.visit(node.elements[i]);
            if (t !== firstType && t !== 'any' && firstType !== 'any') {
                this.error(`Array elements must be of same type. Expected ${firstType}, found ${t}`);
            }
        }
        return `[${firstType}]`;
    }

    visitTupleLiteral(node) {
        const types = node.elements.map(e => this.visit(e));
        return `(${types.join(', ')})`;
    }

    visitIndexExpr(node) {
        const objType = this.visit(node.object);
        const indexType = this.visit(node.index);

        if (indexType !== 'int') {
            this.error(`Array index must be integer, found ${indexType}`);
        }

        if (objType.startsWith('[')) {
            return objType.substring(1, objType.length - 1);
        } else if (objType === 'str') {
            return 'str';
        }

        this.error(`Cannot index type ${objType}`);
        return 'any';
    }

    visitExternFn(node) {
        this.functions[node.name] = {
            params: node.params,
            returnType: node.returnType
        };
    }

    visitEnumDef(node) {
        if (!this.enums) this.enums = {};
        this.enums[node.name] = {
            variants: node.variants
        };
    }

    visitForStmt(node) {
        const iterType = this.visit(node.iterator);
        let itemType = 'any';

        if (iterType.startsWith('[')) {
            itemType = iterType.substring(1, iterType.length - 1);
        } else if (iterType === 'str') {
            itemType = 'str';
        } else {
            this.error(`Type ${iterType} is not iterable`);
        }

        this.currentScope = new Scope(this.currentScope);
        this.currentScope.define(node.item, itemType, false);

        this.visit(node.body);

        this.currentScope = this.currentScope.parent;
    }

    visitDestructuringAssign(node) {
        const valType = this.visit(node.initializer);

        if (!valType.startsWith('(')) {
            this.error(`Destructuring requires tuple type, found ${valType}`);
            return;
        }

        const typesStr = valType.substring(1, valType.length - 1);
        const types = typesStr.split(',').map(s => s.trim());

        if (node.names.length !== types.length) {
            this.error(`Destructuring mismatch variables`);
        }

        node.names.forEach((name, i) => {
            this.currentScope.define(name, types[i] || 'any', node.mutable);
        });
    }

    visitIfStmt(node) {
        const conditionType = this.visit(node.condition);
        if (conditionType !== 'bool') {
            this.error(`If condition must be a boolean, got ${conditionType}`);
        }

        this.visit(node.thenBranch);
        if (node.elseBranch) {
            this.visit(node.elseBranch);
        }
    }

    visitReturnStmt(node) {
        if (node.value) {
            this.visit(node.value);
            // In a real compiler, we would check against the current function signature.
            // For now, we trust the expression type matches (or just analyze it to catch inner errors).
        }
    }

    visitVarDecl(node) {
        // 1. Evaluate initializer
        let initType = null;
        if (node.initializer) {
            initType = this.visit(node.initializer);

            // Check Move Semantics on initializer
            if (node.initializer.type === 'Identifier') {
                this.handleMove(node.initializer.name);
            }
        }

        // 2. Type Check & Inference
        let varType = node.varType;

        if (!varType) {
            if (initType) {
                varType = initType;
            } else {
                this.error(`Variable '${node.name}' must have a type annotation or initializer`);
                varType = 'unknown';
            }
        } else {
            if (initType && initType !== varType && initType !== 'any') {
                this.error(`Type mismatch: Variable '${node.name}' expects ${varType}, got ${initType}`);
            }
        }

        // 3. Define in scope
        this.currentScope.define(node.name, varType, node.mutable);
    }

    visitAssignment(node) {
        const varInfo = this.currentScope.resolve(node.name);
        if (!varInfo) {
            this.error(`Undefined variable '${node.name}'`);
            return;
        }

        // Check Mutability
        if (!varInfo.mutable) {
            this.error(`Cannot assign to immutable variable '${node.name}'`);
        }

        // Check Moved
        if (varInfo.moved) {
            this.error(`Cannot assign to moved variable '${node.name}'`);
        }

        // Check value type
        const valueType = this.visit(node.value);
        if (valueType !== varInfo.type) {
            this.error(`Type mismatch: Cannot assign ${valueType} to ${varInfo.type} '${node.name}'`);
        }

        // Check Move on right hand side
        if (node.value.type === 'Identifier') {
            this.handleMove(node.value.name);
        } else if (node.value.type === 'MemberAccess') {
            // Handle move from member access?
            // "If accessing a field of a MOVED variable, error." - handled in visitMemberAccess/visitIdentifier

            // If we are moving a field OUT, we should check semantics.
            // e.g. let x = u.st (if u.st is struct, it moves).
            // For now, let's assume we don't track partial moves on the parent 'u'.
            // But we should check if the FIELD ITSELF is movable.

            // For this toy implementation, simple variable move is enough per requirement.
        }
    }

    visitEnumVariant(node) {
        // Some(val) -> Option<Type>
        if (node.variant === 'Some') {
            const valType = this.visit(node.value);
            return `Option<${valType}>`;
        }
        if (node.variant === 'None') {
            return 'Option<any>'; // Should infer from context ideally, but <any> is safe for now
        }
        if (node.variant === 'Ok') {
            const valType = this.visit(node.value);
            return `Result<${valType}, any>`;
        }
        if (node.variant === 'Err') {
            const valType = this.visit(node.value);
            return `Result<any, ${valType}>`;
        }
    }

    visitCallExpr(node) {
        // Check for Method Call: obj.method(args)
        if (node.callee.type === 'MemberAccess') {
            // This is a method call? Or field that is function pointer?
            // "PyRust" spec implies methods via Traits.
            const obj = node.callee.object; // e.g. 'c'
            const methodName = node.callee.field; // 'display'

            const objType = this.visit(obj); // e.g. 'Container<str>'

            // Lookup Impls for this Type
            // this.impls[Trait][Type] -> methods
            // We need to find WHICH trait implements this method for this type.
            let foundMethod = null;

            for (const traitName in this.impls) {
                const typeMap = this.impls[traitName];
                // Check exact match
                if (typeMap[objType]) {
                    const methods = typeMap[objType];
                    const method = methods.find(m => m.name === methodName);
                    if (method) {
                        foundMethod = method;
                        break;
                    }
                }
            }

            if (!foundMethod) {
                this.error(`Method '${methodName}' not found for type '${objType}'`);
                return 'void';
            }

            // Check args
            // Method params include 'this' usually?
            // Our parserImplBlock parses them as FunctionDef.
            // FunctionDef params usually don't list 'this' explicitly in signature in many langs,
            // OR checks syntax `self`.
            // User example: `fn display() -> str`. No `self` in args list?
            // `impl Show ... fn display() ... return this.name`
            // So `display` has 0 params in signature.
            // node.args has 0 args.
            if (node.args.length !== foundMethod.params.length) {
                this.error(`Method '${methodName}' expects ${foundMethod.params.length} arguments, got ${node.args.length}`);
            }

            return foundMethod.returnType;
        }

        if (node.callee === 'print') {
            node.args.forEach(arg => {
                const type = this.visit(arg);
                if (arg.type === 'Identifier') {
                    // Print usually borrows? Or takes ownership?
                    // Let's assume `print` borrows (doesn't move).
                    this.checkValidAccess(arg.name);
                }
            });
            return 'void';
        }

        const func = this.functions[node.callee];
        if (!func) {
            // Check if it's a Closure Variable
            const varInfo = this.currentScope.resolve(node.callee);
            if (varInfo && (varInfo.type === 'function' || varInfo.type === 'any')) {
                // It's a closure call.
                // We should check args if we knew the signature.
                // For now, allow it.
                return 'any'; // Return any as we don't track closure return types yet
            }

            this.error(`Undefined function '${node.callee}'`);
            return 'void';
        }

        // Check args
        if (node.args.length !== func.params.length) {
            this.error(`Function '${node.callee}' expects ${func.params.length} arguments, got ${node.args.length}`);
        }

        node.args.forEach((arg, idx) => {
            const argType = this.visit(arg);
            const paramType = func.params[idx].type;
            if (argType !== paramType) {
                // Allow [T] to match [any]
                if (paramType === '[any]' && argType.startsWith('[')) {
                    // Allowed
                } else if (paramType === 'any') {
                    // Allowed
                } else {
                    this.error(`Argument mismatch for '${node.callee}': expected ${paramType}, got ${argType}`);
                }
            }

            // Move semantics on Function Call
            if (arg.type === 'Identifier') {
                this.handleMove(arg.name);
            }
        });

        return func.returnType || 'void';
    }

    visitTraitDef(node) { }
    visitImplBlock(node) {
        // Pass 2: Analyze method bodies
        // We need to setup scope with 'this'
        const targetType = node.targetType;

        node.methods.forEach(method => {
            this.currentScope = new Scope(this.currentScope);
            // Define 'this'
            // 'this' is a reference or value?
            // Usually reference &self. But implementation is `this.name`.
            // Let's define 'this' as targetType.
            this.currentScope.define('this', targetType, false);

            // Define params
            method.params.forEach(p => {
                this.currentScope.define(p.name, p.type, false);
            });

            this.visit(method.body);

            this.currentScope = this.currentScope.parent;
        });
    }

    visitIdentifier(node) {
        const varInfo = this.currentScope.resolve(node.name);
        if (!varInfo) {
            this.error(`Undefined variable '${node.name}'`);
            return 'unknown';
        }

        if (varInfo.moved) {
            this.error(`Use of moved value '${node.name}'`);
        }

        return varInfo.type;
    }

    visitLiteral(node) {
        return node.valueType;
    }

    visitBinaryExpr(node) {
        const leftType = this.visit(node.left);
        const rightType = this.visit(node.right);

        // String Concatenation: Allow str + anything or anything + str
        if (node.operator === '+' && (leftType === 'str' || rightType === 'str')) {
            return 'str';
        }

        if (leftType !== rightType && leftType !== 'any' && rightType !== 'any') {
            this.error(`Binary operator '${node.operator}' cannot be applied to types ${leftType} and ${rightType}`);
        }

        // Comparison operators return bool
        if (['==', '!=', '<', '>', '<=', '>='].includes(node.operator)) {
            return 'bool';
        }

        return (leftType === 'any' || rightType === 'any') ? 'any' : leftType; // Assume result is same type (int+int=int)
    }

    // Helpers

    handleMove(varName) {
        const varInfo = this.currentScope.resolve(varName);
        if (!varInfo) return;

        // Primitives implement Copy trait
        if (this.isPrimitive(varInfo.type)) return;

        // Otherwise, it moves
        if (varInfo.moved) {
            this.error(`Value '${varName}' already moved`);
        }
        varInfo.moved = true;
    }

    checkValidAccess(varName) {
        const varInfo = this.currentScope.resolve(varName);
        if (varInfo && varInfo.moved) {
            this.error(`Use of moved value '${varName}'`);
        }
    }

    isPrimitive(type) {
        return type === 'int' || type === 'bool' || type === 'str';
    }
}

class Scope {
    constructor(parent) {
        this.parent = parent;
        this.symbols = {};
    }

    define(name, type, mutable) {
        this.symbols[name] = {
            type,
            mutable,
            moved: false,
            borrows: []
        };
    }

    resolve(name) {
        if (this.symbols[name]) return this.symbols[name];
        if (this.parent) return this.parent.resolve(name);
        return null;
    }
}
