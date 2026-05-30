---
id: 764
title: Defining the scope of the v1.3 release
state: CLOSED
labels:
  - help wanted
  - good first issue
  - epic
  - discussion
assignees: []
createdAt: '2020-06-21T16:00:59Z'
updatedAt: '2020-06-30T15:44:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/764'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-06-30T15:44:26Z'
---
# Defining the scope of the v1.3 release

Don't miss your chance to provide feedback on the current tickets or create new ones.

This will affect the roadmap.

Some items I am thinking about for v1.3:

1. more guides / tutorials
2. more components (e.g. a buffered grid)
3. touch events
4. enhancing the docs app
5. enhancing the webpack based build processes to support dynamic imports inside the dist env
6. drag&drop
7. enhancing the data package, e.g. grouping
8. enhancing the data worker
9. making the data & vdom workers optional

## Timeline

- 2020-06-21T16:00:59Z @tobiu added the `help wanted` label
- 2020-06-21T16:00:59Z @tobiu added the `good first issue` label
- 2020-06-21T16:01:00Z @tobiu added the `epic` label
- 2020-06-21T16:01:00Z @tobiu added the `discussion` label
### @boomskats - 2020-06-21T21:33:09Z

My vote is touch events. And looks like deep down it's your vote too, since you included it twice :)

I think touch events could really bring the shared workers idea to life. Think of interfaces that have a smaller dedicated touch enabled control surface which is separated from the primary display. Industrial and manufacturing use cases.

### @tobiu - 2020-06-21T21:39:18Z

thx @boemska-nik. fair point. fixed.

touch events feel important, since this topic allows multithreaded UIs on mobile. a follow up item would be to create some demo apps for mobile and / or adjust the existing ones. definitely an **epic** item.

in the same time (maybe less) i could create a buffered grid. not judging which item is more important nor saying that it is impossible to implement them all.

just trying to figure out the best order :)

it is different for items i am not aware of (e.g. not included as tickets or not inside the project vision. this is why feedback is so important.

### @tobiu - 2020-06-30T15:44:26Z

Well, just 1 comment => the project is clearly in need for more traction.

So, the focus for now has to be on the new website.

![Screenshot 2020-06-30 at 17 07 59](https://user-images.githubusercontent.com/1177434/86147127-4d04ba80-baf9-11ea-8f65-f8f1676dd9d9.png)

![Screenshot 2020-06-30 at 17 08 13](https://user-images.githubusercontent.com/1177434/86147146-52fa9b80-baf9-11ea-9736-9a32483c170a.png)


- 2020-06-30T15:44:26Z @tobiu closed this issue

