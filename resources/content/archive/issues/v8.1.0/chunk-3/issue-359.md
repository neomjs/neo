---
id: 359
title: 'Main Readme: Explain neo in a better way (elevator pitch)'
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
assignees:
  - tobiu
createdAt: '2020-03-21T21:04:12Z'
updatedAt: '2020-06-18T12:53:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/359'
author: tobiu
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-06-18T12:53:23Z'
---
# Main Readme: Explain neo in a better way (elevator pitch)

I got the feedback more and more often, that the main readme file is not compelling enough.

It should point out the key benefits of why using neo.mjs makes sense in a better way.

I am too deep into it, so for me many points are obvious and trivial and it is not easy to step back wide enough to change my perspective.

So, I do need your help on this one! :)

## Timeline

- 2020-03-21T21:04:12Z @tobiu added the `enhancement` label
- 2020-03-21T21:04:12Z @tobiu added the `help wanted` label
- 2020-03-21T21:04:12Z @tobiu added the `good first issue` label
### @tobiu - 2020-03-21T21:23:02Z

> I see these demos for neomjs posted often and I wanted to give some feedback : I don't understand what the point of it is. Demos of what it can do are nice but they all seem very... Odd use cases... The tool seems to be all about multithreading and I'm sure for the people working on it it's self explanatory but honestly... I have no idea what this thing could bring to me !
> 
> I mean the helix, looks cool, but it's unusable, navigating it makes no sense, so why should I care, I'm never going to need to do that any time soon...
> 
> If you're doing those demos for fun it's cool and have a good time, but I think it would be much better to work on explaining what the point of the tool is in simple terms, what common tool is it like, what is it different to. For the similar ones how is it different or better ?
> 
> I mean... It's a tool to display complex stuff ? How does it compare to D3, three.js, or maybe to Raphael or canvas libraries ? Or is it CSS Stuff ? What does the multi threading offer ?
> 
> Maybe I'm alone in this but I wonder if the communication efforts aren't going the wrong way with those demos that don't really make me curious at all...

> Hi Tobias !
> 
> Alright, I read the concept page, here's what I think after reading it : your tool is a framework to make apps with intensive frontend computation needs... I don't really have the words to spell it in simple terms. I think I get it, but I feel like I'm putting pieces together, when really the simple explanation of what your tool does should be the first sentence.
> 
> Multi threading, okay I get the idea, I rarely actually have that kind of issue when I'm making apps, or it's so rarely and "expectable" that to me that's not really an issue, but that makes me think that maybe this is for real time high volume apps ? Or apps with very high display computation work going on ? Some examples of real world needs for this would help, because for a todo it's not useful (but no framework is really useful for a todo app) but even for common web apps needs... I don't see it, and it seems to be the main selling point, so that kinda sucks.
> 
> The no JS Build in dev mode... That's nice... Not really something I would care about, and I don't know how sure you can be that you won't get new bugs after the build mode, which is a question I don't really have when I have a similar build for the dev and build... I mean it's an interesting idea, but Build in dev mode isn't a pain point at least for me, it's nice but that's about it.
> 
> The JSON templates... Big ouch for me. Or rather that'd be a cost if I had to pick that solution. You probably find it better which is why you're doing it of course, but I'm really not convinced and it looks to me like JSX and similar are a lot more developer friendly... Again, probably because I'm not thinking of the right apps to build with this, but since the examples I've seen don't really make sense and I'm not really picturing any actual app I know that would benefit from using it... I just see that there's thins big thing that is clearly not a good thing for me, this way of writing templates seems really painful.
> 
> So... Well this probably isn't for me, which is fine, on the Frontend spectrum I'm a lot closer to the design than I am to the high perf or backend side of things so it's not really surprising, but I think it would be nice if you made some things much easier to understand : what apps does everybody know would benefit from using neomjs, and what frameworks everybody knows are used right now to build what neomjs does better and why. Honestly I don't feel like this is spelled out clearly enough, and this is the Concept page which one would reach after getting on the homepage... And then on the "what's that' second click maybe, and then another one ? Eh, I don't think many people would get there, it should be on your homepage.
> 
> I think Svelte is a good example. The tagline isn't helpful, but aside from that it's pretty much an elevator pitch, it's like React or Vue, but it compiles to vanilla JS and has no virtual dom. Okay, I know React and Vue, I can grasp what's built with those, and I can tell what the difference does... Just like when startups say "We're the uber of music streaming" or whatever.
> 
> Anyways, I'm wishing you good time and successes on your project !

- 2020-03-21T21:26:15Z @tobiu changed title from **Main Readme: Explaining the framework in a better way (elevator pitch)** to **Main Readme: Explain neo in a better way (elevator pitch)**
### @msmfa - 2020-05-02T09:19:54Z

Can I take a crack at this?

### @tobiu - 2020-05-02T09:23:20Z

absolutely!

it already got a bit better after moving more items into: https://github.com/neomjs/neo/blob/dev/.github/CONCEPT.md

but there is imo still a lot of room for improvements.

one mid term goal is to create a project website (not just online demos), which should include a "non" technical elevator pitch.

- 2020-05-02T09:53:34Z @tobiu assigned to @msmfa
- 2020-06-18T10:25:03Z @tobiu unassigned from @msmfa
- 2020-06-18T10:25:04Z @tobiu assigned to @tobiu
### @tobiu - 2020-06-18T10:26:14Z

will work on this one a bit now. creating a README_new file first to see the changes and replace the current readme once it is done. definitely want to add the new video as well as the workers setup visualisation.

- 2020-06-18T10:28:06Z @tobiu referenced in commit `016318d` - "#359 copying the current readme content into readme_new"
- 2020-06-18T10:29:28Z @tobiu referenced in commit `2b47a0b` - "#359 readme_new: adjusted the latest blog post"
- 2020-06-18T10:40:21Z @tobiu referenced in commit `8d38001` - "#359 readme_new: Scalable frontend architectures"
- 2020-06-18T10:55:59Z @tobiu referenced in commit `113fb5d` - "#359 readme_new: covid app video preview image"
- 2020-06-18T10:58:06Z @tobiu referenced in commit `8977269` - "#359 readme_new: covid app video preview image"
- 2020-06-18T11:10:15Z @tobiu referenced in commit `ff14534` - "#359 readme_new: new covid app images"
- 2020-06-18T11:19:48Z @tobiu referenced in commit `e932a81` - "#359 readme_new: SW covid app"
- 2020-06-18T11:25:56Z @tobiu referenced in commit `4b5e285` - "#359 readme_new: color testing"
- 2020-06-18T11:27:21Z @tobiu referenced in commit `83be204` - "#359 readme_new: color testing"
- 2020-06-18T11:37:45Z @tobiu referenced in commit `7a95747` - "#359 readme_new: sw covid"
- 2020-06-18T11:41:15Z @tobiu referenced in commit `f15f7d1` - "#359 readme_new: sw covid"
- 2020-06-18T11:43:29Z @tobiu referenced in commit `5a6fb8d` - "#359 readme_new: sw covid"
- 2020-06-18T11:47:19Z @tobiu referenced in commit `b156e80` - "#359 readme_new: switched contributors & sponsors"
- 2020-06-18T11:58:28Z @tobiu referenced in commit `0706bdf` - "#359 readme_new: new intro text"
- 2020-06-18T12:00:23Z @tobiu referenced in commit `ec402d8` - "#359 readme_new: replaced the old readme file"
- 2020-06-18T12:53:23Z @tobiu closed this issue

