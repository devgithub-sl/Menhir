import { Lexer } from './src/compiler/lexer.js';
import { TokenType } from './src/compiler/types.js';

const code = `
fn main():
    let u = User {
        name: "Alice",
        active: true
    }
`;

console.log("--- Testing Lexer ---");
try {
    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    tokens.forEach(t => {
        console.log(`${t.type.padEnd(12)} ${JSON.stringify(t.value)}`);
    });
} catch (e) {
    console.error(e);
}
