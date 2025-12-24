import { Lexer } from './src/compiler/lexer.js';
import { Parser } from './src/compiler/parser.js';
import { SemanticAnalyzer } from './src/compiler/analyzer.js';
import { Interpreter } from './src/compiler/interpreter.js';

const code = `
fn main():
    let start: int = 10
    let adder = |x|:
        return x + start
    let res: int = adder(5)
    print(res)
`;

try {
    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    const parser = new Parser(code);
    const ast = parser.parse();
    const analyzer = new SemanticAnalyzer();
    analyzer.visit(ast);

    if (analyzer.errors.length === 0) {
        console.log("Analyzing Pass. Running...");
        const interpreter = new Interpreter(ast, (out) => console.log("STDOUT:", out));
        interpreter.run();
    } else {
        console.error("Analyzer Errors:", analyzer.errors);
    }
} catch (e) {
    console.error("Crash:", e);
}
