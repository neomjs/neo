---
id: 1100
title: 'Discussion: Should we add a mode which supports TypeScript?'
state: CLOSED
labels:
  - enhancement
  - help wanted
  - discussion
  - stale
assignees: []
createdAt: '2020-08-17T23:26:48Z'
updatedAt: '2024-09-27T02:34:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1100'
author: tobiu
commentsCount: 14
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-27T02:34:25Z'
---
# Discussion: Should we add a mode which supports TypeScript?

My personal opinion is no, since it does not run inside the browser.

To make it work, we would lose the lovely dev mode, which runs with zero builds or transpilations.
We would get some overhead => a slightly bigger output file-size.

We would need to add definition files:

E.g.: https://github.com/microsoft/dts-gen

We would need to adjust the webpack-dev-server to use hot module replacements for the dist/development mode, which would be the dev mode inside the TS env.

TS has its purpose though: it can protect "junior" devs from doing mistakes.

**Interested in your feedback!**

I am open minded. In case you really love TS this much, you are welcome to create a TS based version of neo.mjs. I can create a new sub-repo inside https://github.com/neomjs/ in this case.

Best regards, Tobias 

## Timeline

- 2020-08-17T23:26:48Z @tobiu added the `enhancement` label
- 2020-08-17T23:26:48Z @tobiu added the `help wanted` label
- 2020-08-17T23:26:48Z @tobiu added the `discussion` label
### @danielmhair - 2021-08-06T17:31:13Z

I really love TypeScript. I'm sure you know all the benefits of TypeScript. I also argue that even good, strong developers benefit from a typing system. This project really interests me because I am sick of slow applications and may be a benefit to my company in the future. I do love the fact that it is so quick and development mode is very quick. I would be willing to help with the typescript side.

### @tobiu - 2021-08-06T19:18:05Z

Hi @danielmhair!

The discussion came up multiple times and there are a couple of guys who would love to see it.
Tagging @kyr0 @friksa @juanmendes

I am still divergent on the TS topic :)

The main argument against it would be: "it is not a web standard", meaning: browser vendors have no intentions to ever implement it.

Adding a build step just for TS is pretty expensive. In case we do want type checking and are willing to add a build step for the dev mode, would dart2 be a better fit? v2 added support for dedicated and shared workers, so we could get the neo workers setup running in dart. Since the language is not prototype based, adding the config system would be a bit tricky (we can not add class fields dynamically, but could use bags (maps) to store them and cover the rest with "noSuchMethod". Dart would provide AOT compilations for mobile and we could map the vdom to native controls in this scenario (kind of a multithreaded flutter).

In case TS is still the preferred choice, we would need to think about a way to use it optionally. Imo this is really tricky! While converting neo into TS is quite some work but doable, maintaining one JS and one TS repo in parallel would be way more effort. All changes would need to get manually converted to keep the repos in sync.

In case you guys would like to start working on a TS neo repo, feel free to give it a try!
I might help a bit, but my time is limited (a lot of items on the roadmap).

I already created a sub-repo for this a while ago, feel free to use it:
https://github.com/neomjs/neo.ts

Best regards,
Tobi

### @tobiu - 2021-08-09T05:24:45Z

Just found this one:
https://goulet.dev/posts/how-to-write-ts-interfaces-in-jsdoc/

This actually could work for the neo scope. Thoughts?

### @friksa - 2021-08-22T19:10:46Z

All we really need is TypeScript definitions that are maintained.  You do not need to convert Neo to TypeScript to resolve this need.  There are multiple ways to accomplish that including the link that you posted.  For most projects the TS definitions are included or you run npm i -D @types/neo

### @juanmendes - 2021-08-22T21:10:58Z

I think Tobias is wondering if we can use the existing jsdoc to generate
the definition files?

On Sun, Aug 22, 2021, 15:10 friksa ***@***.***> wrote:

> All we really need is TypeScript definitions that are maintained. You do
> not need to convert Neo to TypeScript to resolve this need. There are
> multiple ways to accomplish that including the link that you posted.
>
> —
> You are receiving this because you were mentioned.
> Reply to this email directly, view it on GitHub
> <https://github.com/neomjs/neo/issues/1100#issuecomment-903316516>, or
> unsubscribe
> <https://github.com/notifications/unsubscribe-auth/AAEGDUYC3RVLH6LMEMRFBNDT6FDUDANCNFSM4QCMNGBA>
> .
> Triage notifications on the go with GitHub Mobile for iOS
> <https://apps.apple.com/app/apple-store/id1477376905?ct=notification-email&mt=8&pt=524675>
> or Android
> <https://play.google.com/store/apps/details?id=com.github.android&utm_campaign=notification-email>
> .
>


### @tobiu - 2021-08-22T23:25:48Z

Hi guys,

in case you would like to see TS definitions without a build step (converting neo to TS), this is definitely fine for me.

The current JSDoc definitions work nice in Webstorm from an intellisense perspective though.

Right now, my time is super limited. E.g. starting a new role in September.

So I think for me it makes the most sense to focus on the challenging parts (e.g. finishing the calendar, enhancing view models to make it easier to change default values, improving the performance for the delta update calculations, etc (too many items on the roadmap)). It is not the point that I enjoy these parts more, but unfortunately I don't know anyone else who could do them.

Except from this, I need to write blog posts (e.g. rewriting the covid app tutorials) to give new devs who discover neo a chance for getting up to speed. Well, I could use help on this part, but this is a different story :)

What you guys could do is creating a PoC to add TS style doc comments and definition files. I suggest to limit the scope, e.g. just doing it for the neo core.

At this point I can help with the docs parsing adjustments. The neo docs app must not break, which is obviously a requirement.

In case you team up, it should not be too much work. Maybe others can help out as well (e.g. ask inside the Slack Channel), since this task does not require a deep knowledge of the framework itself.

Thoughts?

Best regards,
Tobi

### @friksa - 2021-08-23T07:24:39Z

> I think Tobias is wondering if we can use the existing jsdoc to generate the definition files?
> […](#)

I have had bad experiences when the TS doc is not maintained by the core project as it is always outdated and frustrating.  There needs to be a commitment from the core team to maintain it even if someone else gets it going.

### @tobiu - 2021-08-23T09:20:26Z

Frik, in case we make this change happen, I will do my best to maintain it.

Kind of obvious: I want to keep the docs app stable and this one relies on up to date doc comments to create the views ;)

The more help, the better though.

### @juanmendes - 2021-08-24T14:04:34Z

The docs are always updated with new jsdoc when new code is added, aren't
they? I don't think any new maintenance is required? Just a one time build
step that generates .d.ts files from jsdoc?

However, what I would like the most is to use Neo's dev environment with
TS, I don't want to have to figure out how to configure my own TS project.
I said I was going to look into it but haven't had any time :(


--Juan

On Mon, Aug 23, 2021 at 5:20 AM Tobias Uhlig ***@***.***>
wrote:

> Frik, in case we make this change happen, I will do my best to maintain it.
>
> Kind of obvious: I want to keep the docs app stable and this one relies on
> up to date doc comments to create the views ;)
>
> The more help, the better though.
>
> —
> You are receiving this because you were mentioned.
> Reply to this email directly, view it on GitHub
> <https://github.com/neomjs/neo/issues/1100#issuecomment-903592913>, or
> unsubscribe
> <https://github.com/notifications/unsubscribe-auth/AAEGDU72RYKHTGTMNE6ONGLT6IHGLANCNFSM4QCMNGBA>
> .
> Triage notifications on the go with GitHub Mobile for iOS
> <https://apps.apple.com/app/apple-store/id1477376905?ct=notification-email&mt=8&pt=524675>
> or Android
> <https://play.google.com/store/apps/details?id=com.github.android&utm_campaign=notification-email>
> .
>


-- 
Juan Mendes


### @jimmywarting - 2023-02-01T18:49:59Z

I love types, but i like build less setups even more, that's why i prefer vanilla js + JSDoc over typescript syntax.
TypeScript is never going to be supported by any browser and likely never will.
I wrote [you might not need typescript (...syntax)](https://jimmywarting.github.io/you-might-not-need-typescript/)

You get a lot of benefit for just turning on this settings in your vscode settings.json

```json5

// settings.json

{
  // The 3 most important one:
  // Enable semantic checking of JavaScript files.
  // Existing jsconfig.json or tsconfig.json files override this setting.
  "js/ts.implicitProjectConfig.checkJs": true,
  // Enable suggestion to complete JSDoc comments.
  "javascript.suggest.completeJSDocs": true,
  // Preferred path ending with extension (good for ESM & cjs).
  "javascript.preferences.importModuleSpecifierEnding": "js",
  
  // Other suggestions useful stuff:
  // Complete functions with their parameter signature.
  "javascript.suggest.completeFunctionCalls": true,
  // Enable auto import suggestions.
  "javascript.suggest.autoImports": true
}
```

You can even enable strict mode in javascript files

### @tobiu - 2023-02-01T19:27:09Z

Hi @jimmywarting,

thanks for the vscode hints. I am personally sticking to WebStorm, but I bet they are useful for many others.

The current state on this topic is that neo will stick to pure JavaScript. No native browser support for TS was the initial reason why Rich and I did not go for it in the first place. Having a dev mode which runs without any builds / transpilation is just very powerful => it also enables us to create new neo instances inside the dev tools (console) as well as modifying views at run-time there.

There are still discussions though about this approach:
https://goulet.dev/posts/how-to-write-ts-interfaces-in-jsdoc/

<img width="754" alt="Screenshot 2023-02-01 at 20 11 37" src="https://user-images.githubusercontent.com/1177434/216142132-71565495-57be-48c9-b496-41ab552d5040.png">

Creating d.ts files, but only using them inside comments. The IDE can provide full TS support for pure JS. E.g. in case you define types which use themselves in a nested way (e.g. vdom which has several attributes and contain more vdom items inside the cn (child nodes) array. Or for complex DOM events which do get used in several spots but only need to get defined once (less docs code).

I am not involved in this project, since my list of other open topics is too huge. Feel free to join the Slack channel, in case you have not done it already.

Best regards,
Tobi

P.S.: Since neo is using JS modules, every file is using strict mode.

### @jimmywarting - 2023-02-02T00:31:20Z

> P.S.: Since neo is using JS modules, every file is using strict mode.

When i spoke if strict mode i didn't mean js-strict mode or that ES have it on by default
I meant the strict flag in TS

### @github-actions - 2024-09-13T02:31:13Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-13T02:31:13Z @github-actions added the `stale` label
### @github-actions - 2024-09-27T02:34:25Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-27T02:34:25Z @github-actions closed this issue
- 2024-10-01T23:19:05Z @tobiu cross-referenced by #6002

