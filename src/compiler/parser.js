import { TokenType, Token } from './types.js';
import { Lexer } from './lexer.js';

export class Parser {
    constructor(input) {
        this.lexer = new Lexer(input);
        this.tokens = this.lexer.tokenize();
        this.pos = 0;
    }

    error(msg) {
        const token = this.peek();
        throw new Error(`Parser Error at ${token.line}:${token.column}: ${msg}`);
    }

    peek() {
        if (this.pos >= this.tokens.length) {
            return this.tokens[this.tokens.length - 1]; // Return EOF if exists, or last token
        }
        return this.tokens[this.pos];
    }

    match(type) {
        if (this.peek().type === type) {
            return this.tokens[this.pos++];
        }
        return null;
    }

    check(type) {
        return this.peek().type === type;
    }

    isAtEnd() {
        return this.peek().type === TokenType.EOF;
    }

    consume(type, errorMsg) {
        const token = this.match(type);
        if (!token) {
            this.error(errorMsg || `Expected ${type}, found ${this.peek().type}`);
        }
        return token;
    }

    parse() {
        const body = [];
        while (this.peek().type !== TokenType.EOF) {
            // Skip top-level newlines
            if (this.peek().type === TokenType.NEWLINE) {
                this.consume(TokenType.NEWLINE);
                continue;
            }
            body.push(this.parseStatement());
        }
        return { type: 'Program', body };
    }

    parseStatement() {
        const token = this.peek();

        switch (token.type) {
            case TokenType.FN:
                return this.parseFunctionDef();
            case TokenType.STRUCT:
                return this.parseStructDef();
            case TokenType.TRAIT:
                return this.parseTraitDef();
            case TokenType.IMPL:
                return this.parseImplBlock();
            case TokenType.IF:
                return this.parseIfStmt();
            case TokenType.WHILE:
                return this.parseWhileStmt();
            case TokenType.RETURN:
                return this.parseReturnStmt();
            case TokenType.LET:
                return this.parseVarDecl();
            case TokenType.LET:
                return this.parseVarDecl();
            case TokenType.MATCH:
                return this.parseMatchStmt();
            case TokenType.ENUM:
                return this.parseEnumDef();
            case TokenType.EXTERN:
                return this.parseExtern();
            case TokenType.FOR:
                return this.parseForStmt();
            case TokenType.IDENTIFIER:
                // Could be assignment or function call (expression statement)
                // Check next token
                if (this.lookahead(1).type === TokenType.ASSIGN) {
                    return this.parseAssignment();
                }
                return this.parseExpressionStatement();
            default:
                // Try parsing as expression (like print(x))
                return this.parseExpressionStatement();
        }
    }

    lookahead(distance) {
        if (this.pos + distance >= this.tokens.length) return { type: TokenType.EOF };
        return this.tokens[this.pos + distance];
    }

    parseFunctionDef() {
        this.consume(TokenType.FN);
        const name = this.consume(TokenType.IDENTIFIER, "Expected function name").value;
        this.consume(TokenType.LPAREN);
        const params = [];
        if (this.peek().type !== TokenType.RPAREN) {
            do {
                const paramName = this.consume(TokenType.IDENTIFIER, "Expected parameter name").value;
                this.consume(TokenType.COLON);
                const paramType = this.parseType();
                params.push({ name: paramName, type: paramType });
            } while (this.match(TokenType.COMMA));
        }
        this.consume(TokenType.RPAREN);

        // Optional return type with ->
        let returnType = 'void';
        if (this.match(TokenType.THIN_ARROW)) {
            returnType = this.parseType();
        }

        this.consume(TokenType.COLON);

        const body = this.parseBlock();
        return { type: 'FunctionDef', name, params, returnType, body };
    }

    parseStructDef() {
        this.consume(TokenType.STRUCT);
        const name = this.consume(TokenType.IDENTIFIER, "Expected struct name").value;

        let genericParam = null;
        if (this.match(TokenType.LT)) {
            // Support single generic param for now: Struct<T>
            genericParam = this.consume(TokenType.IDENTIFIER, "Expected generic parameter name").value;
            this.consume(TokenType.GT);
        }

        this.consume(TokenType.COLON);
        this.consume(TokenType.NEWLINE, "Expected newline after struct name");
        this.consume(TokenType.INDENT, "Expected indent for struct body");

        const fields = [];
        while (this.peek().type !== TokenType.DEDENT && this.peek().type !== TokenType.EOF) {
            if (this.peek().type === TokenType.NEWLINE) {
                this.consume(TokenType.NEWLINE);
                continue;
            }

            const fieldName = this.consume(TokenType.IDENTIFIER, "Expected field name").value;
            this.consume(TokenType.COLON);
            const fieldType = this.parseType();
            fields.push({ name: fieldName, type: fieldType });

            if (this.peek().type === TokenType.NEWLINE) this.consume(TokenType.NEWLINE);
        }
        this.consume(TokenType.DEDENT);
        return { type: 'StructDef', name, genericParam, fields };
    }

    parseTraitDef() {
        this.consume(TokenType.TRAIT);
        const name = this.consume(TokenType.IDENTIFIER, "Expected trait name").value;
        this.consume(TokenType.COLON);
        this.consume(TokenType.NEWLINE);
        this.consume(TokenType.INDENT);

        const methods = [];
        while (!this.check(TokenType.DEDENT) && !this.isAtEnd()) {
            if (this.peek().type === TokenType.NEWLINE) {
                this.consume(TokenType.NEWLINE);
                continue;
            }
            this.consume(TokenType.FN);
            const methodName = this.consume(TokenType.IDENTIFIER).value;
            this.consume(TokenType.LPAREN);
            this.consume(TokenType.RPAREN);

            let returnType = 'void';
            if (this.match(TokenType.THIN_ARROW)) {
                returnType = this.parseType();
            }

            methods.push({ name: methodName, returnType });

            if (this.peek().type === TokenType.NEWLINE) this.consume(TokenType.NEWLINE);
        }
        this.consume(TokenType.DEDENT);
        return { type: 'TraitDef', name, methods };
    }

    parseImplBlock() {
        this.consume(TokenType.IMPL);
        const traitName = this.consume(TokenType.IDENTIFIER, "Expected trait name").value;
        this.consume(TokenType.FOR);

        const targetType = this.parseType();

        this.consume(TokenType.COLON);
        this.consume(TokenType.NEWLINE);
        this.consume(TokenType.INDENT);

        const methods = [];
        while (!this.check(TokenType.DEDENT) && !this.isAtEnd()) {
            if (this.peek().type === TokenType.NEWLINE) {
                this.consume(TokenType.NEWLINE);
                continue;
            }
            // Parse full function definition (with body)
            methods.push(this.parseFunctionDef());
        }
        this.consume(TokenType.DEDENT);

        return { type: 'ImplBlock', traitName, targetType, methods };
    }

    parseMatchStmt() {
        this.consume(TokenType.MATCH);
        const subject = this.parseExpression();
        this.consume(TokenType.COLON, "Expected ':' after match expression");

        this.consume(TokenType.NEWLINE, "Expected newline after match header");
        this.consume(TokenType.INDENT, "Expected indent for match arms");

        const cases = [];
        while (this.peek().type !== TokenType.DEDENT && this.peek().type !== TokenType.EOF) {
            if (this.peek().type === TokenType.NEWLINE) {
                this.consume(TokenType.NEWLINE);
                continue;
            }

            // Pattern
            let pattern;
            if (this.match(TokenType.UNDERSCORE)) {
                pattern = { type: 'Wildcard' };
            } else if (this.match(TokenType.SOME)) {
                // Some(x) pattern
                this.consume(TokenType.LPAREN);
                const bindName = this.consume(TokenType.IDENTIFIER, "Expected variable to bind in Some pattern").value;
                this.consume(TokenType.RPAREN);
                pattern = { type: 'EnumPattern', variant: 'Some', innerBind: bindName };
            } else if (this.match(TokenType.NONE)) {
                pattern = { type: 'EnumPattern', variant: 'None' };
            } else if (this.match(TokenType.OK)) {
                this.consume(TokenType.LPAREN);
                const bindName = this.consume(TokenType.IDENTIFIER).value;
                this.consume(TokenType.RPAREN);
                pattern = { type: 'EnumPattern', variant: 'Ok', innerBind: bindName };
            } else if (this.match(TokenType.ERR)) {
                this.consume(TokenType.LPAREN);
                const bindName = this.consume(TokenType.IDENTIFIER).value;
                this.consume(TokenType.RPAREN);
                pattern = { type: 'EnumPattern', variant: 'Err', innerBind: bindName };
            } else {
                // For this toy language, patterns are literals
                pattern = this.parseExpression();
            }

            this.consume(TokenType.ARROW, "Expected '=>' after pattern");

            // Body: Block or Statement
            let body;
            if (this.match(TokenType.LBRACE)) {
                // Braced Block: { stmt1 stmt2 ... }
                // Note: Lexer suppresses newlines inside braces, so statements appear adjacent.
                const statements = [];
                while (this.peek().type !== TokenType.RBRACE && this.peek().type !== TokenType.EOF) {
                    statements.push(this.parseStatement());
                }
                this.consume(TokenType.RBRACE, "Expected '}' after match block");
                body = { type: 'Block', statements };
            } else {
                body = this.parseStatement();
            }

            cases.push({ type: 'MatchCase', pattern, body });
        }

        this.consume(TokenType.DEDENT);
        return { type: 'MatchStmt', subject, cases };
    }

    parseVarDecl() {
        this.consume(TokenType.LET);

        let isMutable = false;
        if (this.match(TokenType.MUT)) {
            isMutable = true;
        }

        // Check for Tuple Destructuring: let (a, b) = ...
        if (this.match(TokenType.LPAREN)) {
            const names = [];
            do {
                const n = this.consume(TokenType.IDENTIFIER, "Expected variable name in destructuring").value;
                names.push(n);
            } while (this.match(TokenType.COMMA));
            this.consume(TokenType.RPAREN);

            // Expect Assigment
            this.consume(TokenType.ASSIGN, "Expected '=' in destructuring assignment");
            const initializer = this.parseExpression();

            // Ignore type annotation for destructuring for now (complex to parse (int, int))
            // But we might need to skip newline
            if (this.peek().type === TokenType.NEWLINE) { this.consume(TokenType.NEWLINE); }

            return { type: 'DestructuringAssign', names, initializer, mutable: isMutable };
        }

        const name = this.consume(TokenType.IDENTIFIER, "Expected variable name").value;

        let typeAnnotation = null;
        if (this.match(TokenType.COLON)) {
            typeAnnotation = this.parseType();
        }

        let initializer = null;
        if (this.match(TokenType.ASSIGN)) {
            initializer = this.parseExpression();
        }

        // User example doesn't have semicolons, so expect newline
        if (this.peek().type === TokenType.NEWLINE) {
            this.consume(TokenType.NEWLINE);
        }

        return {
            type: 'VarDecl',
            name,
            varType: typeAnnotation, // 'int', 'str'
            mutable: isMutable,
            initializer
        };
    }

    parseAssignment() {
        const name = this.consume(TokenType.IDENTIFIER).value;
        this.consume(TokenType.ASSIGN);
        const value = this.parseExpression();
        // consume newline if present
        if (this.peek().type === TokenType.NEWLINE) this.consume(TokenType.NEWLINE);

        return { type: 'Assignment', name, value };
    }

    parseExpressionStatement() {
        const expr = this.parseExpression();
        if (this.peek().type === TokenType.NEWLINE) this.consume(TokenType.NEWLINE);
        return { type: 'ExpressionStatement', expression: expr };
    }

    parseBlock() {
        // Expect NEWLINE then INDENT
        // But what if we are already at NEWLINE?
        if (this.peek().type === TokenType.NEWLINE) {
            this.consume(TokenType.NEWLINE);
        }

        this.consume(TokenType.INDENT, "Expected indent for block");

        const statements = [];
        while (this.peek().type !== TokenType.DEDENT && this.peek().type !== TokenType.EOF) {
            // Skip empty lines/excess newlines
            if (this.peek().type === TokenType.NEWLINE) {
                this.consume(TokenType.NEWLINE);
                continue;
            }
            statements.push(this.parseStatement());
        }

        this.consume(TokenType.DEDENT, "Expected dedent after block");
        return { type: 'Block', statements };
    }

    parseExtern() {
        this.consume(TokenType.EXTERN);
        this.consume(TokenType.FN);
        const name = this.consume(TokenType.IDENTIFIER, "Expected external function name").value;
        this.consume(TokenType.LPAREN);

        const params = [];
        if (this.peek().type !== TokenType.RPAREN) {
            do {
                const pName = this.consume(TokenType.IDENTIFIER).value;
                this.consume(TokenType.COLON);
                const pType = this.parseType();
                params.push({ name: pName, type: pType });
            } while (this.match(TokenType.COMMA));
        }
        this.consume(TokenType.RPAREN);

        // Optional return type
        let returnType = 'void';
        // Check for -> logic here, user example invalid syntax? "fn alert(msg: str)" (no return) or "-> void"?
        // Assuming pythonic "def foo() -> int:"
        // But invalid example showed "extern fn alert(msg: str)"

        // Let's expect NEWLINE
        if (this.peek().type === TokenType.NEWLINE) this.consume(TokenType.NEWLINE);

        return { type: 'ExternFn', name, params, returnType };
    }

    parseEnumDef() {
        this.consume(TokenType.ENUM);
        const name = this.consume(TokenType.IDENTIFIER, "Expected Enum name").value;
        this.consume(TokenType.COLON);
        this.consume(TokenType.NEWLINE);
        this.consume(TokenType.INDENT);

        const variants = [];
        while (this.peek().type !== TokenType.DEDENT && this.peek().type !== TokenType.EOF) {
            if (this.peek().type === TokenType.NEWLINE) { this.consume(TokenType.NEWLINE); continue; }

            const vName = this.consume(TokenType.IDENTIFIER).value;
            // Check for struct-like variant: Variant { code: int }
            let fields = [];
            if (this.match(TokenType.LBRACE)) {
                do {
                    if (this.peek().type === TokenType.RBRACE) break;
                    // Skip newlines
                    while (this.match(TokenType.NEWLINE));

                    const fName = this.consume(TokenType.IDENTIFIER).value;
                    this.consume(TokenType.COLON);
                    const fType = this.parseType();
                    fields.push({ name: fName, type: fType });

                    while (this.match(TokenType.NEWLINE));
                } while (this.match(TokenType.COMMA));
                this.consume(TokenType.RBRACE);
            }

            variants.push({ name: vName, fields });
            if (this.peek().type === TokenType.NEWLINE) this.consume(TokenType.NEWLINE);
        }
        this.consume(TokenType.DEDENT);
        return { type: 'EnumDef', name, variants };
    }

    parseMatchStmt() {
        this.consume(TokenType.MATCH);
        const subject = this.parseExpression();
        this.consume(TokenType.COLON);
        this.consume(TokenType.NEWLINE);
        this.consume(TokenType.INDENT);

        const cases = [];
        while (this.peek().type !== TokenType.DEDENT && this.peek().type !== TokenType.EOF) {
            if (this.peek().type === TokenType.NEWLINE) { this.consume(TokenType.NEWLINE); continue; }

            // Pattern: Status::Active or Status::Error { code }
            // For now, let's parse as Expression (MemberAccess) then refine?
            // "Status::Active" is MemberAccess if :: is DOT? User spec says :: but I only have DOT.
            // Let's assume Status.Active for now or MemberAccess with :: support later?
            // Wait, spec said `Status::Active`. Lexer has no `DOUBLE_COLON`.
            // User example used `Status::Active`.
            // I should add DOUBLE_COLON token later? Or maybe just DOT for now?
            // "Status::Active". Lexer will see IDENT COLON COLON IDENT.
            // I'll parse that pattern.

            // Pattern Parsing
            let pattern = {};
            let baseName = this.consume(TokenType.IDENTIFIER).value;
            if (this.match(TokenType.DOUBLE_COLON)) {
                const variant = this.consume(TokenType.IDENTIFIER).value;

                // Destructuring? { code }
                let fields = [];
                if (this.match(TokenType.LBRACE)) {
                    do {
                        fields.push(this.consume(TokenType.IDENTIFIER).value);
                    } while (this.match(TokenType.COMMA));
                    this.consume(TokenType.RBRACE);
                    pattern = { type: 'EnumPattern', enumName: baseName, variant, fields };
                } else {
                    pattern = { type: 'EnumPattern', enumName: baseName, variant, fields: [] };
                }
            } else if (baseName === '_') {
                // Wildcard pattern
                pattern = { type: 'Wildcard' };
            } else {
                // Literal or Variable binding?
                pattern = { type: 'Identifier', name: baseName }; // For now
            }

            this.consume(TokenType.FAT_ARROW, "Expected FAT_ARROW");

            // Body statement
            // Check for Block (NEWLINE INDENT) or single stmt
            let body;
            if (this.peek().type === TokenType.NEWLINE) {
                this.consume(TokenType.NEWLINE);
                this.consume(TokenType.INDENT);
                // Single statement or block?
                // Usually block starts here.
                // Let's assume block logic
                const stmts = [];
                while (this.peek().type !== TokenType.DEDENT) {
                    stmts.push(this.parseStatement());
                }
                this.consume(TokenType.DEDENT);
                body = { type: 'Block', statements: stmts };
            } else {
                body = this.parseStatement();
            }

            cases.push({ pattern, body });
        }
        this.consume(TokenType.DEDENT);
        return { type: 'MatchStmt', subject, cases };
    }

    parseForStmt() {
        this.consume(TokenType.FOR);
        const item = this.consume(TokenType.IDENTIFIER, "Expected iterator variable").value;
        this.consume(TokenType.IN);
        const iterator = this.parseExpression(); // This should be an Array
        this.consume(TokenType.COLON);

        const body = this.parseBlock();
        return { type: 'ForStmt', item, iterator, body };
    }

    parseIfStmt() {
        this.consume(TokenType.IF);
        const condition = this.parseExpression();
        this.consume(TokenType.COLON, "Expected ':' after if condition");

        const thenBranch = this.parseBlock();
        let elseBranch = null;

        // Check for 'else'
        // 'else' should be at the same indentation level as 'if'.
        // Our parseBlock consumes DEDENT, so we are back to outer level.
        if (this.match(TokenType.ELSE)) {
            this.consume(TokenType.COLON, "Expected ':' after else");
            elseBranch = this.parseBlock();
        }

        return { type: 'IfStmt', condition, thenBranch, elseBranch };
    }

    parseWhileStmt() {
        this.consume(TokenType.WHILE);
        const condition = this.parseExpression();
        this.consume(TokenType.COLON, "Expected ':' after while condition");
        const body = this.parseBlock();
        return { type: 'WhileStmt', condition, body };
    }

    parseReturnStmt() {
        this.consume(TokenType.RETURN);
        let value = null;
        if (this.peek().type !== TokenType.NEWLINE && this.peek().type !== TokenType.EOF) {
            value = this.parseExpression();
        }
        // consume newline if present
        if (this.peek().type === TokenType.NEWLINE) this.consume(TokenType.NEWLINE);

        return { type: 'ReturnStmt', value };
    }

    parseType() {
        // Array Type: [T]
        if (this.match(TokenType.LBRACKET)) {
            const inner = this.parseType();
            this.consume(TokenType.RBRACKET, "Expected ']' after array type");
            return `[${inner}]`;
        }

        // Tuple Type: (A, B)
        if (this.match(TokenType.LPAREN)) {
            const types = [];
            do {
                types.push(this.parseType());
            } while (this.match(TokenType.COMMA));
            this.consume(TokenType.RPAREN, "Expected ')' after tuple type");
            return `(${types.join(', ')})`;
        }

        // Simple types: int, str, bool
        if (this.match(TokenType.TYPE_INT)) return 'int';
        if (this.match(TokenType.TYPE_STR)) return 'str';
        if (this.match(TokenType.TYPE_BOOL)) return 'bool';

        // Generics or Struct types (Identifier)
        const token = this.consume(TokenType.IDENTIFIER, "Expected type");
        const typeName = token.value;

        // Check for Generics <T>
        if (this.match(TokenType.LT)) {
            const innerTypes = [];
            do {
                innerTypes.push(this.parseType());
            } while (this.match(TokenType.COMMA));
            this.consume(TokenType.GT, "Expected '>' after generic type args");

            // Return shape: "Option<int>" string or object?
            // Analyzer expects strings usually. Let's make a canonical string for now.
            return `${typeName}<${innerTypes.join(', ')}>`;
        }

        return typeName;
    }

    parseExpression() {
        return this.parseBinary(0);
    }

    // Precedence climbing
    parseBinary(minPrecedence) {
        let left = this.parsePrimary();

        while (true) {
            const token = this.peek();
            const precedence = this.getPrecedence(token.type);

            if (precedence < minPrecedence) break;

            const operator = this.consume(token.type).value;
            const right = this.parseBinary(precedence + 1);
            left = { type: 'BinaryExpr', operator, left, right };
        }
        return left;
    }

    getPrecedence(type) {
        if (type === TokenType.PLUS || type === TokenType.MINUS) return 10;
        if (type === TokenType.STAR || type === TokenType.SLASH) return 20;

        // Comparison
        if (type === TokenType.EQ || type === TokenType.NOT_EQ ||
            type === TokenType.LT || type === TokenType.GT ||
            type === TokenType.LTE || type === TokenType.GTE) return 5;

        return -1;
    }

    parsePrimary() {
        if (this.match(TokenType.NUMBER)) {
            return { type: 'Literal', valueType: 'int', value: this.tokens[this.pos - 1].value };
        }
        if (this.match(TokenType.STRING)) {
            return { type: 'Literal', valueType: 'str', value: this.tokens[this.pos - 1].value };
        }
        if (this.match(TokenType.BOOLEAN)) {
            return { type: 'Literal', valueType: 'bool', value: this.tokens[this.pos - 1].value === 'true' };
        }

        // Array Literal: [a, b, c]
        if (this.match(TokenType.LBRACKET)) {
            const elements = [];
            if (this.peek().type !== TokenType.RBRACKET) {
                do {
                    // Skip newlines in array definition
                    while (this.match(TokenType.NEWLINE));
                    elements.push(this.parseExpression());
                    while (this.match(TokenType.NEWLINE));
                } while (this.match(TokenType.COMMA));
            }
            this.consume(TokenType.RBRACKET, "Expected ']' after array literal");
            return { type: 'ArrayLiteral', elements };
        }

        // Tuple Literal: (a, b) OR Grouping: (a)
        if (this.match(TokenType.LPAREN)) {
            // Check for empty tuple/unit ()
            if (this.match(TokenType.RPAREN)) {
                return { type: 'TupleLiteral', elements: [] };
            }

            const expr = this.parseExpression();

            // If comma follows, it is a Tuple
            if (this.match(TokenType.COMMA)) {
                const elements = [expr];
                do {
                    // Check for trailing comma ) case
                    if (this.peek().type === TokenType.RPAREN) break;
                    elements.push(this.parseExpression());
                } while (this.match(TokenType.COMMA));
                this.consume(TokenType.RPAREN);
                return { type: 'TupleLiteral', elements };
            }

            this.consume(TokenType.RPAREN);
            return expr; // Just grouping
        }

        if (this.match(TokenType.PIPE)) {
            // Lambda: |args|: body
            const params = [];
            if (this.peek().type !== TokenType.PIPE) {
                do {
                    const pName = this.consume(TokenType.IDENTIFIER).value;
                    // Optional type? |x: int|
                    let pType = 'any';
                    params.push({ name: pName, type: pType });
                } while (this.match(TokenType.COMMA));
            }
            this.consume(TokenType.PIPE);

            // Body could be block (:) or single expression
            if (this.match(TokenType.COLON)) {
                if (this.peek().type === TokenType.NEWLINE) {
                    // Block body
                    const body = this.parseBlock();
                    return { type: 'LambdaExpr', params, body };
                }
                // Single stmt?
            }

            // Single expression body? |x| x+1
            // If we didn't match colon, or matched colon but no newline...
            // Let's assume colon required for pythonic consistency in this lang?
            // Previous implementation required colon.
            // If implicit body: |x| x+1
            const body = this.parseExpression();
            return { type: 'LambdaExpr', params, body };
        }
        if (this.match(TokenType.IDENTIFIER) || this.match(TokenType.THIS)) {
            const token = this.tokens[this.pos - 1];
            const name = token.value || 'this';
            let expr = { type: 'Identifier', name };

            // Handle Enum::Variant
            if (token.type === TokenType.IDENTIFIER && this.match(TokenType.DOUBLE_COLON)) {
                const variantName = this.consume(TokenType.IDENTIFIER, "Expect variant name after ::").value;
                // It's a Variant Reference.
                // It might be Unit Variant usage: let s = State::Idle
                // Or Tuple/Struct Variant construction: State::Error { code: 1 }

                // How do we represent this?
                // Let's create a specialized node 'EnumReference' or treat it as MemberAccess (static)?
                // For Struct Init, we need the *Type Name*.
                // Here we have TypeName (name) and VariantName (variantName).

                // If followed by `{`, it is StructInit for a Variant?
                // PyRust 2.0 Parser previously handled `StructInit` only for straight structs.
                // We need to support `Enum init`.

                if (this.match(TokenType.LBRACE)) {
                    // Enum Struct Variant Init: State::Error { code: 1 }
                    const fields = [];
                    if (this.peek().type !== TokenType.RBRACE) {
                        while (true) {
                            while (this.match(TokenType.NEWLINE));
                            if (this.peek().type === TokenType.RBRACE) break;

                            const fieldName = this.consume(TokenType.IDENTIFIER, "Expected field name").value;
                            this.consume(TokenType.COLON);
                            const value = this.parseExpression();
                            fields.push({ name: fieldName, value });

                            while (this.match(TokenType.NEWLINE)); // Skip newlines after value

                            if (!this.match(TokenType.COMMA)) break;
                        }
                    }
                    this.consume(TokenType.RBRACE, "Expected '}'");

                    return {
                        type: 'EnumVariant',
                        enumType: name,
                        variant: variantName,
                        kind: 'Struct',
                        fields
                    };
                }
                else if (this.match(TokenType.LPAREN)) {
                    // Tuple Variant: State::Point(1, 2)
                    // ... impl later if needed. For now assume Struct or Unit.
                    // Let's parse args
                    const args = [];
                    if (this.peek().type !== TokenType.RPAREN) {
                        do {
                            args.push(this.parseExpression());
                        } while (this.match(TokenType.COMMA));
                    }
                    this.consume(TokenType.RPAREN);
                    return {
                        type: 'EnumVariant',
                        enumType: name,
                        variant: variantName,
                        kind: 'Tuple',
                        value: args.length === 1 ? args[0] : args // Simplify
                    };
                }

                // Unit Variant: State::Idle
                return {
                    type: 'EnumVariant',
                    enumType: name,
                    variant: variantName,
                    kind: 'Unit',
                    value: null
                };
            }

            // Check for Struct Instantiation: Name { ... }
            if (token.type === TokenType.IDENTIFIER && this.match(TokenType.LBRACE)) {
                // Parse fields
                const fields = [];
                // Allow empty struct? Name {}
                if (this.peek().type !== TokenType.RBRACE) {
                    while (true) {
                        // Skip newlines before field
                        while (this.match(TokenType.NEWLINE));

                        // Check for trailing comma / end of block
                        if (this.peek().type === TokenType.RBRACE) break;

                        const fieldName = this.consume(TokenType.IDENTIFIER, "Expected field name").value;
                        this.consume(TokenType.COLON);
                        const value = this.parseExpression();
                        fields.push({ name: fieldName, value });

                        while (this.match(TokenType.NEWLINE)); // Skip newlines after value

                        if (!this.match(TokenType.COMMA)) break;
                    }
                }
                while (this.match(TokenType.NEWLINE));
                this.consume(TokenType.RBRACE);
                expr = { type: 'StructInit', structName: name, fields };
            }
            // Check for Function Call: Name(...)
            else if (this.match(TokenType.LPAREN)) {
                const args = [];
                if (this.peek().type !== TokenType.RPAREN) {
                    do {
                        args.push(this.parseExpression());
                    } while (this.match(TokenType.COMMA));
                }
                this.consume(TokenType.RPAREN);
                expr = { type: 'CallExpr', callee: name, args };
            }

            // Suffix Loop: Member Access (.), Indexing ([]), Calls (())
            while (true) {
                if (this.match(TokenType.DOT)) {
                    const field = this.consume(TokenType.IDENTIFIER, "Expected field name after '.'").value;
                    expr = { type: 'MemberAccess', object: expr, field };

                    // Check if this is a method call: obj.method(...)
                    if (this.match(TokenType.LPAREN)) {
                        const args = [];
                        if (this.peek().type !== TokenType.RPAREN) {
                            do {
                                args.push(this.parseExpression());
                            } while (this.match(TokenType.COMMA));
                        }
                        this.consume(TokenType.RPAREN);
                        // Transform MemberAccess into CallExpr
                        expr = { type: 'CallExpr', callee: expr, args };
                    }
                }
                else if (this.match(TokenType.LBRACKET)) {
                    // Indexing: expr[index]
                    const index = this.parseExpression();
                    this.consume(TokenType.RBRACKET, "Expected ']' after index");
                    expr = { type: 'IndexExpr', object: expr, index };
                }
                else {
                    break;
                }
            }

            return expr;
        }

        // Safety Type Constructors
        if (this.match(TokenType.SOME)) {
            try {
                this.consume(TokenType.LPAREN);
                const value = this.parseExpression();
                this.consume(TokenType.RPAREN);
                return { type: 'EnumVariant', enumType: 'Option', variant: 'Some', value }; // e.g. Some(5)
            } catch (e) {
                // Fallback if Some is used effectively as a type or something else? No, strict syntax.
                throw e;
            }
        }
        if (this.match(TokenType.NONE)) {
            return { type: 'EnumVariant', enumType: 'Option', variant: 'None', value: null };
        }
        if (this.match(TokenType.OK)) {
            this.consume(TokenType.LPAREN);
            const value = this.parseExpression();
            this.consume(TokenType.RPAREN);
            return { type: 'EnumVariant', enumType: 'Result', variant: 'Ok', value };
        }
        if (this.match(TokenType.ERR)) {
            this.consume(TokenType.LPAREN);
            const value = this.parseExpression();
            this.consume(TokenType.RPAREN);
            return { type: 'EnumVariant', enumType: 'Result', variant: 'Err', value };
        }

        // References &x, &mut x
        if (this.match(TokenType.AMPERSAND)) {
            let mutable = false;
            if (this.match(TokenType.MUT)) mutable = true;
            const expr = this.parsePrimary();
            // This usually should be an identifier, but let's allow expr for now
            return { type: 'Borrow', mutable, expression: expr };
        }

        // Lambda / Closure: |args|: block
        if (this.match(TokenType.PIPE)) {
            const params = [];
            if (!this.match(TokenType.PIPE)) {
                do {
                    const paramName = this.consume(TokenType.IDENTIFIER, "Expected parameter name").value;
                    // Optional type annotation? |x: int|
                    let paramType = 'any';
                    // We can skip type or support it. Example `|x|` infers type or uses 'any'.
                    params.push({ name: paramName, type: paramType });
                } while (this.match(TokenType.COMMA));
                this.consume(TokenType.PIPE, "Expected closing '|' for lambda parameters");
            }

            // Expect Colon
            if (this.match(TokenType.COLON)) {
                // Block body
                // Check if it's a block or expression?
                // `return x + 1` is valid statement.
                // If next is NEWLINE, likely indent block.
                if (this.match(TokenType.NEWLINE)) {
                    this.consume(TokenType.INDENT);
                    const body = [];
                    while (!this.check(TokenType.DEDENT) && !this.isAtEnd()) {
                        body.push(this.parseStatement());
                        while (this.match(TokenType.NEWLINE));
                    }
                    this.consume(TokenType.DEDENT);
                    return { type: 'LambdaExpr', params, body: { type: 'Block', statements: body } };
                } else {
                    // Single statement / expression logic
                    // `|x|: return x + 1`
                    const stmt = this.parseStatement();
                    return { type: 'LambdaExpr', params, body: { type: 'Block', statements: [stmt] } };
                }
            } else {
                // Expression body without colon? `|x| x + 1`
                const expr = this.parseExpression();
                return { type: 'LambdaExpr', params, body: { type: 'Block', statements: [{ type: 'ReturnStmt', value: expr }] } };
            }
        }

        this.error(`Unexpected token in expression: ${JSON.stringify(this.peek())}`);
    }
}
