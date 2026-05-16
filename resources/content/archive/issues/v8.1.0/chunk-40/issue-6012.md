---
id: 6012
title: Write a Blog Post about Neo.mjs
state: CLOSED
labels:
  - help wanted
  - good first issue
  - Blog Post
  - hacktoberfest
assignees: []
createdAt: '2024-10-03T09:29:02Z'
updatedAt: '2024-11-02T12:59:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6012'
author: tobiu
commentsCount: 4
parentIssue: 5963
subIssues:
  - '[x] 5964 Write a Blog Post about Neo.mjs, number 1'
  - '[x] 5976 Write a Blog Post about Neo.mjs, number 2'
  - '[x] 5987 Blog Post: Neo.mjs: A novel framework for high-performance web applications.'
  - '[x] 6014 Blog Post: An Introduction to Neo.mjs: Revolutionizing JavaScript Frameworks'
subIssuesCompleted: 4
subIssuesTotal: 4
blockedBy: []
blocking: []
closedAt: '2024-11-02T12:59:40Z'
---
# Write a Blog Post about Neo.mjs

Related to: https://github.com/neomjs/neo/issues/5963 (Please read this ticket first)

Let us start with a "non-technical contribution" ticket for the #hacktoberfest event.

Since this project is still fairly unknown to the developer community, it would be super highly appreciated in case some of you could write blog posts.

Freedom of choice on which platform you write (e.g. Medium, Dev.to).
Also complete freedom of choice about which areas of the framework or your experience with it you want to write.
Once done, make sure to open a PR to get your hacktoberfest credits and ideally share a friends link to your article (if applicable).
In case this is ok for you, we would like to add good blog posts to our official blog link section:
https://neomjs.com/dist/production/apps/portal/#/blog

## How to add a new blog post into the Neo Website (Portal App)?

Take a look at:
https://github.com/neomjs/neo/blob/dev/apps/portal/resources/data/blog.json

You need to create a new item at the top with an id 1 higher than the last one.

We also need an avatar or profile picture, which should get added inside the pages repo:
https://github.com/neomjs/pages/tree/main/resources_pub/website/blogAuthor

And a cover image (width 800px):
https://github.com/neomjs/pages/tree/main/resources_pub/website/blog

You can add a separate hacktoberfest PR for your images inside the pages repo.

## How to test the blog preview locally?

1. Fork this repo
2. npm i
3. npm run build-all
4. npm run server-start
5. navigate to https://localhost:8080/apps/portal/index.html#/blog

## How to get traffic on a new blog post?

This is a science on its own. Google might pick it up in case there are many backlinks to the blog post. From my experience, sharing the blog post on multiple social platforms (e.g. Linkedin, Facebook, Twitter(X), Reddit) works best.



Thank you in advance,
Tobias

## Timeline

- 2024-10-03T09:29:02Z @tobiu added the `good first issue` label
- 2024-10-03T09:29:02Z @tobiu added the `hacktoberfest` label
- 2024-10-03T09:29:02Z @tobiu added the `help wanted` label
### @adhirajpawar - 2024-10-03T09:42:06Z

Hi Tobias,

I came across issue #5963 and would love to contribute to the Neo.mjs project as part of Hacktoberfest by writing a blog post. I believe this would be a great way to spread awareness about the framework and share my experiences with it.

Could you confirm if I can proceed with this contribution? Once the blog post is ready, I will submit a pull request (PR) to ensure it gets counted toward my Hacktoberfest progress.

Please let me know if there are any specific guidelines or topics you'd prefer I cover, or if I have complete freedom as mentioned in the issue.

Looking forward to your response and contributing to this fantastic project!

- 2024-10-03T14:29:12Z @tobiu added the `Blog Post` label
- 2024-10-03T14:35:01Z @tobiu cross-referenced by PR #6013
- 2024-10-03T18:18:34Z @adhirajpawar cross-referenced by PR #6015
### @Dxuian - 2024-10-04T05:30:55Z

i would like to contribute if theres anything lefft ?

- 2024-10-04T20:09:53Z @tobiu cross-referenced by #5976
### @tobiu - 2024-10-04T20:31:24Z

@Dxuian yes, you are welcome to create a new sub issue.

Since we now already have 3 intro blog posts which are in a way similar (at least the gen ai parts), new blog posts should cover different areas.

Content-wise, posts describing your experience with creating a first Neo.mjs app would provide a high value, since we can then think about which parts we could simplify or notice where first-time users struggle.

Blog Posts about specific examples / demo apps would also be appreciated, ideally containing code snippets, images and or videos.

Another idea would be to describe how the worker setup plays together. non-trivial, since this requires a deeper understanding and testing. 

Or creating a new component as a topic.

In case you need more content inside the learning section regarding specific topics for getting up to speed, @maxrahder would be happy to see new feature request tickets.

### @tobiu - 2024-11-02T12:59:40Z

Since the event has ended, i will close all hacktoberfest related tickets now. In case someone still wants to work on a related ticket, feel free to add a comment and we can reopen it.

- 2024-11-02T12:59:40Z @tobiu closed this issue

