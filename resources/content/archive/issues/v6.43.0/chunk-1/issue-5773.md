---
id: 5773
title: Neo.setupClass() => better IDE support
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-08-18T08:46:51Z'
updatedAt: '2024-08-18T08:51:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5773'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-08-18T08:51:38Z'
---
# Neo.setupClass() => better IDE support

The recent code changes do affect the IDE support.

Before:
```
/**
 * The base class for (almost) all classes inside the Neo namespace
 * Exceptions are e.g. core.IdGenerator, vdom.VNode
 * @class Neo.core.Base
 */
class Base {
    // ...
}

Neo.setupClass(Base);

export default Base;
```

Now:
```
/**
 * The base class for (almost) all classes inside the Neo namespace
 * Exceptions are e.g. core.IdGenerator, vdom.VNode
 * @class Neo.core.Base
 */
class Base {
    // ...
}

export default Neo.setupClass(Base);
```
My IDE was showing classes in white and the file src was correct
<img width="834" alt="Screenshot 2024-08-18 at 07 45 46" src="https://github.com/user-attachments/assets/ba5d858e-759c-4655-b43f-d443fe28fc06">

Now the IDE switched to purple, declares everything as `Neo.core.Base` and points to the current file:
<img width="639" alt="Screenshot 2024-08-18 at 07 45 58" src="https://github.com/user-attachments/assets/d0052bbe-a3b1-48f1-94fc-ce39f3792f71">


## Timeline

- 2024-08-18T08:46:51Z @tobiu added the `enhancement` label
- 2024-08-18T08:46:51Z @tobiu assigned to @tobiu
- 2024-08-18T08:47:21Z @tobiu referenced in commit `2836877` - "Neo.setupClass() => better IDE support #5773"
### @tobiu - 2024-08-18T08:51:38Z

with making clear for `setupClass(cls)` that the return value is the same type as the param, the IDE support got a bit better again.

The hint still points to the current file and the color is still purple instead of white:
<img width="602" alt="Screenshot 2024-08-18 at 10 48 13" src="https://github.com/user-attachments/assets/c1c290a4-8266-4ce1-967c-f6f586fd21ba">

But it is at least no longer saying `Neo.core.Base`, but the correct class extension. Clicking on the class (blue .Text in this case), points to the correct file:
<img width="555" alt="Screenshot 2024-08-18 at 10 48 29" src="https://github.com/user-attachments/assets/41e38e1b-5d22-49cc-a890-66c3745c0c33">



- 2024-08-18T08:51:38Z @tobiu closed this issue

