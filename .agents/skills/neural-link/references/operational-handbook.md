# Neural Link Operational Handbook for Agents

Your task is to effectively query and mutate a running Neo.mjs application using the Neural Link MCP toolset. Neo.mjs runs applications in a separate worker thread, utilizing a custom Virtual DOM that maps to the physical DOM. 

**DO NOT GUESS.** Without specific chains of verification, you will inject corrupted instructions or patch incorrect classes. You MUST follow these sequences.

## 1. The Discovery Chain (UI Inspection)

When asked to locate or verify an element on the screen:
1. **Fuzzy Search First:** Use `query_component` with a selector like `{ntype: 'button', text: 'Submit'}` to locate target Candidate Component IDs. DO NOT guess the ID.
2. **Visual Verification:** Call `highlight_component` on the ID. This confirms you targeted the right element on the physical screen.
3. **Hierarchy Check:** If you need the layout structure surrounding the button, use `get_component_tree` with the component ID as `rootId`. Limit the `depth` to `1` or `2` initially to avoid overwhelming your context window.
4. **Style Verification:** To debug CSS, use `query_vdom` on the component ID first to target specific internal VNodes, then use `get_computed_styles` to extract the real rendered CSS properties.

## 2. The Data Chain (State Inspection)

When asked to investigate data, grids, or models:
1. **Locate the Store:** Use `find_instances({selector: {className: 'Neo.data.Store'}})` to identify active stores mapping to your semantic target.
2. **Inspect the Store:** Call `inspect_store` using the exact `storeId` retrieved. Use `limit: 5` initially to check structure before dumping large JSON collections into context.
3. **Verify App State:** If debugging a bug outside of stores, query custom state providers via `find_instances` mapped to `Neo.state.Provider`, then call `inspect_state_provider`.

## 3. The Strict Patching Protocol (Open Heart Surgery)

When asked to fix or adjust application logic running live inside the browser:
1. **Architectural Read:** Call `inspect_class` with `detail: 'compact'` on the target component class (e.g., `MyApp.view.main.MainContainer`). This returns the "Rich Blueprint" (mixins, active configs, and method names) to establish ground truth.
2. **Source Verification (MANDATORY):** You are **FORBIDDEN** from invoking `patch_code` without first invoking `get_method_source`. You MUST retrieve the exact live string representation of the target function first to guarantee safe diffing.
3. **Execute the Patch:** Construct your drop-in replacement payload and submit it via `patch_code`. (Note: this tool will automatically fail if the target app hasn't set `enableHotPatching = true`).

## 4. Interaction Loop (End-to-End Simulation)

When verifying a fix or reproducing a bug interactively:
1. **Fire the Event:** Use `simulate_event` on the validated Component ID.
2. **Close the Loop:** Immediately trigger `get_console_logs` to capture downstream exceptions, warnings, or debug printouts triggered by your simulation.

## 5. Recovering from Page Reloads (Session Invalidation)
Every time the connected Neo.mjs application page reloads, the main App Worker thread is destroyed and completely recreated. 

**This completely invalidates your current `sessionId`.**

1. If you trigger `reload_page` (or any external process refreshes the browser), all subsequent tool calls using your cached `sessionId` will fail.
2. You **MUST** run `healthcheck` or `get_worker_topology` to discover the newly generated App Worker `sessionId`.
3. All internal Object IDs (Component IDs, Store IDs, etc.) are wiped alongside the Worker. You **MUST** flush your cache, target the new `sessionId`, and explicitly restart at Phase 1 (The Discovery Chain). Do not attempt to reuse old target IDs across worker sessions.
