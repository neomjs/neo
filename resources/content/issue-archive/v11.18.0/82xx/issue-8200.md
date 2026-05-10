---
id: 8200
title: '[Neural Link] Implement toJSON Serialization Protocol'
state: CLOSED
labels:
  - epic
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-29T07:10:42Z'
updatedAt: '2026-01-05T16:05:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8200'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - '[x] 8224 [Neural Link] Implement toJSON in core.Base'
  - '[x] 8226 [Neural Link] Implement toJSON in component.Abstract'
  - '[x] 8225 [Neural Link] Implement toJSON in component.Base'
  - '[x] 8227 [Neural Link] Implement toJSON in button.Base'
  - '[x] 8228 [Neural Link] Implement toJSON in container.Base'
  - '[x] 8232 [Neural Link] Implement toJSON in state.Provider'
  - '[x] 8233 [Neural Link] Implement toJSON in layout.Base'
  - '[x] 8234 [Neural Link] Implement toJSON in layout.Flexbox'
  - '[x] 8235 [Neural Link] Implement toJSON in layout.Card'
  - '[x] 8236 [Neural Link] Implement toJSON in layout.Form'
  - '[x] 8237 [Neural Link] Implement toJSON in layout.Cube'
  - '[x] 8238 [Neural Link] Implement toJSON in collection.Base'
  - '[x] 8239 [Neural Link] Implement toJSON in collection.Filter'
  - '[x] 8240 [Neural Link] Implement toJSON in collection.Sorter'
  - '[x] 8241 [Neural Link] Implement toJSON in data.Model'
  - '[x] 8242 [Neural Link] Implement toJSON in data.Store'
  - '[x] 8243 [Neural Link] Implement toJSON in grid.column.Base'
  - '[x] 8244 [Neural Link] Implement toJSON in grid.column subclasses'
  - '[x] 8245 [Neural Link] Implement toJSON in grid.column.Currency'
  - '[x] 8246 [Neural Link] Implement toJSON in grid.column.AnimatedChange'
  - '[x] 8247 [Neural Link] Implement toJSON in grid.column.AnimatedCurrency'
  - '[x] 8248 [Neural Link] Implement toJSON in grid.column.Progress'
  - '[x] 8249 [Neural Link] Implement toJSON in grid.Container'
  - '[x] 8251 [Neural Link] Implement toJSON in toolbar.Base'
  - '[x] 8252 [Neural Link] Implement toJSON in grid.header.Toolbar'
  - '[x] 8253 [Neural Link] Implement toJSON in grid.ScrollManager'
  - '[x] 8254 [Neural Link] Implement toJSON in grid.header.Button'
  - '[x] 8255 [Neural Link] Implement toJSON in grid.Body'
  - '[x] 8256 [Neural Link] Implement toJSON in component.Base (add role)'
  - '[x] 8257 [Neural Link] Implement toJSON in grid.Container (add body, headerToolbar, scrollManager)'
  - '[x] 8258 [Neural Link] Implement toJSON in container.Base items'
  - '[x] 8259 [Neural Link] Implement toJSON in selection.Model'
  - '[x] 8260 [Neural Link] Implement toJSON in selection.DateSelectorModel'
  - '[x] 8261 [Neural Link] Implement toJSON in selection.GalleryModel'
  - '[x] 8262 [Neural Link] Implement toJSON in selection.HelixModel'
  - '[x] 8263 [Neural Link] Implement toJSON in selection.grid.BaseModel'
  - '[x] 8264 [Neural Link] Implement toJSON in selection.grid.CellColumnModel'
  - '[x] 8265 [Neural Link] Implement toJSON in selection.grid.CellColumnRowModel'
  - '[x] 8266 [Neural Link] Implement toJSON in selection.table.CellColumnModel'
  - '[x] 8267 [Neural Link] Implement toJSON in selection.table.CellRowModel'
  - '[x] 8268 [Neural Link] Implement toJSON in selection.table.CellColumnRowModel'
  - '[x] 8269 [Neural Link] Implement toJSON in manager.DragCoordinator'
  - '[x] 8270 [Neural Link] Implement toJSON in manager.Window'
  - '[x] 8275 [Neural Link] Export controller in component.Base.toJSON'
  - '[x] 8276 [Neural Link] Implement toJSON in core.Observable'
  - '[x] 8277 [Neural Link] Sanitize fields in data.Model.toJSON'
  - '[x] 8289 [Neural Link] Implement toJSON in form.field.Base'
  - '[x] 8290 [Neural Link] Implement toJSON in form.field.Text'
  - '[x] 8291 [Neural Link] Implement toJSON in form.field.Number'
  - '[x] 8292 [Neural Link] Implement toJSON in form.field.CheckBox'
  - '[x] 8293 [Neural Link] Implement toJSON in form.field.Radio'
  - '[x] 8294 [Neural Link] Implement toJSON in form.field.Date'
  - '[x] 8295 [Neural Link] Implement toJSON in form.field.trigger.Base'
  - '[x] 8296 [Neural Link] Implement toJSON in form.Container'
  - '[x] 8297 [Neural Link] Implement toJSON in component.Base (add keys)'
  - '[x] 8298 [Neural Link] Implement toJSON in form.field.Picker'
  - '[x] 8299 [Neural Link] Fix missing align config in component.Base.toJSON'
  - '[x] 8300 [Neural Link] Implement toJSON in form.field.trigger.SpinUpDown'
  - '[x] 8301 [Neural Link] Implement toJSON in util.KeyNavigation'
  - '[x] 8302 [Neural Link] Enhance core.Base.serializeConfig to handle Neo Instances'
  - '[x] 8303 [Neural Link] Implement toJSON for AmChart and Monaco'
  - '[x] 8304 [Neural Link] Deep Value Collection for form.Container.toJSON'
  - '[x] 8335 Fix toJSON mixin shadowing and implement dynamic mixin serialization'
subIssuesCompleted: 63
subIssuesTotal: 63
blockedBy: []
blocking: []
closedAt: '2026-01-05T16:05:17Z'
---
# [Neural Link] Implement toJSON Serialization Protocol

**Objective:**
Standardize how Neo.mjs instances are serialized for AI inspection (Neural Link). Currently, the Neural Link Client manually picks properties, which is brittle and unscalable. We will implement a `toJSON()` method protocol across the framework.

**Core Concept:**
Every class decides its own JSON representation. `JSON.stringify(instance)` automatically calls `toJSON()`.

**Plan:**
1.  **Phase 1: Foundation (`core.Base`, `component.Base`)**
    *   Implement `toJSON()` in `core.Base`: Export `id`, `className`, `ntype`.
    *   Implement `toJSON()` in `component.Base`: Export key layout/visibility props (`width`, `height`, `hidden`, `style`, `disabled`).
    *   **Optimization:** Ensure `toJSON` is non-recursive by default for complex object references to prevent circular dependency crashes and performance bottlenecks.

2.  **Phase 2: Common Widgets**
    *   Implement `toJSON()` for high-value components: `Button` (`text`, `iconCls`), `Label` (`text`), `Container` (`layout`).

3.  **Phase 3: Data & State**
    *   Implement `toJSON()` for `data.Model` (already exists? verify/standardize).
    *   Implement `toJSON()` for `data.Store` (summary vs full dump).

4.  **Phase 4: Client Integration**
    *   Update `NeuralLink_ComponentService` (and others) to simply call `instance.toJSON()` instead of manually constructing objects.

**Discussion Point:**
*   **Tree vs. Detail:** `getComponentTree` might need a "lightweight" serialization (just ID/ntype) vs `getComponentProperty` or `queryComponent` returning the "full" `toJSON`. We might need `toJSON(detailLevel)` or separate methods. For now, `toJSON` should be the "Detail View".

**Value:**
*   **Robustness:** No more `Client.mjs` updates when a component adds a new config.
*   **Standardization:** Uses native JS patterns.
*   **Scalability:** Distributes the maintenance load to component authors.

## Timeline

- 2025-12-29T07:10:43Z @tobiu added the `epic` label
- 2025-12-29T07:10:43Z @tobiu added the `ai` label
- 2025-12-29T07:10:44Z @tobiu added the `architecture` label
- 2025-12-29T07:11:00Z @tobiu assigned to @tobiu
- 2025-12-31T12:42:35Z @tobiu added sub-issue #8224
- 2025-12-31T12:46:10Z @tobiu added sub-issue #8226
- 2025-12-31T13:23:54Z @tobiu added sub-issue #8225
- 2025-12-31T13:30:14Z @tobiu added sub-issue #8227
- 2025-12-31T13:45:42Z @tobiu added sub-issue #8228
- 2025-12-31T15:08:29Z @tobiu added sub-issue #8232
- 2025-12-31T15:11:53Z @tobiu referenced in commit `665b841` - "docs(issue): Update ticket state for #8200 and #8232"
- 2025-12-31T15:14:57Z @tobiu added sub-issue #8233
- 2025-12-31T15:18:54Z @tobiu added sub-issue #8234
- 2025-12-31T15:22:13Z @tobiu added sub-issue #8235
- 2025-12-31T15:39:14Z @tobiu added sub-issue #8236
- 2025-12-31T15:42:48Z @tobiu added sub-issue #8237
- 2025-12-31T15:50:25Z @tobiu added sub-issue #8238
- 2025-12-31T15:50:43Z @tobiu added sub-issue #8239
- 2025-12-31T15:50:55Z @tobiu added sub-issue #8240
- 2025-12-31T16:01:48Z @tobiu added sub-issue #8241
- 2025-12-31T16:02:01Z @tobiu added sub-issue #8242
- 2025-12-31T16:33:16Z @tobiu referenced in commit `3aa70f1` - "#8200 method order, this => me where applicable"
- 2026-01-01T02:30:37Z @tobiu added sub-issue #8243
- 2026-01-01T02:36:38Z @tobiu added sub-issue #8244
- 2026-01-01T02:56:55Z @tobiu added sub-issue #8245
- 2026-01-01T02:56:58Z @tobiu added sub-issue #8246
- 2026-01-01T02:57:01Z @tobiu added sub-issue #8247
- 2026-01-01T02:57:04Z @tobiu added sub-issue #8248
- 2026-01-01T03:17:06Z @tobiu added sub-issue #8249
- 2026-01-01T15:14:50Z @tobiu added sub-issue #8251
- 2026-01-01T15:24:35Z @tobiu added sub-issue #8252
- 2026-01-01T15:26:57Z @tobiu added sub-issue #8253
- 2026-01-01T15:34:21Z @tobiu added sub-issue #8254
- 2026-01-01T15:36:43Z @tobiu added sub-issue #8255
- 2026-01-01T15:40:13Z @tobiu added sub-issue #8256
- 2026-01-01T15:43:34Z @tobiu added sub-issue #8257
- 2026-01-01T16:26:21Z @tobiu added sub-issue #8258
- 2026-01-01T16:47:55Z @tobiu cross-referenced by #8259
- 2026-01-01T16:49:39Z @tobiu cross-referenced by #8260
- 2026-01-01T16:49:41Z @tobiu cross-referenced by #8261
- 2026-01-01T16:49:44Z @tobiu cross-referenced by #8262
- 2026-01-01T16:52:07Z @tobiu added sub-issue #8259
- 2026-01-01T16:52:50Z @tobiu added sub-issue #8260
- 2026-01-01T16:53:11Z @tobiu added sub-issue #8261
- 2026-01-01T16:53:31Z @tobiu added sub-issue #8262
- 2026-01-01T16:53:42Z @tobiu cross-referenced by #8263
- 2026-01-01T16:56:17Z @tobiu added sub-issue #8263
- 2026-01-01T16:56:30Z @tobiu cross-referenced by #8264
- 2026-01-01T16:56:34Z @tobiu cross-referenced by #8265
- 2026-01-01T16:57:27Z @tobiu added sub-issue #8264

