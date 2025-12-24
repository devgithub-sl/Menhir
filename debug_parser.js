import { Parser } from './src/compiler/parser.js';

const code = `
struct User:
    name: str
    active: bool

fn main():
    let u: User = User {
        name: "Alice",
        active: true,
    }
`;

console.log("--- Testing Parser ---");
try {
    const parser = new Parser(code);
    const ast = parser.parse();
    console.log(JSON.stringify(ast, null, 2));
} catch (e) {
    console.error(e);
}
