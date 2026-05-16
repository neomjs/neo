---
id: 3625
title: 'Neo.data.Model should be renamed to something else, such as Neo.data.Record'
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2022-12-17T23:30:31Z'
updatedAt: '2024-09-14T02:26:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3625'
author: maxrahder
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-14T02:26:34Z'
---
# Neo.data.Model should be renamed to something else, such as Neo.data.Record

"Model" is a highly overloaded term in programming, and even within Neo it can refer to a "view model" or a record class. When I talk to developers or in training, I always avoid using the term "model" since the audience may have preconceptions about what it means. Therefore, in Neo we need a different term. I suggest `Neo.data.Record`. 

I do realize that a "record" is an instance, and stores are collections of records. But it's in OOP it's common for the instance to reflect the name of its class. For example, one defines a `Neo.data.Store`, and the instance is called a "store". There are numerous similar examples. I'd be tempted to call the record class `Neo.data.Entity`, as in "entity-relationship" (database) modeling, but "entity" is pretty ambigious too. I can't think of a better name than `Ext.data.Record`.

## Timeline

- 2022-12-17T23:30:31Z @maxrahder added the `enhancement` label
### @tobiu - 2022-12-18T11:28:32Z

sounds like a discussion item for @ThorstenSuckow @ExtAnimal.

I do agree, that "model" for data & component models does sound a bit confusing.

However, records in neo are **not** model instances, but slightly enhanced objects (we need change events).

There is a `Neo.data.RecordFactory` in place, which would also create confusion with a record based naming.

Maybe `Neo.data.Entity` could work.

The bigger naming issue I see is that Angular & React devs got used to call a view model / state provider `Store`. In our world we automatically think of `data.Store`.

Open for ideas, in case we can make our namings easier. Needs to be bullet-proof :)

### @Dinkh - 2023-01-02T20:16:30Z

I am fine with model, as it is only a model-description.
Record would be the rendered data, based on the model-description.

For me there is no need to rename it.

### @github-actions - 2024-08-30T02:27:32Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-30T02:27:33Z @github-actions added the `stale` label
### @github-actions - 2024-09-14T02:26:34Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-14T02:26:34Z @github-actions closed this issue

