---
number: 1881
title: The future of the data worker (pondering ideas for v2)
author: tobiu
category: Ideas
createdAt: '2021-04-27T19:40:48Z'
updatedAt: '2022-06-27T06:20:48Z'
---
The data worker is kind of a relict when Rich and I started the neo.mjs project back in 2015.
Back then, it was only possible to spawn workers from the main thread.

All messages from app to data need to pass main, which is not needed, since main contains no app related logic.

Nested dedicated workers are now possible in Chrome & Firefox:
https://www.chromestatus.com/feature/6080438103703552

Webkit (Safari) is not there yet. Added a comment to the ticket:
https://bugs.webkit.org/show_bug.cgi?id=22723

In neo.mjs we also have the SharedWorkers setup. The data worker does not need to be a shared one. What we need is spawning normal (dedicated) workers from a SharedWorker. Sadly, there is not a single browser which supports this yet. Same story for spawning SharedWorkers from SharedWorkers (which we don't need).

So, at the moment, we could add the change only for the non shared workers scope excluding Safari.


Rich had the idea that (data) stores should live within the data worker. Every store OP (sorting, filtering, grouping) would become async in this case.

The general problem is more tricky: for stores containing little data, it does not make sense.
E.g. A grid with a local store and 10 rows: sorting it inside the data worker would take more time for the messaging part than for the sorting OP itself. However: a grid with a remote store, 10 rows and local(!) sorting could live inside the data worker scope, since ajax calls start from there.

We need to do some benchmarking to get a precise feeling about how much data we need to make it worth to move data-manipulation tasks to the data worker.

My gut feeling is that this only makes sense for buffered grids, where a store can contain 1000s of records.

Thoughts on this one?
