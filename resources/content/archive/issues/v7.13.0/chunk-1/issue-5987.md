---
id: 5987
title: 'Blog Post: Neo.mjs: A novel framework for high-performance web applications.'
state: CLOSED
labels:
  - help wanted
  - good first issue
  - Blog Post
  - hacktoberfest
assignees:
  - hashnj
createdAt: '2024-09-30T14:51:41Z'
updatedAt: '2024-10-03T14:28:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5987'
author: tobiu
commentsCount: 12
parentIssue: 6012
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-10-02T22:20:26Z'
---
# Blog Post: Neo.mjs: A novel framework for high-performance web applications.

Related to: https://github.com/neomjs/neo/issues/5963 (Please read this ticket first)

Let us start with a "non-technical contribution" ticket for the #hacktoberfest event.

Since this project is still fairly unknown to the developer community, it would be super highly appreciated in case some of you could write blog posts.

Freedom of choice on which platform you write (e.g. Medium, Dev.to).
Also complete freedom of choice about which areas of the framework or your experience with it you want to write.
Once done, make sure to open a PR to get your hacktoberfest credits and ideally share a friends link to your article (if applicable).
In case this is ok for you, we would like to add good blog posts to our official blog link section:
https://neomjs.com/dist/production/apps/portal/#/blog

Thank you in advance,
Tobias

## Timeline

- 2024-09-30T14:51:41Z @tobiu added the `help wanted` label
- 2024-09-30T14:51:41Z @tobiu added the `good first issue` label
- 2024-09-30T14:51:41Z @tobiu added the `hacktoberfest` label
### @hashnj - 2024-10-01T10:18:17Z

Hi @tobiu ,

I’ve completed a blog post as part of the Hacktoberfest event. This blog focuses more on the introductory aspects of neo.mjs, especially because I think more people should know about the framework with such high potential. You can read it here: https://dev.to/hashnj/neomjs-a-novel-framework-for-high-performance-web-applications-ia .

Please assign the issue so that I can open a PR,
Looking forward to your feedback!

Thanks

- 2024-10-01T11:01:35Z @tobiu assigned to @hashnj
### @tobiu - 2024-10-01T11:07:20Z

Hi @hashnj,

thanks and approved! For the hacktoberfest, you will additionally need to send a PR to get your credits.

In case you want to list your blog post inside the neo blog section, you can enter it here:
https://github.com/neomjs/neo/blob/dev/apps/portal/resources/data/blog.json

We need an author profile thumbnail and a preview image (width 800px) for this. We just put them inside:
https://github.com/neomjs/pages/tree/main/resources_pub/website
(you could create a 2nd hacktoberfest PR for your images, or just drop them into this ticket).

Being curious: Did you use genAI and if so which model? (no worries, this does not affect the approval).

Best regards,
Tobias

### @hashnj - 2024-10-01T12:17:09Z

thanks @tobiu for approving and providing me the opportunity to make 2 PRs, I will utilize both PRs.
For the blog I actually picked up some content ( points I thought I should mention ) from the references and used chatGPT to make it detailed and more readable and then humanized it :).


i have a doubt: in the blog section assist me with image, provider and publisher values

### @hashnj - 2024-10-02T19:06:43Z

hey @tobiu please assist me with adding the blog post inside the neo blog section, what should I mention in image , provider and publisher sections.
Also, I have created a PR in the neomjs/pages repo to add the author image but the repo is not a part of hacktoberfest , so please add hacktoberfest-accepted label to my PR.

I am so grateful, Thankyou. 

### @tobiu - 2024-10-02T19:41:43Z

thanks for the heads up. the `pages` repo is not included inside discord via a webhook, so i don't get notifications there. added the label and merged your PR.

the only rule for cover images is a width of 800px. you can take a screenshot of a bigger image and then reduce the size (on mac os inside preview => tools).

in case you are in need for ideas, i would just browse the examples:
https://neomjs.com/dist/production/apps/portal/#/examples/devmode

and take a screenshot of the one you like best.

Publisher would be an empty string in your case (medium does, but dev.to does not have them). Provider: `"Dev.to"`.

Best regards,
Tobi

### @hashnj - 2024-10-02T20:27:12Z

one last question, the image are referenced in .png format but I couldn't find where they are stored

### @tobiu - 2024-10-02T20:29:19Z

very close to the author images ;)

here: https://github.com/neomjs/pages/tree/main/resources_pub/website/blog

(give me a ping, in case you open another PR inside that repo please)

### @hashnj - 2024-10-02T20:58:46Z

hey @tobiu I have made PR's in both the repos i.e. pages and neo 
thankyou soo much i learned so much about navigating open source repositories.

### @hashnj - 2024-10-02T21:00:22Z

let me know if any change is needed ,
Thanks again :)

- 2024-10-02T22:18:44Z @tobiu referenced in commit `a085c21` - "#5987 fix for the author image file type"
### @tobiu - 2024-10-02T22:20:26Z

small typo inside the author image => jpeg instead of jpg. fixed it.

![Screenshot 2024-10-03 at 00 17 08](https://github.com/user-attachments/assets/aa8b0a8d-8cd0-420c-a27f-711f950f4c30)

your blog post will go online inside the neo website, once i publish the next release. definitely this week.

thx and best regards,
tobi

- 2024-10-02T22:20:26Z @tobiu closed this issue
### @tobiu - 2024-10-02T22:51:24Z

changed my mind and deployed it right away.

enjoy: https://neomjs.com/dist/production/apps/portal/#/blog

nap time now.

### @tobiu - 2024-10-03T14:28:07Z

I will change the title of this ticket to reflect your blog post title => since we can now use github sub-issues, others can easier spot which areas are already covered.

no further action required.

- 2024-10-03T14:28:37Z @tobiu changed title from **Write a Blog Post about Neo.mjs, number 3** to **Blog Post: Neo.mjs: A novel framework for high-performance web applications.**
- 2024-10-03T14:28:43Z @tobiu added the `Blog Post` label

