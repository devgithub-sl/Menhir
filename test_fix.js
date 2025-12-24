import { Lexer } from './src/compiler/lexer.js';
import { Parser } from './src/compiler/parser.js';

const code = `
enum State:
    Idle
    Stopped { reason: str }

fn main():
    let s: State = State::Stopped { reason: "Done" }
    let i: State = State::Idle
    print("Parsed!")
`;

try {
    const parser = new Parser(code);
    const ast = parser.parse();
    console.log("Success!");
    console.log(JSON.stringify(ast, null, 2));
} catch (e) {
    console.error("Parse Error:", e);
}
