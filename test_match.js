import { Parser } from './src/compiler/parser.js';

const code = `
extern fn alert(msg: str)

struct Point<T>:
    x: T
    y: T

enum State:
    Idle
    Running
    Stopped { reason: str }

fn main():
    let s: State = State::Stopped { reason: "Done" }
    match s:
        State::Stopped { reason } => print("Stopped: " + reason)
        State::Idle => print("Idle")
        State::Running => print("Running")
    print("done")
`;

try {
    const parser = new Parser(code);
    const ast = parser.parse();
    console.log("Parsing SUCCESS!");
} catch (e) {
    console.error("Parse Error:", e.message);
}
