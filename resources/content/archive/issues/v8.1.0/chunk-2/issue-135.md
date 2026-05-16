---
id: 135
title: 'Found 10 vulnerabilities (3 moderate, 5 high, 2 critical) after ran npm install'
state: CLOSED
labels:
  - bug
  - stale
assignees: []
createdAt: '2019-11-29T13:26:31Z'
updatedAt: '2024-09-29T02:38:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/135'
author: bsourcecorp
commentsCount: 6
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-29T02:38:37Z'
---
# Found 10 vulnerabilities (3 moderate, 5 high, 2 critical) after ran npm install


I (**Daniel da Cunha Bueno**, from Brazil) found this problem when I ran npm install.

Here is mentioned the following message:

**found 10 vulnerabilities (3 moderate, 5 high, 2 critical)**

View the full installation log:
![image](https://user-images.githubusercontent.com/10448803/69871823-8e4a9880-1292-11ea-8cba-20165da684bf.png)
![Neo mjs - npm install](https://user-images.githubusercontent.com/10448803/69871838-9c001e00-1292-11ea-815c-ac527b1938f8.png)
![Neo mjs - npm audit fix](https://user-images.githubusercontent.com/10448803/69871847-a0c4d200-1292-11ea-9ce7-48ae91a64daf.png)

npm WARN deprecated pygmentize-bundled@2.3.0: no longer maintained

> deasync@0.1.16 install D: \ Git \ danielcbueno \ tests \ neo \ neo \ node_modules \ deasync
> node ./build.js

`win32-x64-node-10` exists; testing
Binary is fine; exiting

> node-sass@4.13.0 install D: \ Git \ danielcbueno \ tests \ neo \ neo \ node_modules \ node-sass
> node scripts / install.js

Downloading binary from https://github.com/sass/node-sass/releases/download/v4.13.0/win32-x64-64_binding.node
Download complete.] -:
Binary saved to D: \ Git \ danielcbueno \ tests \ neo \ neo \ node_modules \ node-sass \ vendor \ win32-x64-64 \ binding.node
Caching binary to C: \ Users \ daniel.bueno \ AppData \ Roaming \ npm-cache \ node-sass \ 4.13.0 \ win32-x64-64_binding.node

> node-sass@4.13.0 postinstall D: \ Git \ danielcbueno \ tests \ neo \ neo \ node_modules \ node-sass
> node scripts / build.js

Binary found at D: \ Git \ danielcbueno \ tests \ neo \ neo \ node_modules \ node-sass \ vendor \ win32-x64-64 \ binding.node
Binary Testing
Binary is fine
npm notice created a lockfile as package-lock.json. You should commit this file.
npm WARN sass-loader@8.0.0 requires a peer of sass@^1.3.0 but none is installed. You must install peer dependencies yourself.
npm WARN sass-loader@8.0.0 requires a peer of fibers @> = 3.1.0 but none is installed. You must install peer dependencies yourself.
npm WARN optional SKIPPING OPTIONAL DEPENDENCY: fsevents@1.2.9 (node_modules \ fsevents):
npm WARN notsup SKIPPING OPTIONAL DEPENDENCY: Unsupported platform for fsevents@1.2.9: wanted {"os": "darwin", "arch": "any"} (current: {"os": "win32", "arch": "x64"})

added 1303 packages from 667 contributors and audited 11245 packages in 165.73s
found 10 vulnerabilities (3 moderate, 5 high, 2 critical)
  run `npm audit fix` to fix them, or` npm audit` for details

After that I ran the npm audit fix command as recommended.

And the bugs were fixed.

npm WARN optional SKIPPING OPTIONAL DEPENDENCY: fsevents@1.2.9 (node_modules \ fsevents):
npm WARN notsup SKIPPING OPTIONAL DEPENDENCY: Unsupported platform for fsevents@1.2.9: wanted {"os": "darwin", "arch": "any"} (current: {"os": "win32", "arch": "x64"})

up to date in 7,192s
fixed 0 of 10 vulnerabilities in 11245 scanned packages
  10 vulnerabilities required manual review and could not be updated

My version of npm is  **npm@6.11.2** and my OS is **Windows 10 Pro x64 **.

Hope this helps.


## Timeline

- 2019-11-29T13:26:31Z @bsourcecorp added the `bug` label
### @bsourcecorp - 2019-11-29T13:32:39Z

I duplicated one of the images by mistake.

Disregard the extra image.


### @tobiu - 2019-11-29T14:37:37Z

Hi Daniel,

thx for looking into it. The best (visual) way to check for errors is in my opinion `npm audit`.

<img width="565" alt="Screenshot 2019-11-29 at 15 31 17" src="https://user-images.githubusercontent.com/1177434/69875501-9409a380-12bd-11ea-9b0b-98fea1e6a0b4.png">

<img width="586" alt="Screenshot 2019-11-29 at 15 31 49" src="https://user-images.githubusercontent.com/1177434/69875508-9cfa7500-12bd-11ea-9733-fcfda6de6f83.png">

So basically, neo includes 2 packages which contain errors.

1.  We can remove markdown2html (already using showdown instead for md parsing inside the real world app).

2.  I already pinged Mats & Nickolay (Bryntum) about the Siesta issues a while ago. These errors seem to be inside packages which require packages and not inside the direct dependencies, so it might be tricky to patch them.



- 2019-11-29T14:41:38Z @tobiu cross-referenced by #136
### @bsourcecorp - 2019-11-29T14:45:14Z

OK,

I appreciate helping yout project, and this is the first project I following and interact in English, so if I say anything outside to what do you expect, please let me know.

I will continue to test and develop after work.

### @tobiu - 2019-11-29T15:01:53Z

Hi Daniel,

I added a code of conduct from Mozilla. This one is basically saying "be nice" or more precisely don't be mean to anyone on a personal level. Otherwise any kind of feedback is helpful and appreciated. Especially reporting bugs & vulnerabilities is a good thing.

It is also extremely helpful to upvote or comment on tickets which are important for you. This will definitely influence the current roadmap.

I removed the html2markdown dependency.

There are 7 vulnerabilities left: (1 critical, 5 high, 1 medium) and they are all related to Siesta light.
I also ran `npm outdated` => 0 dependencies.

<img width="569" alt="Screenshot 2019-11-29 at 15 56 04" src="https://user-images.githubusercontent.com/1177434/69876843-eef0ca00-12c0-11ea-9add-a435bf5607ec.png">


### @github-actions - 2024-09-14T02:28:15Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-14T02:28:15Z @github-actions added the `stale` label
### @github-actions - 2024-09-29T02:38:36Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-29T02:38:37Z @github-actions closed this issue

