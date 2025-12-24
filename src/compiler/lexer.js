import { TokenType, Token } from './types.js';

export class Lexer {
    constructor(input) {
        this.source = input;
        this.pos = 0;
        this.line = 1;
        this.column = 1;
        this.indentStack = [0]; // Tracks indentation levels
        this.tokenQueue = [];
        this.previewToken = null; // Legacy support if needed, but preferably use queue
        this.parenLevel = 0; // Tracks nesting level of ( ) [ ] { }
    }

    error(msg) {
        throw new Error(`Lexer Error at ${this.line}:${this.column}: ${msg}`);
    }

    tokenize() {
        const tokens = [];
        let token;
        do {
            token = this.nextToken();
            if (token) {
                tokens.push(token);
            }
        } while (token && token.type !== TokenType.EOF);
        return tokens;
    }

    nextToken() {
        if (this.tokenQueue.length > 0) {
            return this.tokenQueue.shift();
        }

        if (this.pos >= this.source.length) {
            // Handle remaining DEDENTS at EOF
            if (this.indentStack.length > 1) {
                this.indentStack.pop();
                return new Token(TokenType.DEDENT, '', this.line, this.column);
            }
            return new Token(TokenType.EOF, '', this.line, this.column);
        }

        const char = this.peek();

        // Check for Newline & Indentation first
        if (char === '\n') {
            return this.handleNewline();
        }

        // Skip other whitespace (but not newlines)
        if (this.isWhitespace(char)) {
            this.advance();
            return this.nextToken();
        }

        // Comments
        if (char === '#') {
            this.skipComment();
            return this.nextToken();
        }

        if (this.isAlpha(char)) {
            return this.identifierOrKeyword();
        }

        if (this.isDigit(char)) {
            return this.number();
        }

        if (char === '"') {
            return this.string();
        }

        // Symbols
        switch (char) {
            case '=':
                this.advance();
                if (this.peek() === '=') {
                    this.advance();
                    return new Token(TokenType.EQ, '==', this.line, this.column - 2);
                }
                if (this.peek() === '>') {
                    this.advance();
                    return new Token(TokenType.FAT_ARROW, '=>', this.line, this.column - 2);
                }
                return new Token(TokenType.ASSIGN, '=', this.line, this.column - 1);

            case '!':
                this.advance();
                if (this.peek() === '=') {
                    this.advance();
                    return new Token(TokenType.NOT_EQ, '!=', this.line, this.column - 2);
                }
                this.error("Unexpected character '!'");
                break;

            case '<':
                this.advance();
                if (this.peek() === '=') {
                    this.advance();
                    return new Token(TokenType.LTE, '<=', this.line, this.column - 2);
                }
                return new Token(TokenType.LT, '<', this.line, this.column - 1);

            case '>':
                this.advance();
                if (this.peek() === '=') {
                    this.advance();
                    return new Token(TokenType.GTE, '>=', this.line, this.column - 2);
                }
                return new Token(TokenType.GT, '>', this.line, this.column - 1);

            case '+': this.advance(); return new Token(TokenType.PLUS, '+', this.line, this.column - 1);
            case '-':
                this.advance();
                if (this.peek() === '>') {
                    this.advance();
                    return new Token(TokenType.THIN_ARROW, '->', this.line, this.column - 2);
                }
                return new Token(TokenType.MINUS, '-', this.line, this.column - 1);
            case '*': this.advance(); return new Token(TokenType.STAR, '*', this.line, this.column - 1);
            case '/': this.advance(); return new Token(TokenType.SLASH, '/', this.line, this.column - 1);
            case '&': this.advance(); return new Token(TokenType.AMPERSAND, '&', this.line, this.column - 1);
            case ':':
                this.advance();
                if (this.peek() === ':') {
                    this.advance();
                    return new Token(TokenType.DOUBLE_COLON, '::', this.line, this.column - 2);
                }
                return new Token(TokenType.COLON, ':', this.line, this.column - 1);
            case ',': this.advance(); return new Token(TokenType.COMMA, ',', this.line, this.column - 1);
            case '.': this.advance(); return new Token(TokenType.DOT, '.', this.line, this.column - 1);

            case '(':
                this.parenLevel++;
                this.advance();
                return new Token(TokenType.LPAREN, '(', this.line, this.column - 1);
            case ')':
                this.parenLevel--;
                this.advance();
                return new Token(TokenType.RPAREN, ')', this.line, this.column - 1);

            case '{':
                this.parenLevel++;
                this.advance();
                return new Token(TokenType.LBRACE, '{', this.line, this.column - 1);
            case '}':
                this.parenLevel--;
                this.advance();
                return new Token(TokenType.RBRACE, '}', this.line, this.column - 1);

            case '[':
                this.parenLevel++;
                this.advance();
                return new Token(TokenType.LBRACKET, '[', this.line, this.column - 1);
            case ']':
                this.parenLevel--;
                this.advance();
                return new Token(TokenType.RBRACKET, ']', this.line, this.column - 1);

            case '|': this.advance(); return new Token(TokenType.PIPE, '|', this.line, this.column - 1);
        }

        this.error(`Unexpected character '${char}'`);
    }

    handleNewline() {
        this.advance(); // consume \n

        // Calculate current indentation
        let indentLevel = 0;
        while (this.peek() === ' ' || this.peek() === '\t') {
            if (this.peek() === '\t') indentLevel += 4; // Assume 1 tab = 4 spaces
            else indentLevel += 1;
            this.advance();
        }

        // If it's a blank line or comment only, skip it
        if (this.peek() === '\n' || this.peek() === '#') {
            // In recursion we might hit EOF or another newline
            if (this.pos >= this.source.length) return this.nextToken();
            return this.nextToken();
        }

        // If we are inside parentheses/braces, ignore indentation changes (Implicit Line Joining)
        if (this.parenLevel > 0) {
            // We ignored the newline, and we consumed the indentation whitespace.
            // Just return the next token.
            return this.nextToken();
        }

        // Check indentation against stack
        const currentIndent = this.indentStack[this.indentStack.length - 1];

        if (indentLevel > currentIndent) {
            this.indentStack.push(indentLevel);
            this.tokenQueue.push(new Token(TokenType.INDENT, '', this.line, this.column));
            return new Token(TokenType.NEWLINE, '\n', this.line - 1, 0);
        } else if (indentLevel < currentIndent) {
            this.tokenQueue = [];
            while (this.indentStack.length > 1 && this.indentStack[this.indentStack.length - 1] > indentLevel) {
                this.indentStack.pop();
                this.tokenQueue.push(new Token(TokenType.DEDENT, '', this.line, this.column));
            }

            if (this.indentStack[this.indentStack.length - 1] !== indentLevel) {
                this.error("Indentation error");
            }

            // Queue dedents
            // Return NEWLINE first
            return new Token(TokenType.NEWLINE, '\n', this.line - 1, 0);
        } else {
            // Same indentation
            return new Token(TokenType.NEWLINE, '\n', this.line - 1, 0);
        }
    }

    identifierOrKeyword() {
        let value = '';
        while (this.isAlphaNumeric(this.peek())) {
            value += this.advance();
        }

        const type = this.getKeywordType(value) || TokenType.IDENTIFIER;
        return new Token(type, value, this.line, this.column - value.length);
    }

    getKeywordType(word) {
        const keywords = {
            'fn': TokenType.FN,
            'struct': TokenType.STRUCT,
            'let': TokenType.LET,
            'mut': TokenType.MUT,
            'if': TokenType.IF,
            'else': TokenType.ELSE,
            'while': TokenType.WHILE,
            'for': TokenType.FOR,
            'in': TokenType.IN,
            'trait': TokenType.TRAIT,
            'impl': TokenType.IMPL,
            'this': TokenType.THIS,
            'return': TokenType.RETURN,
            'match': TokenType.MATCH,
            '_': TokenType.UNDERSCORE,
            'int': TokenType.TYPE_INT,
            'str': TokenType.TYPE_STR,
            'bool': TokenType.TYPE_BOOL,
            'true': TokenType.BOOLEAN,
            'true': TokenType.BOOLEAN,
            'false': TokenType.BOOLEAN,
            'Some': TokenType.SOME,
            'None': TokenType.NONE,
            'Ok': TokenType.OK,
            'Err': TokenType.ERR,
            'match': TokenType.MATCH,
            'enum': TokenType.ENUM,
            'extern': TokenType.EXTERN,
            'for': TokenType.FOR,
            'in': TokenType.IN,
        };
        return keywords[word];
    }

    number() {
        let value = '';
        while (this.isDigit(this.peek())) {
            value += this.advance();
        }
        return new Token(TokenType.NUMBER, parseInt(value), this.line, this.column - value.length);
    }

    string() {
        this.advance(); // skip "
        let value = '';
        while (this.peek() !== '"' && this.peek() !== '\0') {
            value += this.advance();
        }
        this.advance(); // skip closing "
        return new Token(TokenType.STRING, value, this.line, this.column - value.length - 2);
    }

    skipComment() {
        while (this.peek() !== '\n' && this.peek() !== '\0') {
            this.advance();
        }
    }

    // Helpers
    peek() {
        return this.pos < this.source.length ? this.source[this.pos] : '\0';
    }

    advance() {
        const char = this.source[this.pos++];
        this.column++;
        if (char === '\n') {
            this.line++;
            this.column = 1;
        }
        return char;
    }

    isWhitespace(char) {
        return char === ' ' || char === '\t' || char === '\r';
    }

    isAlpha(char) {
        return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || char === '_';
    }

    isDigit(char) {
        return char >= '0' && char <= '9';
    }

    isAlphaNumeric(char) {
        return this.isAlpha(char) || this.isDigit(char);
    }
}
