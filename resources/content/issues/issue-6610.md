---
id: 6610
title: main.addon.OpenStreetMaps
state: OPEN
labels:
  - enhancement
  - no auto close
assignees:
  - tobiu
createdAt: '2025-04-01T20:01:30Z'
updatedAt: '2025-08-03T12:27:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6610'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# main.addon.OpenStreetMaps

* The first step is to verify that we can get a public key (or use it without a key)
* We just need support for a basic map and markers

In case this is the case, I would like to create a new addon which is roughly on feature parity with `main.addon.GoogleMaps`.

## Timeline

- 2025-04-01T20:01:30Z @tobiu added the `enhancement` label
- 2025-04-01T20:01:30Z @tobiu added the `no auto close` label
- 2025-04-01T20:01:30Z @tobiu assigned to @tobiu
- 2025-04-01T20:02:42Z @tobiu cross-referenced by #6611
### @TomDakan - 2025-08-03T05:21:16Z

I think this can be done with the [OpenLayers ](https://openlayers.org/) library. The markers would be created as a [vector layer](https://openlayers.org/en/latest/examples/icon.html) on top of a tile layer pulled from OpenStreetMaps as described in [this](https://openlayers.org/en/latest/examples/simple.html) example. It appears that there's no need for an api key to pull tiles from OSM.

I would be interested in working on this.

### @tobiu - 2025-08-03T12:27:02Z

@TomDakan You are very welcome to give it a try! I think this specific topic should be fun (a great learning experience), since it covers a wrapper component, a new main thread addon, RPC based cross-thread communication, and the potential for using the new intercept remotes pattern for addons (e.g. easily queue a request to create a map instance until the map lib is loaded).

It might even work to use LLMs (like Gemini CLI) here.

I did use MapboxGL (also based on top of OSM) for the Covid Apps. Feel free to explore existing addons and wrapper components first, and explore how they work (or feed an LLM with it).

One very strong recommendation when it comes to PRs:
Keep them as small and targeted as possible. E.g. create sub tickets, like "create the addon base class file" => PR, accepted. Next sub: "add logic for adding markers" => PR.

Submitting a massive PR which would e.g. resolve 8 tickets, but introduce 2 new bugs might end up in a lot of reasoning back and forth to get to a merge-ready state. This could lead to frustration, which can easily get avoided with smaller PRs.

Feel free to ask questions on Slack / Discord, and I can give you more pointers.

Best regards,
Tobias


