---
id: 6002
title: 'Hacktoberfest: Creating d.ts files for neo classes'
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
assignees: []
createdAt: '2024-10-01T23:19:04Z'
updatedAt: '2024-11-02T13:00:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6002'
author: tobiu
commentsCount: 9
parentIssue: 5963
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-11-02T13:00:27Z'
---
# Hacktoberfest: Creating d.ts files for neo classes

Related to the Hacktoberfest Welcome ticket: https://github.com/neomjs/neo/issues/5963 (Please read this ticket first)

This is a shout-out to all GenAI fans. I am actually using the `Prompt Engineering` buzzword here :)

While the framework itself will stay as pure JavaScript, we can still create d.ts files and import them inside JS comments. This way IDEs think that it is TS and provide full auto-completion support, while we do not get the need for a transpilation step and resulting code overhead.

an old discussion here:
https://github.com/neomjs/neo/issues/1100

concept of importing d.ts files inside JS comments:
https://goulet.dev/posts/how-to-write-ts-interfaces-in-jsdoc/ (at the very bottom)

I did play a bit with Perplexity AI and got to the point where it to some degree understood what a class config system is and how to describe it as types. A very first PoC is inside this branch:
https://github.com/neomjs/neo/tree/d.ts-files
https://github.com/neomjs/neo/commit/ee3f7b16ab542a200ce88af6b8ae647a366da8f6

While the API for developers to use the framework will stay as stable as possible, the internal code base will change a lot. So it would not make sense to manually generate the d.ts files and update them for every change, but use GenAI to handle it.

Sadly, my entire input for Perplexity AI is bound to my local session, this is why I was using the `Prompt Engineering` buzzword.

For the hacktoberfest scope, this would be worth a lot of PRs (basically one for each file).

In case someone is interested in this topic, please let us know!

Thank you,
Tobi

## Timeline

- 2024-10-01T23:19:04Z @tobiu added the `enhancement` label
- 2024-10-01T23:19:04Z @tobiu added the `help wanted` label
- 2024-10-01T23:19:04Z @tobiu added the `good first issue` label
- 2024-10-01T23:19:04Z @tobiu added the `hacktoberfest` label
### @Dxuian - 2024-10-04T05:32:10Z

i can help here if this is still open ?

### @Dxuian - 2024-10-04T11:44:02Z

ive looked into this problem a little and since the jsautodoc annotations have been followed we can generate the files however a lot of the files have incorrect annotations and as such we would first need to correct them @tobiu 
example of one such incorrect ts i found amongst others 
![Image](https://github.com/user-attachments/assets/d19a37e6-63ef-474d-a5d9-8522235c00ee)
@tobiu  any input ?


- 2024-10-04T18:14:11Z @tobiu referenced in commit `29d8416` - "#6002 worker.ServiceBase: doc comment fixes"
### @tobiu - 2024-10-04T18:25:29Z

i adjusted the mentioned file. kind of obvious that an async method needs a Promise return value comment.
`@returns {Promise<Object>}` in this case.

feel free to open tickets for other spots you find. easy PRs.

at the start of the project, i went for uppercase Boolean, Number, String inside type comments. in retrospective using the lowercase versions would have been cleaner. i would hold off on this one for the current code base (too many spots), but it makes sense to do it properly inside the new d.ts files right from the start.

the real deal why we can not use auto-generator scripts but need AI (or a highly customised own script) is the class config system:

take a close look at: https://github.com/neomjs/neo/commit/ee3f7b16ab542a200ce88af6b8ae647a366da8f6

everything inside `static config` will get added to the class prototype (get / set driven) and configs for class extensions will get merged.

on top, every config which ends with an underscore enables us to optionally use hooks.

example: a button has a `text_` config which optionally allows us to use `beforeGetText(value)`, `beforeSetText(value, oldValue)`, `afterSetText(value, oldValue)`.

the hooks do not necessarily need to get into the d.ts definitions (would be a nice goodie on top), but getting the configs right is crucial.

the mentioned AI commit does it well to some degree (just for 3 files).

### @Dxuian - 2024-10-04T18:41:07Z

i see what youre getting at with reference to [commit](https://github.com/neomjs/neo/commit/ee3f7b16ab542a200ce88af6b8ae647a366da8f6)
i would also like to point out that the ai generated should be the default but the generator does work for smaller isolated modules 
also i would like suggest a change wherein all d.ts files are in a separate types folder as is the standard in various repositiories to prevent the codebase from getting cluttered the new fs being similar to this 
![Image](https://github.com/user-attachments/assets/fec18f05-81d6-4963-8b8b-b7a687228278)


### @tobiu - 2024-10-04T18:50:52Z

in case you want to understand the config system (it is super nice), i created some blog posts about it.

code wise:
https://github.com/neomjs/neo/blob/dev/src/Neo.mjs#L417
https://github.com/neomjs/neo/blob/dev/src/core/Base.mjs#L498

regarding the folder structure: if we are doing this with the d.ts files, my idea was to convert current class files into folders.

e.g. `src/button/Base.mjs`

`src/button/base` containing:
Base.d.ts
Base.mjs
Base.scss // css structure, theme files need to stay separate
Base.stories.mjs // Storybook
Base.test.mjs // Siesta tests

this would need changes for the build scripts as well as the internal class name to file mappings.

### @Dxuian - 2024-10-04T19:02:04Z

just to clarify the types file go in the same place as a the mjs files otherwise we'd need a rehaul of the whole system ?

### @Dxuian - 2024-10-04T19:13:45Z

@tobiu if yes could you check out #6017 and offer input ?
cuz it'd help to know if i need to put the file in the same dir for keeping the fs  consistent 

### @tobiu - 2024-10-04T19:47:57Z

getting started with a `type` top-level folder which mimics the structure of the `src` folder is fine for me.

just one big wish: let us stick to the following branch for now: https://github.com/neomjs/neo/tree/d.ts-files

rationale: while we can work inside the types folder in isolation, at some point we need to modify the src files to import the new d.ts files inside comments. when we get to a PoC state where auto completion for configs works properly inside IDEs, then I would rebase the feature branch into dev.

also take a look at:
https://github.com/neomjs/neo/blob/d.ts-files/src/util/KeyNavigation.d.ts#L18

the import in line1 should fetch the d.ts file (a .js file does not even exist).

i am not a TS pro (not even close), but i guess the AI concept of creating a Config interface which extends the base class interface does make sense.

several open questions, like if `declare namespace Neo.util {` when used multiple times (files inside the util folder) would merge the TS namespace or overwrite it.



- 2024-10-05T09:34:12Z @Dxuian cross-referenced by PR #6017
### @tobiu - 2024-11-02T13:00:27Z

Since the event has ended, i will close all hacktoberfest related tickets now. In case someone still wants to work on a related ticket, feel free to add a comment and we can reopen it.

- 2024-11-02T13:00:27Z @tobiu closed this issue

