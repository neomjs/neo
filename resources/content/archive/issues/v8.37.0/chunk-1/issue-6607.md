---
id: 6607
title: Earthquakes tutorial still using model.Component instead of state.Provider
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-03-31T22:27:04Z'
updatedAt: '2025-04-02T02:34:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6607'
author: tobiu
commentsCount: 9
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-04-01T20:03:18Z'
---
# Earthquakes tutorial still using model.Component instead of state.Provider

@maxrahder I will take a look into this one tomorrow!

## Timeline

- 2025-03-31T22:27:04Z @tobiu added the `bug` label
- 2025-03-31T22:27:10Z @tobiu assigned to @tobiu
### @camtnbikerrwc - 2025-04-01T02:10:00Z

Here are my version numbers if it helps;

npm list | grep neo
neo.mjs@8.35.1 /Users/gerard/Documents/neo/neotest/neolatest/neo
├── neo-jsdoc-x@1.0.5
├── neo-jsdoc@1.0.1
FastImac:neo gerard$ node -v
v23.10.0
FastImac:neo gerard$ npm -v
11.2.0


- 2025-04-01T13:08:07Z @tobiu referenced in commit `195a4df` - "Earthquakes tutorial still using model.Component instead of state.Provider #6607"
### @tobiu - 2025-04-01T13:15:41Z

@camtnbikerrwc Ger, I hope I got all spots now. The commit on top of this comment is rather long.
@maxrahder Max, it would be super nice, if you could double-check your guide once more.

Except for renaming view model to state provider, everything internally works the same way.

Some thoughts:
```
controller: {module: Controller},
stateProvider: {module: MainStateProvider},
```

While this syntax works fine, we could shorten it to:
```
controller: Controller,
stateProvider: MainStateProvider,
```

I also changed the class exports a bit. before:
```
Neo.setupClass(MainView);
export default MainView;
```

New:
```
export default Neo.setupClass(MainView);
```

The key difference is that the new version supports running different neo envs on one page (e.g. inside the Portal App we use the `development` mode for code inside code editors (can not get minified or bundled), and we use the `dist/production` env for everything else.

- 2025-04-01T13:27:52Z @tobiu referenced in commit `2b7cb0b` - "#6607 createAppMinimal: view model => state provider"
### @tobiu - 2025-04-01T13:28:24Z

updated @maxrahder's createAppMinimal program too.

### @camtnbikerrwc - 2025-04-01T15:22:40Z

Hi Tobi, I need to head out for a few hours

Can u zip up the completed EarthQuakes example ( complete with google maps) and send to me.

Ger

### @camtnbikerrwc - 2025-04-01T15:36:20Z

Looks like this has been updated:

https://neomjs.com/dist/production/apps/portal/#/learn/tutorials.Earthquakes

I can start from fresh here and make sure it works.

Ger

### @tobiu - 2025-04-01T17:06:55Z

you are making a valid point: i should drop the final version of the tutorial app into an own repository.

will do this today, probably only takes me 15m.

### @tobiu - 2025-04-01T18:39:03Z

@camtnbikerrwc Ger, at the moment, i can not recommend the tutorial anymore:
https://github.com/neomjs/earthquakes

even when dropping in @maxrahder's custom addon & wrapper, we get:
<img width="1516" alt="Image" src="https://github.com/user-attachments/assets/6f6842d6-f0c8-4f56-9f40-126b940784b7" />

if i switch it to advanced markers, we get:
<img width="1511" alt="Image" src="https://github.com/user-attachments/assets/2373c123-0dd3-4404-9e81-1decde09a8b4" />

checked the docs, and it seems like you can now only use an API key, in case it is connected to a credit card.

in which case we can no longer provide a "generic" key.

so the message would be: "want to do this tutorial? give google your credit card details first."

not sure, if this is feasible.

- 2025-04-01T20:03:18Z @tobiu closed this issue
### @tobiu - 2025-04-01T20:03:19Z

i added a follow-up ticket: https://github.com/neomjs/neo/issues/6611

closing this one, since the original scope is resolved.

### @gplanansky - 2025-04-02T02:34:09Z

fwiw, I have  had Googlemaps working with legacy and advanced markers, plus some other stuff, for a while now.  It still works as of Neo 8.5.0 .    However, no markers show at Neo 8.36.0 .   
checking ... .



