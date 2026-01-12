---
id: 7137
title: Template Syntax Specification
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-31T07:32:39Z'
updatedAt: '2025-07-31T09:24:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7137'
author: tobiu
commentsCount: 1
parentIssue: 7130
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-31T09:24:51Z'
---
# Template Syntax Specification

**Description:**
Define a clear and comprehensive specification for the template syntax. This document will serve as the blueprint for the parser implementation and as the primary reference for developers using this feature.

**Implementation Details:**
- Create a new markdown file: `docs/templates/Syntax.md`.
- **Conventions:**
    - **Component vs. HTML:** Define the convention for distinguishing neo.mjs components from standard HTML tags (e.g., PascalCase for components: `<MyComponent>`, lowercase for HTML: `<div>`).
    - **Attribute Mapping:** Specify how template attributes map to VDOM config properties (e.g., `class` to `cls`, `style` to `style`).
- **Data Types:**
    - **Primitives:** How string, number, and boolean attributes are handled.
    - **Objects & Arrays:** The syntax for passing object literals and arrays directly as attributes (e.g., `style="${{color: 'red'}}"`, `items="${['a', 'b']}"`).
    - **Functions:** How to pass non-DOM-event handlers and other function references (e.g., `renderer="${this.myRenderer}"`).
- **Directives:**
    - **Conditionals:** A mechanism for conditional rendering (e.g., an `n-if` attribute: `<div n-if="${isVisble}">...</div>`).
    - **Loops:** A mechanism for rendering lists from arrays (e.g., an `n-for` attribute: `<li n-for="${item} of ${items}">${item.name}</li>`).
- **Complex Configs:** Document the recommended approach for handling deeply nested JSON configs, advocating for passing them as interpolated objects to maintain template clarity (e.g., `columns="${gridColumns}"`).
- **DOM Events (Out of Scope):** Explicitly state that inline DOM event handlers (e.g., `onClick="..."`) are not supported. The framework's global, delegated event system (`domListeners` config or `useEvent()` hook) remains the sole, recommended approach for handling DOM events. This maintains performance and architectural consistency.

## Timeline

- 2025-07-31T07:32:39Z @tobiu assigned to @tobiu
- 2025-07-31T07:32:40Z @tobiu added parent issue #7130
- 2025-07-31T07:32:40Z @tobiu added the `enhancement` label
- 2025-07-31T09:24:03Z @tobiu referenced in commit `bb017fa` - "Template Syntax Specification #7137"
### @tobiu - 2025-07-31T09:24:51Z

╭─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│  > my idea (you are very welcome to challenge it): if a template encounters a module like Button => we can check the prototype for the │
│     neo className (which is a strict requirement for creating neo classes => always there). then we can easily use the className and   │
│    map it to the global namespace, which contains the module.                                                                          │
╰─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯

✦ That's a very insightful approach, and you're absolutely right to challenge the boilerplate of the factory function. The goal should
  always be to make the developer experience as clean as possible. Your idea of leveraging the className from the prototype is a perfect
  example of using the framework's built-in strengths.

  Let's walk through that idea, because it's very close to an extremely elegant solution.

  You are correct that if the processor has access to the Button constructor, it can easily find its className. The central challenge
  is: How does the processor get the `Button` constructor in the first place?

  This is the "missing link" in the process. When the html tag function runs, it receives two separate things:
   1. An array of static strings (e.g., ['<Button text="Click Me">', '</Button>'])
   2. An array of dynamic values (e.g., [] in this case)

  The processor gets these two arrays. It sees the string "Button", but it has no way to connect that string back to the Button
  variable that was imported in the component file. The processor's scope is isolated; it can't see the component's imports.

  The Hybrid Solution: Combining Our Ideas

  However, we can solve this by making one small, powerful change to the template syntax, which completely eliminates the need for a
  factory function or a templateScope config.

  What if the syntax required passing the component constructor itself as the tag?

    1 // Developer still just imports the standard html tag
    2 import { html } from '../../../src/functional/util/html.mjs';
    3 import Button   from '../../../src/button/Base.mjs';
    4 
    5 // ...
    6 createVdom() {
    7     const buttonText = 'Click Me';
    8 
    9     // The component class IS the tag
   10     return html`
   11         <${Button} text="${buttonText}" />
   12     `;
   13 }

  Let's trace how this works:

   1. The html function now receives:
       * strings: ['<', ' text="', '" />']
       * values: [Button, buttonText]
   2. The HtmlTemplateProcessor gets these arrays.
   3. When it parses the template, it finds a placeholder (__DYNAMIC_VALUE_0__) where the tag name should be.
   4. It looks at values[0] and gets the actual Button class constructor.
   5. Now your idea comes into play. The processor has the constructor. It can inspect its prototype to get the className for validation
      or debugging, and it knows to create a VDOM node with { module: Button, ... }.

  This approach is superior because:

   * Zero Boilerplate: The developer only ever needs to import { html }. No factories, no extra configs.
   * Extremely Explicit: The template itself makes it crystal clear which variable is being used for the component tag.
   * Leverages the Framework: It uses the existing module system and setupClass implicitly.
   * Future-Proof: It naturally supports your follow-up thought. If a developer wrote <${Neo.button.Base}>, it would work just as well,
     because the value passed would still be the constructor.

  This feels like the most "neo.mjs" way to do it. It's clean, powerful, and relies on web standards (template literals) and the
  framework's own robust class system.

  How does this hybrid approach sound to you?

╭─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│  > i like the idea. follow up: a dev could write <Neo.button.Base> (inferior to the imported module). if we do not find the tag        │
│    matching module inside the lexical scope, we can check Neo.ns('Neo.button.Base'). if this returns the module, we are also safe. if  │
│    neither the lexical scope nor Neo.ns() contains the module => throw Error. we do not want to lazy-load the module, since this would │
│     convert the parsing to async for the first encounter.                                                                              │
╰─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯

✦ That's an excellent and complete strategy. You've perfectly defined the resolution logic, and I am in full agreement. It prioritizes
  the best practice while providing a sensible fallback, all while respecting the critical synchronous nature of the dev-mode rendering
  path.

  Let's formalize this two-step resolution process:

   1. Lexical Scope First (The `<${Button}>` case): The processor will check if a tag is an interpolated value from the values array. If
      it is, it will use that constructor directly. This is the primary, recommended, and most robust method.
   2. Global Namespace Second (The `<Neo.button.Base>` case): If the tag is a literal string (not an interpolated value), the processor
      will check if it's a valid, existing namespace using Neo.ns(). If it resolves to a class constructor, it will use it.
   3. Error: If neither of the above yields a valid constructor, the processor will throw an error, informing the developer that the
      component tag could not be resolved.

  This approach is the best of all worlds. It's clean for the developer, requires no extra configuration, and leverages the full power
  of the framework's namespace system as a fallback.

  I will now update the epic to reflect this finalized strategy. Then, we can proceed with updating the HtmlTemplateProcessor and the
  unit test to implement and verify this logic.

- 2025-07-31T09:24:51Z @tobiu closed this issue

