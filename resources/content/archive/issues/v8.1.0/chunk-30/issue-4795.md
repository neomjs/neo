---
id: 4795
title: 'Neo.tree.Accordion: Throwing jsdocx errors on build, on line 40 and 51'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-08-29T13:10:20Z'
updatedAt: '2023-08-30T07:56:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4795'
author: alberthashani
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-08-30T07:56:42Z'
---
# Neo.tree.Accordion: Throwing jsdocx errors on build, on line 40 and 51

Errors:

repoX@0.1.0 generate-docs-json
node ./node_modules/neo.mjs/buildScripts/docs/jsdocx.mjs

Start default jsdocx parsing.
Error: ERROR: Unable to parse a tag's type expression for source file /Users/username/repos/repoX/node_modules/neo.mjs/src/tree/Accordion.mjs in line 40 with tag title "member" and text "{Record[|null} selection=null": Invalid type expression "Record[|null": Expected "!", "#", "$", "(", "-", ".", "/", "0", ":", "<", "=", "?", "@", "[]", "\\", "_", "|", "~", "‌", "‍", Unicode combining mark, Unicode decimal number, Unicode letter number, Unicode lowercase letter, Unicode modifier letter, Unicode other letter, Unicode punctuation connector, Unicode titlecase letter, Unicode uppercase letter, [1-9], or end of input but "[" found.
ERROR: Unable to parse a tag's type expression for source file /Users/username/repos/repoX/node_modules/neo.mjs/src/tree/Accordion.mjs in line 51 with tag title "member" and text "{Record[|null} selection=null": Invalid type expression "Record[|null": Expected "!", "#", "$", "(", "-", ".", "/", "0", ":", "<", "=", "?", "@", "[]", "\\", "_", "|", "~", "‌", "‍", Unicode combining mark, Unicode decimal number, Unicode letter number, Unicode lowercase letter, Unicode modifier letter, Unicode other letter, Unicode punctuation connector, Unicode titlecase letter, Unicode uppercase letter, [1-9], or end of input but "[" found.



## Timeline

- 2023-08-29T13:10:20Z @alberthashani added the `bug` label
- 2023-08-29T14:22:04Z @tobiu assigned to @Dinkh
### @tobiu - 2023-08-29T14:23:41Z

Torsten, can you take a look into it?

Probably this one: `@member {Record[|null} selection=null`

=> Record is not a knwon type in JS, so probably something like: `{Object[]|null}`. Not closing the ] can also cause issues. Same story for methods.

### @tobiu - 2023-08-30T07:55:34Z

alright, i will take care of this one then.

- 2023-08-30T07:55:44Z @tobiu assigned to @tobiu
- 2023-08-30T07:55:51Z @tobiu unassigned from @Dinkh
- 2023-08-30T07:56:13Z @tobiu referenced in commit `fa46556` - "Neo.tree.Accordion: Throwing jsdocx errors on build, on line 40 and 51 #4795"
### @tobiu - 2023-08-30T07:56:42Z

@alberthashani: the docs build works again.

- 2023-08-30T07:56:42Z @tobiu closed this issue

