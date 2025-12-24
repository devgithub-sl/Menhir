import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Eraser, Activity } from 'lucide-react';
import { CodeEditor } from './components/Editor';
import { Terminal } from './components/Terminal';
import { MemoryVisualizer } from './components/MemoryVisualizer';
import { Lexer } from './compiler/lexer';
import { Parser } from './compiler/parser';
import { SemanticAnalyzer } from './compiler/analyzer';
import { Interpreter } from './compiler/interpreter';

const INITIAL_CODE = `# PyRust 2.0 Feature Showcase

# --- External Functions (FFI) ---
extern fn alert(msg: str)

# --- Structs & Generics ---
struct Point<T>:
    x: T
    y: T

# --- Enums ---
enum State:
    Idle
    Running
    Stopped { reason: str }

# --- Traits ---
trait Describe:
    fn desc() -> str

impl Describe for Point<int>:
    fn desc() -> str:
        return "Point(" + to_string(this.x) + ", " + to_string(this.y) + ")"

fn main():
    print("=== PyRust 2.0 Feature Tour ===")

    # 1. Variables & Primitives
    let greeting: str = "Hello, World!"
    print(greeting)

    # 2. Collections (Arrays & Tuples)
    print("--- Collections ---")
    let nums: [int] = [10, 20, 30]
    print("Array Length: " + to_string(len(nums)))

    let person: (str, int) = ("Alice", 30)
    let (name, age) = person
    print("Destructured: " + name + " is " + to_string(age))

    # 3. Loops
    print("--- Loops ---")
    for i in range(3):
        print("Count: " + to_string(i))

    # 4. Pattern Matching
    print("--- Match ---")
    let s: State = State::Stopped { reason: "Done" }
    match s:
        State::Stopped { reason } => print("Stopped: " + reason)
        State::Idle => print("Idle")
        State::Running => print("Running")

    # 5. Objects & Closures
    print("--- Objects ---")
    let p: Point<int> = Point { x: 10, y: 20 }
    print(p.desc())

    let d = |x|: 
        return x * 2
    print("Doubled: " + to_string(d(5)))

    alert("Demo Completed!")
`;

function App() {
  const [code, setCode] = useState(INITIAL_CODE);
  const [output, setOutput] = useState([]);
  const [errors, setErrors] = useState([]);
  const [ast, setAst] = useState(null);

  // Memory State
  // scopes: [{ id, variables: { name: { value, moved } } }]
  const [scopes, setScopes] = useState([]);
  const [isRunning, setIsRunning] = useState(false);

  // Analyze code on change
  const runAnalysis = useCallback(() => {
    try {
      const lexer = new Lexer(code);
      const parser = new Parser(code);
      const newAst = parser.parse();
      setAst(newAst);

      const analyzer = new SemanticAnalyzer(newAst);
      const analysisErrors = analyzer.analyze();
      setErrors(analysisErrors);

    } catch (e) {
      setErrors([e.message]);
      setAst(null);
    }
  }, [code]);

  useEffect(() => {
    const timer = setTimeout(() => {
      runAnalysis();
    }, 500);
    return () => clearTimeout(timer);
  }, [code, runAnalysis]);

  // Helper for delays
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const handleRun = async () => {
    setOutput([]);
    setScopes([]); // Clear memory
    setIsRunning(true);

    if (errors.length > 0 || !ast) {
      setOutput(["Cannot run: Fix errors first."]);
      setIsRunning(false);
      return;
    }

    // We need to manage memory state in a ref to update it inside callbacks without closure staleness
    // actually standard state Update in reactor pattern is fine if we batch or just use functional updates, 
    // but the Interpreter runs synchronously. 
    // To visualize "step-by-step", we can't make the interpreter async easily without rewriting it to yield.
    // OR: We can just capture the events and then replay them with delay?
    // YES -> Capture all events, then replay.

    const events = [];
    const logs = [];

    try {
      const interpreter = new Interpreter(
        ast,
        (text) => logs.push(text), // Capture logs
        (event) => events.push(event) // Capture events
      );
      interpreter.run();

      // Replay
      let currentScopes = [];

      // Helper to update scopes based on event
      const processEvent = (ev, scopes) => {
        const newScopes = [...scopes];
        let scope = newScopes.find(s => s.id === ev.scopeId);

        if (!scope) {
          // Create new scope
          scope = { id: ev.scopeId, variables: {} };
          newScopes.push(scope);
        }

        if (ev.type === 'DECLARE' || ev.type === 'UPDATE') {
          scope.variables[ev.name] = { value: ev.value, moved: ev.moved };
        } else if (ev.type === 'MOVE') {
          if (scope.variables[ev.name]) {
            scope.variables[ev.name].moved = true;
          }
        }

        return newScopes;
      };

      for (const log of logs) {
        // Logs happen amidst events usually, but here we separated them.
        // Ideally we'd timestamp them or interleave.
        // For simplify: Show all execution memory first? No that's confusing.
        // We need to interleave.
        // interpreter.onOutput -> record { type: 'LOG', text }
        // interpreter.onEvent -> record { type: 'MEM', ... }
      }

    } catch (e) {
      setOutput(prev => [...prev, `Runtime Error: ${e.message}`]);
      setIsRunning(false);
      return;
    }

    // Re-run safely to capture interleaved Order:
    // We can't rewind the Interpreter easily.
    // Let's re-run with async delays? No, interpreter is sync.
    // Correct approach: The Interpreter emits events synchronously. 
    // We store a "Timeline" of actions.
    const timeline = [];

    try {
      const interpreter = new Interpreter(
        ast,
        (text) => timeline.push({ type: 'LOG', text }),
        (event) => timeline.push({ type: 'MEM', event })
      );
      interpreter.run();
    } catch (e) {
      setOutput([`Runtime Error: ${e.message}`]);
      setIsRunning(false);
      return;
    }

    // Now playback timeline
    let currentScopeState = [];

    for (const item of timeline) {
      await sleep(800); // 800ms delay per step

      if (item.type === 'LOG') {
        setOutput(prev => [...prev, item.text]);
      } else if (item.type === 'MEM') {
        const ev = item.event;
        setScopes(prev => {
          const newScopes = [...prev];
          // Find or create scope
          // We need to handle Global Scope properly.
          // Interpreter creates scopes on the fly.
          // We can match by                 // Handle Scope Events
          if (ev.type === 'ENTER_SCOPE') {
            // Push new scope
            newScopes.push({ id: ev.scopeId, variables: {}, active: true });
          } else if (ev.type === 'EXIT_SCOPE') {
            // Find scope and mark inactive or remove?
            // Visualizer requirement: "dissolve".
            // Let's remove it after a beat?
            // For "real-time" view, usually we remove it directly.
            // Or we can mark it { dropped: true } so visualizer renders it fading out.
            // But simpler: just filter it out?
            // Stack behavior: usually we pop the top.
            // But let's match by ID to be safe.
            const idx = newScopes.findIndex(s => s.id === ev.scopeId);
            if (idx !== -1) {
              newScopes.splice(idx, 1);
            }
          }
          else {
            // Variable Events
            let scopeIndex = newScopes.findIndex(s => s.id === ev.scopeId);
            // If scope not found (e.g. global?), create it if it's the first one?
            // Fallback for Global if ENTER_SCOPE wasn't emitted for it (Interpreter init)
            // Interpreter emits ENTER_SCOPE for blocks. Global is implicit in constructor.
            // But we didn't emit it.
            // The Global Environment has an ID.
            // Let's just create it.
            if (scopeIndex === -1 && (ev.type === 'DECLARE' || ev.type === 'UPDATE')) {
              newScopes.push({ id: ev.scopeId, variables: {}, active: true });
              scopeIndex = newScopes.length - 1;
            }

            if (scopeIndex !== -1) {
              const scope = { ...newScopes[scopeIndex] };
              scope.variables = { ...scope.variables };

              if (ev.type === 'DECLARE' || ev.type === 'UPDATE') {
                scope.variables[ev.name] = { value: ev.value, moved: ev.moved };
              } else if (ev.type === 'MOVE') {
                if (scope.variables[ev.name]) {
                  scope.variables[ev.name] = { ...scope.variables[ev.name], moved: true };
                }
              }
              newScopes[scopeIndex] = scope;
            }
          }

          return newScopes;
        });
      }
    }

    setIsRunning(false);
  };

  return (
    <div className="flex h-screen w-full bg-[#1e1e1e] text-white">
      <div className="flex flex-col flex-1 h-full">
        {/* Header */}
        <div className="h-12 bg-[#2d2d2d] border-b border-[#333] flex items-center px-4 justify-between">
          <div className="font-bold text-lg text-blue-400 flex items-center gap-2">
            <Activity size={18} />
            PyRust Visualizer
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setOutput([]); setScopes([]); }}
              className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-[#3e3e3e] text-gray-300 text-sm transition-colors"
            >
              <Eraser size={16} />
              Clear
            </button>
            <button
              onClick={handleRun}
              disabled={errors.length > 0 || isRunning}
              className={`flex items-center gap-2 px-4 py-1.5 rounded font-semibold text-sm transition-colors ${errors.length > 0 || isRunning
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-500 text-white shadow-lg'
                }`}
            >
              <Play size={16} />
              {isRunning ? 'Running...' : 'Run & Visualize'}
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Editor */}
          <div className="w-1/3 h-full border-r border-[#333]">
            <CodeEditor code={code} onChange={setCode} />
          </div>

          {/* Output */}
          <div className="w-1/3 h-full border-r border-[#333] flex flex-col">
            <div className="bg-[#252526] px-3 py-1 text-xs text-gray-400 font-bold border-b border-[#333]">OUTPUT</div>
            <Terminal
              output={output}
              status={errors.length === 0 ? "Ready" : "Error"}
              error={errors.length > 0 ? errors : null}
            />
          </div>

          {/* Visualizer */}
          <div className="w-1/3 h-full bg-[#1e1e1e] flex flex-col">
            <div className="bg-[#252526] px-3 py-1 text-xs text-gray-400 font-bold border-b border-[#333] flex justify-between">
              <span>MEMORY</span>
              {isRunning && <span className="text-green-500 animate-pulse">● Live</span>}
            </div>
            <MemoryVisualizer scopes={scopes} />
          </div>
        </div>

        {/* Status Bar */}
        <div className="h-6 bg-[#007acc] text-white text-xs flex items-center px-2 justify-between">
          <span>{errors.length === 0 ? "No Issues" : `${errors.length} Problems`}</span>
          <span>PyRust v0.1.0</span>
        </div>
      </div>
    </div>
  );
}

export default App;
