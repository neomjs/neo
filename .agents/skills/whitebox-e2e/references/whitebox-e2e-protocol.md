# Whitebox E2E Test Authoring Protocol

When tasked with creating new end-to-end tests for the Neo.mjs framework, you must follow the **Whitebox E2E** paradigm. Traditional "black box" DOM locator testing is brittle in Neo's highly virtualized worker environment.

## 1. The Pre-Requisite: Neural Link Exploration

**Before writing a single line of test code**, you MUST use the Neural Link to explore the application state live.
1. Use the `neural-link` skill to launch the application and connect to it mentally.
2. Use Neural Link tools (e.g. `get_component_tree`, `query_component`, `inspect_store`) to verify exactly how the components represent data and state in the App Worker.
3. Understand the difference between the visual DOM (what the user sees) and the logical component structure (what the `neuralLink` test fixture exposes).

*Do not guess the JSON structure of a component or a store. Read it live first.*

## 2. Test Suite Scaffolding

Whitebox E2E tests belong in `test/playwright/e2e/`.
Always use the custom `neuralLink` Playwright fixture provided by the Neo.mjs team.

**Host capability pre-flight:** consult `learn/agentos/process/SeatEvidenceCapabilities.md` before authoring/routing headed work (check `observedAt`; stale = `unknown`; records advisory, counter-receipts retire ceilings).

```javascript
import { test, expect } from '../../fixtures.mjs';

test.describe('Button Base Feature (Neural Link)', () => {
    test('Verify precise component state', async ({ page, neuralLink }) => {
        await page.goto('/examples/button/base/index.html');
        // Explicitly bind the bridge to the application namespace
        const nlApp = await neuralLink.connectToApp('Neo.examples.button.base');

        // ... assertions
    });
});
```

*Crucial Note: Tests must be executed using the specific E2E config:*
`npx playwright test test/playwright/e2e/<domain>/YourTest.spec.mjs -c test/playwright/playwright.config.e2e.mjs`

## 3. The Pattern: Playwright Interaction -> Neural Link Validation

Instead of querying DOM nodes for text content, the definitive Whitebox paradigm is:

1. **Interact Layout:** Use standard Playwright `page.locator()` to simulate gross user interactions (clicks, keyboard).
2. **Assert Engine Truth:** Use `nlApp.queryComponent()` to ask the *Component Instance* inside the remote App Worker what its state is.

```javascript
// 1. Visually identify and interact using Playwright
const rowComboBox = page.locator('.neo-combobox').filter({ hasText: 'Amount Rows' });
await rowComboBox.click();
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');

// 2. Validate Engine Memory using Neural Link SDK
const queryResult = await nlApp.queryComponent(
    { name: 'amountRows' },
    ['value']
);

// We verify the actual data object inside the App Worker, completely skipping DOM assertions!
expect(queryResult.properties.value.id).toBe("40000");
```

## 4. Comprehensive Example

Before authoring a new test, closely examine the following reference implementation which showcases deep state assertions, programmatic mutation, and DOM versus Worker Engine drift validation:
`test/playwright/e2e/rendering/ButtonBaseNL.spec.mjs`

## 5. Telemetry & RLAIF Integration

Tests utilizing the `neuralLink` fixture inherently generate rich user interaction trajectories. These paths are extracted as structured datasets to continuously train the Swarm's autonomous agents.
The backend daemon `ai/scripts/analyzeNlTelemetry.mjs` curates these logs from the local `memory-core.sqlite` to generate the "Golden Path" SFT/DPO datasets used in Local SLM fine-tuning pipelines.

## 5.1 Mid-Interaction Assertions (Motion & Consistency)

Final-order assertions are insufficient for drag-and-drop and animation surfaces — a drag can
land correctly while the motion layer misbehaves, or duplicate DOM nodes silently. For these
surfaces, pair the Playwright interaction with the Neural Link perception tools:

- **`observe_motion`** (start before `page.mouse.down()`): rect time-series of the affected
  components during the drag window — assert the mid-drag slot geometry, not just the end state.
- **`get_drag_trace`** (read after `mouse.up()`): the SortZone decision trace (targets, switches,
  scroll activations) — assert the logic layer matches the intended cadence.
- **`verify_component_consistency`** (after the drop): items/vdom/DOM three-surface diff —
  assert zero duplicates and aligned order across all three.

## 5.2 Delta-Stream Inspection (`logDeltaUpdates`)

Neural Link tools inspect *end-state*; some corruption classes live in the **delta stream** itself — a stray `moveNode`, an id-less `insertNode`, a wrong `index` — and still leave a consistent end-state behind. To see exactly what the engine applied, make the main-thread VDOM delta stream observable.

`Neo.config.logDeltaUpdates = true` causes `src/main/DeltaUpdates.mjs` to log every applied update to the page console:

```javascript
// emitted per applied update at the main-thread apply boundary (DeltaUpdates.mjs):
console.log('update ' + countUpdates, 'total deltas ', countDeltas, /* deep-cloned delta payload */)
```

The 4th argument is a **deep clone** (`Neo.clone(data, true)`) — a faithful snapshot of exactly the deltas applied, in order. Each delta carries the `vdom.Helper` grammar shape `{action, id, index, parentId, …}`.

**Whitebox pattern** — enable it inside `page.evaluate`, intercept `console.log`, and assert on the exact sequence:

```javascript
await page.evaluate(() => {
    Neo.config.logDeltaUpdates = true;
    window.__idlessInserts = 0;

    const orig = console.log.bind(console);
    console.log = (...args) => {
        if (typeof args[0] === 'string' && args[0].startsWith('update ')) {
            const data   = args[3],
                  deltas = Array.isArray(data) ? data : (data?.deltas || []);
            // keystone signature: an insertNode with no id
            window.__idlessInserts += deltas.filter(d => d.action === 'insertNode' && !d.id).length;
        }
        orig(...args);
    };
});

// ... drive the interaction via Playwright ...

const idless = await page.evaluate(() => window.__idlessInserts);
expect(idless, 'id-less insertNode deltas at the apply boundary').toBe(0);
```

This is the single best lever for VDOM/rendering divergences: a wrong delta sits in the stream even when every individual end-state surface looks internally consistent. See `test/playwright/e2e/grid/LockedDnDDuplication.spec.mjs` for a full multi-oracle net built on it.

## 6. Deep Dive Documentation
For the complete API of the `neuralLink` test SDK (`nlApp`) including simulating native VNode events, VDOM querying, and complex store inspection, you MUST reference the foundational guide:
`learn/guides/testing/WhiteboxE2E.md`
