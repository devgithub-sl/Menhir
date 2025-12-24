// Token Types
export const TokenType = {
    // Keywords
    FN: 'FN',
    STRUCT: 'STRUCT',
    LET: 'LET',
    LET: 'LET',
    MUT: 'MUT',
    IF: 'IF',
    ELSE: 'ELSE',
    RETURN: 'RETURN',
    MATCH: 'MATCH',
    UNDERSCORE: 'UNDERSCORE', // _
    WHILE: 'WHILE',
    FOR: 'FOR',
    IN: 'IN', // in
    TRAIT: 'TRAIT',
    IMPL: 'IMPL',
    MATCH: 'MATCH',
    ENUM: 'ENUM',
    EXTERN: 'EXTERN',
    FOR: 'FOR',
    IN: 'IN',
    THIS: 'THIS',
    LESS: 'LESS', // <
    GREATER: 'GREATER', // >

    // Safety
    SOME: 'SOME',
    NONE: 'NONE',
    OK: 'OK',
    ERR: 'ERR',

    // Types
    TYPE_INT: 'TYPE_INT',
    TYPE_STR: 'TYPE_STR',
    TYPE_BOOL: 'TYPE_BOOL',

    // Identifiers & Literals
    IDENTIFIER: 'IDENTIFIER',
    NUMBER: 'NUMBER',
    STRING: 'STRING',
    BOOLEAN: 'BOOLEAN',

    // Operators
    ASSIGN: 'ASSIGN',
    PLUS: 'PLUS',
    MINUS: 'MINUS',
    STAR: 'STAR',
    SLASH: 'SLASH',
    FAT_ARROW: 'FAT_ARROW', // =>
    THIN_ARROW: 'THIN_ARROW', // ->
    AMPERSAND: 'AMPERSAND', // &
    PIPE: 'PIPE', // |
    DOT: 'DOT', // .
    DOUBLE_COLON: 'DOUBLE_COLON', // ::

    // Comparison
    EQ: 'EQ', // ==
    NOT_EQ: 'NOT_EQ', // !=
    LT: 'LT', // <
    GT: 'GT', // >
    LTE: 'LTE', // <=
    GTE: 'GTE', // >=

    // Delimiters
    LPAREN: 'LPAREN',
    RPAREN: 'RPAREN',
    LBRACE: 'LBRACE', // {
    RBRACE: 'RBRACE', // }
    COLON: 'COLON',
    COMMA: 'COMMA',
    NEWLINE: 'NEWLINE',
    INDENT: 'INDENT',
    DEDENT: 'DEDENT',
    EOF: 'EOF',
};

export class Token {
    constructor(type, value, line, column) {
        this.type = type;
        this.value = value;
        this.line = line;
        this.column = column;
    }

    toString() {
        return `Token(${this.type}, "${this.value}") @ ${this.line}:${this.column}`;
    }
}
