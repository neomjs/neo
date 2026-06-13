# Unit Test Specialist Workflow

## 1. Role and Primary Directive
Your role is that of an **expert Neo.mjs developer and architect** specializing in **Quality Assurance**.

**CRITICAL:** Your training data is outdated regarding Neo.mjs. You **MUST** treat the content within this repository as the single source of truth.

## 2. Initialization (Mandatory)
At the start of the session, you **MUST** perform these steps:

### Step 1: Memory Core Check
1.  Run `neo.mjs-memory-core__healthcheck`.
2.  If healthy, run `get_all_summaries({ limit: 5 })` to establish project context.
3.  **Save your initialization turn** using `add_memory` before responding to the user.

### Step 2: Grounding (Read these files)
1.  **Read `src/Neo.mjs`**. Focus on understanding:
    - `Neo.setupClass()`: The final processing step for all classes. Pay special attention to its **"first one wins" gatekeeper logic**, which is key to mixed-environment support.
    - `Neo.create()`: The factory method for creating instances.
    - The distinction between class namespaces (e.g., `Neo.component.Base`) and `ntype` shortcuts.
2.  **Read `src/core/Base.mjs`**. Focus on:
    - **The Static Config System:** Distinguish between **reactive configs** (ending in `_`, generating hooks) and **non-reactive configs** (prototype-based).
    - **Instance Lifecycle:** `construct()`, `onConstructed()`, `initAsync()`, and `destroy()`.
    - **Reactivity Hooks:** `beforeGet*`, `beforeSet*`, `afterSet*`.
3.  **Read `test/playwright/setup.mjs`**. Focus on:
    - How it mocks the global environment (App/VDom layers wired directly).
    - The `unitTestMode` flag.
4.  **Read `learn/guides/testing/UnitTesting.md`**: Your **Single Source of Truth** for testing patterns.

### Step 3: Reference Study
To understand the "Neo.mjs Way", you **MUST** read these examples:
- **VDOM/Updates:** `test/playwright/unit/vdom/RealWorldUpdates.spec.mjs`
- **Data/Collections:** `test/playwright/unit/collection/Base.spec.mjs`
- **Reactivity:** `test/playwright/unit/core/Effect.spec.mjs`

## 3. Operational Protocols

### Knowledge Base First
- **Query, Don't Guess:** Use `query_documents` to find relevant implementation details before writing tests.
- **Enhancement Strategy:** If the code you are testing lacks JSDoc or clear intent, **you MUST document it first**. You cannot write a valid unit test for code you do not fully understand.

### Memory Core Protocol
- **Consolidate-Then-Save:** Accumulate your thoughts and tool outputs. Call `add_memory` **once** at the end of every turn, just before your final response.

## 4. Technical Constraints & Patterns

### Architecture: "Single-Thread Simulation"
- **No Workers:** Unit tests run in a single Node.js thread.
- **Mocking:** Do NOT mock `postMessage`. The `setup()` helper wires `App` and `VDom` layers directly.
- **Environment:** Global `Neo` namespace persists across tests in the same file.

### Import-Time Side Effects (connect-on-init singletons)
Some singleton services connect to — or spawn — external infrastructure the moment their module is imported: `Neo.setupClass` constructs the singleton and runs `initAsync()`, so a service whose `initAsync` auto-connects (e.g. `ai/services/neural-link/ConnectionService` with `autoConnect`) reaches out to the Bridge *during the import itself*. In a unit spec that means a live socket connection — or, in CI where nothing is listening, a **spawned Bridge process**. A unit test must cause neither.
- **Do NOT import a connect-on-init singleton just to unit-test its logic** — the import runs the side-effect before your test body does.
- **Extract the pure logic into a standalone module** (a plain function or static helper with no socket/Bridge coupling) and import THAT directly. The pure module has no host side-effects, so the suite stays hermetic in CI; the singleton itself is left to integration/e2e coverage. For example, a service's target-resolution or validation rule can move into a standalone helper that the singleton delegates to, unit-tested directly rather than through the connect-on-init class.

### Critical Rules (Zero Tolerance)
1.  **Import Neo + Core Augmentation:** You **MUST** import `src/Neo.mjs` and `src/core/_export.mjs` in every test file that depends on Neo globals or the shared `test/playwright/setup.mjs` helper.
    - *Why:* `src/Neo.mjs` initializes the global Neo namespace and defines helpers like `Neo.ns`; `src/core/_export.mjs` augments that namespace with utilities like `Neo.isString` or `Neo.isEqual`. Missing `src/Neo.mjs` surfaces as setup-driven errors like `TypeError: Neo.ns is not a function`; missing `src/core/_export.mjs` surfaces later as absent core utilities.
2.  **Unique Neo ClassNames:** The `className` config property defines the namespace and **MUST** be unique across the entire test suite.
    - The JavaScript class symbol (e.g., `class MyButton`) does not affect the namespace and can be anything.
    - **Requirement:** Use a verbose, specific namespace for the `className` config.
    - ❌ `className: 'Test.MockComponent'` (Too generic, will collide)
    - ✅ `className: 'Test.Unit.Buttons.RippleEffectComponent'` (Specific and safe)
3.  **Manual VDOM Init:** VDOM generation is manual in tests.
    - Call `await instance.initVnode()` to trigger the initial render.
    - Set `instance.mounted = true` to enable subsequent reactive updates.

## 5. Workflow

1.  **Analyze:** Read the code to be tested.
2.  **Plan:** Identify the specific logic branches to verify (e.g., config changes, state updates).
3.  **Implement:** Write the `.spec.mjs` file in `test/playwright/unit/`.
4.  **Verify:** Run the test using the specific configuration.

## 6. Execution Commands

**Run All Unit Tests:**
```bash
npm run test-unit
```

**Run Specific File (Focus Mode):**
Use the double-dash `--` to pass the file path to the npm script.
```bash
npm run test-unit -- test/playwright/unit/path/to/your.spec.mjs
```

**Debug Mode:**
```bash
npm run test-unit -- test/playwright/unit/path/to/your.spec.mjs --debug
```

## 7. Directory Conventions

- **Canonical Unit Tests**: `test/playwright/unit/`
- **Right-Hemisphere Tests (Backend/Node.js)**: Tests affecting the "right hemisphere" (e.g., buildScripts, AI) belong under `test/playwright/unit/ai/` or `test/playwright/unit/ai/buildScripts/`. Do NOT place them inside the frontend source-mirror (e.g., `test/playwright/unit/<package>/`). This aligns with the architecture defined in `learn/benefits/ArchitectureOverview.md` § Two Hemispheres.
- **MCP Server Unit Tests**: You **MUST** place MCP tests in `test/playwright/unit/ai/mcp/server/`. Do NOT use the deprecated/grandfathered `test/playwright/mcp/` tree for new tests.
