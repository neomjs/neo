---
id: 5962
title: Earthquake Tutorial Code Wrong
state: CLOSED
labels:
  - bug
assignees:
  - maxrahder
createdAt: '2024-09-23T20:14:49Z'
updatedAt: '2024-10-05T23:44:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5962'
author: pdbayes
commentsCount: 6
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-10-02T15:00:41Z'
---
# Earthquake Tutorial Code Wrong

In the example of creating an earthquake table from an api, the root name is wrong, it should be data and not results, it fails otherwise. Also, humanReadableLocation should just be location, maybe the API changed but it took me some time to work out the issue as i am new to this and it's not a good start when the first tutorial doesn't work.

## Timeline

- 2024-09-23T20:14:49Z @pdbayes added the `bug` label
### @tobiu - 2024-09-23T20:21:02Z

hi @pdbayes!

thanks for the input. i will forward the ticket to @maxrahder who is in charge of the learning content. your gh-profile looks like you are interested in data-science. if so, i strongly recommend to join our slack channel and connect to george @gplanansky. kind of his thing and he is working on a very advanced multi-window version of the earthquakes app.

best regards,
tobias

- 2024-09-23T20:21:11Z @tobiu assigned to @maxrahder
### @pdbayes - 2024-09-24T04:18:05Z

Thanks. I will.


### @maxrahder - 2024-09-29T17:27:27Z

I changed the feed example, `humanReadableLocation` > `location`, `size` > `magnitude`, and `responseRoot: "results"` > `responseRoot: "data"`

### @tobiu - 2024-10-02T14:09:10Z

Is this ticket resolved => can we close it?

### @pdbayes - 2024-10-02T14:51:21Z

yes

On Wed, 2 Oct 2024 at 15:23, Max Rahder ***@***.***> wrote:

> I pushed the feed name changes pointed out by the guy who wrote the
> ticket.
>
(Sorry -- my earlier comment accidentally had some personal content.)


### @tobiu - 2024-10-02T15:00:41Z

thx for the update, closing the ticket.

- 2024-10-02T15:00:42Z @tobiu closed this issue

