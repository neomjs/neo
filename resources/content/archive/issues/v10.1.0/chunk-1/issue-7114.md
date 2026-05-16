---
id: 7114
title: Neo gridcontainer example has rendering issues on chrome/android
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2025-07-26T22:07:18Z'
updatedAt: '2025-07-27T19:43:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7114'
author: TristanJamesBall
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-27T10:50:20Z'
---
# Neo gridcontainer example has rendering issues on chrome/android

**Describe the bug**
Bar graph and buttons initially render correctly,  then after a few seconds redraw to overlap.

**To Reproduce**
Just opened the first example https://neomjs.com/dist/production/examples/grid/bigData/index.html

**Expected behavior**
A clear and concise description of what you expected to happen.

**Screenshots**

![Image](https://github.com/user-attachments/assets/be92d775-b030-479e-a822-9a2524b991d0)

**Desktop (please complete the following information):**
 - OS: [e.g. iOS]
 - Browser [e.g. chrome, safari]
 - Version [e.g. 22]

**Smartphone (please complete the following information):**
Samsung galaxy tab s7
Google Chrome	138.0.7204.168 (Official Build) (64-bit) 
Revision	3e8d82e86e9f508e88ed406c2a24657a6c691d30-refs/branch-heads/7204@{#2081}
OS	Android 13; SM-T870 Build/TP1A.220624.014; 33; REL
APK versionCode	720416833
APK targetSdkVersion	35
Google Play services	SDK=252225000; Installed=252635029; Access=1p
JavaScript	V8 13.8.258.29
User agent	Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36
Command Line	--top-controls-show-threshold=0.27 --top-controls-hide-threshold=0.17 --enable-viewport --validate-input-event-stream --enable-longpress-drag-selection --touch-selection-strategy=direction --disable-composited-antialiasing --enable-dom-distiller --flag-switches-begin --flag-switches-end
Executable Path	No such file or directory
Profile Path	/data/user/0/com.android.chrome/app_chrome/Default
**Additional context**
Add any other context about the problem here.
I saw a blog article about neo.mjs ,  got curious, found the website and this is the first example I looked at, as it was near the top of the list and apropos to my job as a dba.

## Timeline

- 2025-07-26T22:07:19Z @TristanJamesBall added the `bug` label
### @tobiu - 2025-07-26T22:16:59Z

@TristanJamesBall Thanks a lot for the report!

I can confirm the issue, even on desktop:

https://github.com/user-attachments/assets/6b81b653-f721-43d7-83b5-03237e88c8bb

Definitely a regression bug in v10. It looks like on the first resize or scroll, component based columns can duplicate. It seems to get stable after scrolling more, but I need to look into what is happen in detail. Might be related to the new vdom aggregation logic.

### @TristanJamesBall - 2025-07-26T22:28:31Z

Super quick and *polite* response to a drive by bug report  -  honestly that carries as much weight in my head as 10 fancy examples. Kudos, and thankyou.

Fwiw, I thought it might have something todo with the UI and font zoom settings I use, but it persists even with of that turned off. 
Given you've reproduced anyway this is probably moot but :

![Image](https://github.com/user-attachments/assets/e535180d-24f3-4ac8-b519-b28c1ff8bf57)

- 2025-07-27T10:40:57Z @tobiu referenced in commit `789f1cb` - "Neo gridcontainer example has rendering issues on chrome/android #7114"
### @tobiu - 2025-07-27T10:50:20Z

@TristanJamesBall I think I got it now.

Funny story: I burned 6M Gemini 2.5 Pro Tokens on it, but it was leading nowhere. The real fix was just touching 5 lines of code, but it was very complex indeed.

In a nutshell: the v10 vdom aggregation was using `neo-ignore` placeholders, which did override existing `componentId`s. This was leading to cases where when an update cycle starts, the vdom (new state) contained the cell component, the vnode however included the `neo-ignore` flag. It was not getting the right cmp id back.

So, the change is to just move the flag into a new attribute.

Regarding "being polite". This should be inside the neo code of conduct, and it makes sense anyway:
With opening a bug ticket, you are giving me the chance to fix a bug which I did not notice before => enabling me to fix it, and this improves the framework for everyone who is using it.

Best regards,
Tobi

- 2025-07-27T10:50:20Z @tobiu closed this issue
### @tobiu - 2025-07-27T19:43:35Z

@TristanJamesBall forgot to mention:
https://neomjs.com/dist/production/examples/grid/bigData/index.html

=> The new version is deployed now. Please let me know if you encounter any other issues. I also fixed the grid column header drag&drop resorting. You can over-drag to the left or right and the grid will scroll accordingly.


