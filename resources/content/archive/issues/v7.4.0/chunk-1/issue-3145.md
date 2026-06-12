---
id: 3145
title: Overhaul the Neo.mjs roadmap
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - stale
assignees: []
createdAt: '2022-06-09T23:21:00Z'
updatedAt: '2024-09-15T02:35:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3145'
author: davhm
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-15T02:35:49Z'
---
# Overhaul the Neo.mjs roadmap

Starting recently, I am available and highly motivated to consistently contribute to the Neo.mjs project for the long term. However, to maximize my own & other contributors' impact, I find it necessary we overhaul the roadmap completely. 

Roughly speaking, I suggest the following steps as an approach:

1. Brainstorming and gathering input (e.g. via multiple-choice surveys) from the developer community on what features, improvements or resources would add the most value to neo.mjs
2. Capture high-level ideas & input into a topic-backlog of some sort, ideally using GitHub's projects feature
	- No breaking down topics allowed; keep it low-resolution!
3. Very roughly estimating value & effort for each topic using output of previous steps
4. Prioritizing topics according to the quotient: `value / effort`
	- Quick wins > huge features 🚄
	- Simple heuristic to avoid 🧠analysis-paralysis💀 and get some 🏃momentum🏋️ going!
5. Pragmatically sorting topics into "active", "short-term", "long-term" and "someday" buckets, with some kind of work-in-progress limit for "active" and "short-term" to maximize focus and completion

That's it - a basic agile approach. To get you curious and inspired, you can find a brain-dump just below 📦 where I've grouped and structured the ideas I and others have had and discussed recently. Please use this a jumping off board and add any ideas of your own as a reply! (@dinkh, @juanmendes, @krytechs, @luisaceituno, @arasch13, @lindaguen, @nichmontvit, @gufah. @chelfried. @ademten7)

---

## Some roadmap ideas - grouped by area

### Improving Developer Experience
_Make it as easy and pleasant as possible to develop `neo.mjs` apps_
- Create type definitions for neo.mjs core as Typescript d.ts files
	- Identify packages & modules to typify first
	- possible 1st goal: can be [consumed in comments](https://goulet.dev/posts/how-to-write-ts-interfaces-in-jsdoc/) instead of using JSDoc
	- longterm: possibility to develop neo-apps fully in Typescript - with a file-watching transpiler...
		- ...with TS source maps in `dev` mode; extends already present SCSS-watcher
		- ...without source maps and optimized & minified bundles for `prod` mode
	- ...	
- Make app-level styling independent of theming possibilites for component-library
	- Move app stylesheets into `app/`  instead of duplicating folder structure in `resources/` where the themes live (🙌 @dinkh)
	- ...
- CLI-tool (suggested name: `dozer`.. get the reference?) for generating & scaffolding common files (Container, Component, Controller, Store...)
	- aim for sensible default which minimizes manual steps to add module (e.g. no need for file CRUD needed, comment adjustments, manual import statements)
	- minimum viable tool; further iterations can add configurability
- Expansion of emmet-like shorthand into `vdom: {}` JS objects instead of HTML markup (👀@juanmendes😉)
- Improve auto-import possibilities, e.g. via:
	- Use longer - but clearer - module names (e.g. `TableContainerBase.mjs` instead of 50+ different `Base.mjs` files)

### Communications strategy & Learning section

_Write clear and focused guides for neo concepts and common use cases **with no discussion of implementation details** (@tobiu 👀😅 )_
- Getting started / Elevator pitch
- Core concepts
	- Worker paradigm
		- AppWorker
		- VDomWorker
		- DataWorker
		- ...
	- VDom and ComponentTree as mutable JS objects
		- How these are transformed into a DOM
		- How to react to DOM events and user inputs
		- ...
	- Class-config system
	- ...
- "Getting started / Follow the white rabbit" - a common thread "story" with consistent minimal examples for core concepts
	- Inspired by / similar to ng-tour-of-heroes
		- Build a simple container layout for the app
		- Populate this layout with component-library
		- Build a simple custom component
		- Adding the custom component to the app
	- After completion, reader can go slightly beyond hello-world	
- Technical Guides
	- SharedWorker setup for multi-window
	- Predictive fetching with ServiceWorkers
	- Class-config system in depth
	    - internal `_config` vs `config`
		- `Neo.construct(myThing)` vs. `new myThing()`
	- Worker-friendly events
- 
- ....

### Improving Contributor Experience
_Make it simpler and more accesible to contribute to the neo.mjs framework_
- Separate component library and framework core into packages; separate data package
	- 1st via subfolder structure; later consider separate npm-package for component-library
- Use longer, but clearer, module names (e.g. `TableContainerBase.mjs` instead of 50 `Base.mjs` files)
- Document codebase conventions to benefit contributors unfamiliar with ExtJS and related spiritual predecessors, e.g.
	- class configs w. "_" suffix imply that `beforeSet..()` and `afterSet..()` hooks will be called by neo.mjs
	- 
- ...

### Expanding neo-mjs
_Extend the feature set of the framework and its component library_
- RPC layer (already started by @tobiu)
- neo-data-grid: Beyond HTML tables
- Extending basic component-library 
	- Full set of material-design components
	- Other component ideas?
- Improving data package (e.g. `Store` uses `Collection` instead of extending it, ...)
- Getting components/AppWorker to run inside the main thread (e.g. for consumption of neo-component as a WebComponent inside of an Angular/React application) (who would really want this? 😱)
- ...



## Timeline

- 2022-06-09T23:21:00Z @davhm added the `enhancement` label
- 2022-06-09T23:37:46Z @davhm changed title from **Overhaul the Neo.mjs roadmap and map to GitHub project boards** to **Overhaul the Neo.mjs roadmap and organize into GitHub projects**
- 2022-06-10T17:13:02Z @tobiu added the `help wanted` label
- 2022-06-10T17:13:02Z @tobiu added the `good first issue` label
### @tobiu - 2022-06-10T17:14:42Z

sounds good to me. we should combine it with the (definitely outdated) roadmap:
https://github.com/neomjs/neo/blob/dev/.github/VISION.md

- 2022-06-10T17:14:43Z @tobiu closed this issue
- 2022-06-10T17:14:48Z @tobiu reopened this issue
- 2022-06-13T14:51:03Z @davhm changed title from **Overhaul the Neo.mjs roadmap and organize into GitHub projects** to **Overhaul the Neo.mjs roadmap**
### @github-actions - 2024-08-31T02:25:49Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-31T02:25:50Z @github-actions added the `stale` label
### @github-actions - 2024-09-15T02:35:49Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-15T02:35:49Z @github-actions closed this issue

