---
id: 6823
title: 'component.Base: vdom documentation'
state: CLOSED
labels:
  - documentation
  - enhancement
  - no auto close
  - ai
assignees:
  - neo-gpt
createdAt: '2025-06-17T05:26:32Z'
updatedAt: '2026-06-07T16:43:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6823'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-06-07T16:43:03Z'
---
# component.Base: vdom documentation

Some thoughts:

Via JSDoc comments
```javascript
/**
 * @typedef {Object} ComponentReferenceConfig
 * @property {string} componentId The ID of the component instance this VDom node refers to. This node is a placeholder and does not directly render DOM elements for its own properties (e.g., no `tag`, `style`, `cn`).
 * @property {string} [id] The VDom ID of the component's root VNode. Typically matches `componentId` or `component.vdom.id`.
 * @property {boolean} [removeDom=false] If true, indicates this component reference should be removed from the DOM.
 */

/**
 * @typedef {Object | ComponentReferenceConfig} VDomNodeConfig
 * @property {string} [tag='div'] The HTML tag name for the element (e.g., 'div', 'span', 'button'). Defaults to 'div' for non-text nodes.
 * @property {string} [id] A unique identifier for the VNode. If omitted, one will be generated.
 * @property {string|string[]} [cls] CSS class names to apply to the element. Can be a space-separated string or an array of strings.
 * @property {Object|string} [style] Inline CSS styles. Can be an object of key-value pairs or a CSS string.
 * @property {string} [html] **(Exclusive with `text` and `cn`)** Raw HTML content for the element's `innerHTML`. Takes precedence over `text` and `cn`. Use with caution for XSS.
 * @property {string} [text] **(Exclusive with `html` and `cn`)** Plain text content for the element. This content will be HTML-escaped if used for `innerHTML`. Has precedence over `cn` if `html` is not present.
 * @property {VDomNodeConfig[]} [cn] **(Exclusive with `html` and `text`)** An array of child `VDomNodeConfig` objects representing nested elements. Used if neither `html` nor `text` are provided.
 * @property {'text'} [vtype] 
 * @property {boolean} [static=false] If true, this node and its children will be excluded from delta updates (optimization).
 * @property {boolean} [removeDom=false] If true, indicates this VDom node should be removed from the DOM.
 * @property {Object.<string, string|number|boolean>} [data] An object of key-value pairs to be transformed into `data-*` attributes.
 * @property {string} [tabIndex] HTML tabindex attribute.
 * @property {string} [role] ARIA role attribute.
 * @property {boolean} [disabled] HTML disabled attribute.
 * // Add other common HTML attributes as needed.
 */
```


TS Interface:

```typescript
// src/types/vdom.d.ts

/**
 * Represents a VDom configuration object for a component reference.
 * These nodes are placeholders and do not directly render DOM elements for their own properties.
 */
export interface ComponentReferenceConfig {
    componentId: string;
    id?: string; // Typically matches componentId or component.vdom.id
    removeDom?: boolean;
}

/**
 * Represents a VDom node configuration. This can be a regular DOM element
 * configuration or a reference to another component.
 */
export interface VDomNodeConfig {
    tag?: string; // e.g., 'div', 'span', 'button'
    id?: string;
    cls?: string | string[];
    style?: Record<string, string | number> | string;
    html?: string; // Exclusive with 'text' and 'cn'
    text?: string; // Exclusive with 'html' and 'cn'
    cn?: VDomNodeConfig[]; // Array of child VDomNodeConfig objects
    vtype?: 'text';
    static?: boolean;
    removeDom?: boolean;
    data?: Record<string, string | number | boolean>;
    tabIndex?: string | number;
    role?: string;
    disabled?: boolean;
    // ... other HTML attributes ...

    // This allows a VDomNodeConfig to also be a ComponentReferenceConfig
    // It's conceptually an intersection type in TS, though JSDoc handles it as `|`
    // To be strict, TS would use `VDomNodeConfig | ComponentReferenceConfig`
    // but within the interface, you can also express allowed arbitrary properties:
    [key: string]: any; // Allows other arbitrary properties, if needed for flexibility
}
```

## Timeline

- 2025-06-17T05:26:34Z @tobiu added the `enhancement` label
- 2025-06-30T20:50:15Z @tobiu added the `no auto close` label
- 2026-06-07T14:44:02Z @neo-gpt added the `ai` label
- 2026-06-07T14:44:02Z @neo-gpt added the `documentation` label
### @neo-gpt - 2026-06-07T14:44:12Z

**Input from GPT-5.5 (Codex Desktop):**

> ● Triaged per `ticket-triage` skill.
> 
> Applied labels: `documentation`, `ai`. Existing labels preserved: `enhancement`, `no auto close`.
> 
> [ARCH_ALIGNMENT]
> 
> Retrospective challenge verdict: pass.
> 
> - Premise: current `src/component/Base.mjs` still documents `_vdom` / `vdom` as generic `Object`, while the existing VDom guides already describe a richer node shape. This ticket's documentation gap remains real.
> - Prescription: scoped JSDoc/documentation is the right substrate; no runtime behavior change is implied.
> - Substrate: `src/component/Base.mjs` is the source-adjacent API surface for component `vdom`; the existing `learn/guides/uibuildingblocks/WorkingWithVDom.md` guide remains complementary rather than a duplicate close target.
> - Consumer: human developers and KB extraction benefit from a precise typedef attached near the class surface.
> - Service boundary: no cross-service or cloud-deployment behavior boundary is touched by the triage shape.
> - Decision-record impact: none found.
> 
> Assignment disposition: proceeding to `ticket-intake` for a narrow docs/JSDoc implementation pass.

- 2026-06-07T14:45:41Z @neo-gpt assigned to @neo-gpt
- 2026-06-07T14:49:29Z @neo-gpt cross-referenced by PR #12689
- 2026-06-07T16:43:03Z @tobiu closed this issue
- 2026-06-07T16:43:03Z @tobiu referenced in commit `441cc73` - "docs(component): document vdom node config shape (#6823) (#12689)"

