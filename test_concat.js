import { Lexer } from './src/compiler/lexer.js';
import { Parser } from './src/compiler/parser.js';
import { SemanticAnalyzer } from './src/compiler/analyzer.js';

const code = `
fn main():
    let s: str = "Total: " + 10
    print(s)
`;

try {
    console.log("Lexing...");
    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();

    console.log("Parsing...");
    const parser = new Parser(code);
    const ast = parser.parse();

    console.log("Analyzing...");
    const analyzer = new SemanticAnalyzer();
    analyzer.visit(ast);

    if (analyzer.errors.length > 0) {
        console.error("Analyzer Errors:", analyzer.errors);
    } else {
        console.log("Analysis Successful!");
    }
} catch (e) {
    console.error("Crash:", e);
}
