# Unit Test Specialist Workflow

## 1. Review-Only Boundary

During a PR review, `pr-review` owns execution-evidence allocation. Merely inspecting a diff that contains, adds, or moves unit tests—or checking their placement/idioms—does **not** activate this author/executor workflow.

- Green required CI at the exact head owns routine unit/integration execution; do not rerun it for duplicate evidence.
- `NEO_TEST_SKIP_CI` coverage is excluded from that claim. The author supplies an exact-head non-CI receipt; the reviewer validates or challenges it and runs locally only for a named falsifier when their environment has the capability.
- Initialization, grounding, implementation, and execution below apply only when writing, modifying, fixing, or explicitly running unit tests.

**Review-only fixture:** A PR adds `test/playwright/unit/ai/example.spec.mjs`, exact-head unit CI is green, and no guarded behavior is claimed. Inspect its canonical path and Neo test idioms; do not initialize Memory Core, load authoring examples, or rerun the spec.

## 2. Author/Executor Initialization (Mandatory)

After this workflow is activated:

1. Run the Memory Core healthcheck and `get_all_summaries({limit: 5})`; save the initialization turn with `add_memory`.
2. Read the repository sources of truth:
   - `src/Neo.mjs`: `setupClass()`, `create()`, namespaces, and `ntype`.
   - `src/core/Base.mjs`: static/reactive configs, lifecycle, and config hooks.
   - `test/playwright/setup.mjs`: direct App/VDom wiring and `unitTestMode`.
   - `learn/guides/testing/UnitTesting.md`: canonical testing patterns.
3. Read the closest examples: `vdom/RealWorldUpdates.spec.mjs`, `collection/Base.spec.mjs`, and `core/Effect.spec.mjs` under `test/playwright/unit/`.

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
