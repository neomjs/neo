## Introduction

Neo.mjs was the very first frontend framework, which enabled full support for a zero builds instant development mode,
while sticking to the latest ECMAScript features (e.g. the ES6 class system, modules and dynamic imports).

Developers can save massive amounts of time when creating and debugging their apps, but at some point apps want to be
deployed. To do this right, it is crucial to have an overview of the available environments.

## Zero builds development mode

JavaScript was originally conceived as the sole programming language capable of running directly within web browsers,
defining the interactive web experience. By around the year 2012, JS evolved significantly faster outside the Browser in
environments like Node.js, free from the constraints of browser release cycles and offering access to a broader set of APIs.
Developers, naturally wanting to use the latest language features, and especially Angular and React, picked up on this,
moving the entire frontend development into Node.js. This way, the new features were available, but at the significant
cost of introducing a mandatory, and often complex, build step, since developers now wrote code which Browsers can not
understand.

Over time, an entire ecosystem evolved around this paradigm. Think of hot module replacements, the webpack-dev-server,
Vite, or Bun. While builds have become reasonably fast, developers receive transpiled and bundled code in the Browsers,
which can introduce debugging challenges and requires source-maps to even have a chance of debugging.

What most companies and developers have completely missed is the fact that Browser Vendors have done a great job at
catching up with modern ECMAScript features (like classes, dynamic imports, and native browser module support).
At this point in time, we can create highly modern and performant code directly inside Browsers again.

Especially when it comes to debugging, the advantages are huge: No source-maps are needed, and developers can work with
the real code, even inside the dev-tools console.

Neo.mjs picks up on this pattern, and even supports the full creation of apps directly inside the console. Developers can
easily grab existing Component instances inside the console, inspect and change reactive configs on the fly, and watch
the UI update instantly – even within a multi-window scope, or creating entirely new components directly.

This is possible because Neo.mjs is ***100% based on web standards***. There's no hidden magic or proprietary syntax;
you're working directly with what the browser understands. This commitment to standards provides a level of transparency
and future-proofing that's hard to match.

Sticking exclusively to the builds dev-mode paradigm means relying on an abstraction layer that moves away from the
browser's native capabilities. History has shown the advantages of embracing the web platform directly, as seen with the
evolution from plugin-based solutions to native browser features. Neo.mjs champions this direct, standards-aligned
approach, providing a future-proof development experience.

## dist/esm

todo

## dist/production

todo

## dist/development

todo

## Environment Combinations

todo
