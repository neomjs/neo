<p align="center">
  <a href="https://npmcharts.com/compare/neo.mjs?minimal=true"><img src="https://img.shields.io/npm/dm/neo.mjs.svg" alt="Downloads"></a>
  <a href="https://www.npmjs.com/package/neo.mjs"><img src="https://img.shields.io/npm/v/neo.mjs.svg" alt="Version"></a>
  <a href="https://www.npmjs.com/package/neo.mjs"><img src="https://img.shields.io/npm/l/neo.mjs.svg" alt="License"></a>
  <a href="https://discord.gg/6p8paPq"><img src="https://img.shields.io/discord/656620537514164249?label=discord%20chat" alt="Chat"></a>
  <a href="./CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-green.svg" alt="PRs Welcome"></a>
</p>

# Welcome to neo.mjs!
neo.mjs enables you to create scalable & high performant Apps using more than just one CPU,
without the need to take care of a workers setup or the cross channel communication on your own.

## Content
1. <a href="#sponsors">Sponsors</a>
2. <a href="#architectures">Scalable frontend architectures</a>
3. <a href="#covid19-app">COVID19 IN NUMBERS Demo App</a>
4. <a href="#sw-covid19-app">Multi Window COVID19 IN NUMBERS Demo App</a>
5. <a href="#what-if-">What if ...</a> (Short overview of the concept & design goals)
6. <a href="#learn-more">Want to learn more?</a>
7. <a href="#impossible">Impossible? Pick with caution!</a>
8. <a href="#online-examples">Online Examples</a>
9. <a href="#online-docs">Online Docs</a>
10. <a href="#get-started">Ready to get started?</a>
11. <a href="#project-history">Project History</a>
12. <a href="#story--vision">Story & Vision</a>
13. <a href="#contributors">neo.mjs is in need of more contributors!</a>
14. <a href="#sponsors1">neo.mjs is in need of more sponsors!</a>
15. <a href="#slack-channel">Slack Channel for questions & feedback</a>

<!-- Sponsors -->
<h2 id="sponsors">Sponsors</h2>
<h3 align="center">Bronze Sponsors</h3>
<!--bronze start-->
<table>
  <tbody>
    <tr>
      <td align="center" valign="middle">
        <a href="http://www.stream4.tech/">
          <img width="150px" src="https://raw.githubusercontent.com/neomjs/pages/master/sponsors/bronze/stream4tech.png">
        </a>
      </td>
      <td align="center" valign="middle">
        <a href="https://github.com/sponsors/tobiu">
          <img width="150px" src="https://raw.githubusercontent.com/neomjs/pages/master/sponsors/sponsor_you.jpg">
        </a>
      </td>
    </tr>
  </tbody>
</table>
<!--bronze end-->

<!-- Scalable frontend architectures -->
<h2 id="architectures">Scalable frontend architectures</h2>
<img src="https://raw.githubusercontent.com/neomjs/pages/master/resources/images/workers_setup.png">

<!-- COVID19 IN NUMBERS Demo App -->
<h2 id="covid19-app">COVID19 IN NUMBERS Demo App</h2>

The most compelling way to introduce a new framework might simply be to show what you can do with it.

<a href="https://neomjs.github.io/pages/node_modules/neo.mjs/dist/production/apps/covid/index.html#mainview=table">Live Demo: COIN App dist/production</a></br>
Desktop only => support for mobile devices is on the roadmap.

Demo Video on YouTube:</br>
<a href="https://www.youtube.com/watch?v=8lqNVaoGNdU"><img src="https://raw.githubusercontent.com/neomjs/pages/master/resources/images/covid_app_vid.png"></a></br>

You can find the code of the covid app <a href="https://github.com/neomjs/neo/tree/dev/apps/covid">here</a>.

<img src="https://raw.githubusercontent.com/neomjs/pages/master/resources/images/covidDashboard/v3/table.png">

<img src="https://raw.githubusercontent.com/neomjs/pages/master/resources/images/covidDashboard/v3/gallery.png">

<img src="https://raw.githubusercontent.com/neomjs/pages/master/resources/images/covidDashboard/v3/helix.png">

<img src="https://raw.githubusercontent.com/neomjs/pages/master/resources/images/covidDashboard/v3/world.png">

<!-- SW COVID19 IN NUMBERS Demo App -->
<h2 id="sw-covid19-app">Multi Browser Window COVID19 IN NUMBERS Demo App</h2>
Blog post: <a href="https://medium.com/swlh/expanding-single-page-apps-into-multiple-browser-windows-e6d9bd155d59?source=friends_link&sk=bbfe1dada95c5674669e463f93360822">Expanding Single Page Apps into multiple Browser Windows</a></br>
</br>
<a href="https://neomjs.github.io/pages/node_modules/neo.mjs/apps/sharedcovid/index.html#mainview=table">Live Demo: COIN App (Multi Window)</a></br>
Chrome v83+ only (until adjusting the build processes).</br>
Desktop only.</br>
</br>
Demo Video on YouTube:</br>
<a href="https://youtu.be/n7m7ZT1kXQk"><img src="https://raw.githubusercontent.com/neomjs/pages/master/resources/images/expanding_spa_vid.png"></a></br>

You can find the code of the multi window covid app <a href="https://github.com/neomjs/neo/tree/dev/apps/sharedcovid">here</a>.

<img src="https://raw.githubusercontent.com/neomjs/pages/master/resources/images/covidDashboard/sw_covid.png">

<!-- What If -->
<h2 id="what-if-">Short overview of the concept & design goals</h2>

<table>
    <tr>
        <th></th>
        <th>What if ...</th>
        <th>Benefit</th>
    </tr>
    <tr>
        <td>1.</td>
        <td>... a framework & all the apps you build are running inside a separate thread (web worker)?</td>
        <td>You get extreme Performance</td>
    </tr>
    <tr>
        <td>2.</td>
        <td>... the main thread would be mostly idle, only applying the real dom manipulations,
            so there are no background tasks slowing it down?</td>
        <td>You get extreme UI responsiveness</td>
    </tr>
    <tr>
        <td>3.</td>
        <td>... a framework was fully built on top of ES8, but can run inside multiple workers without any Javascript builds?</td>
        <td>Your development speed will increase</td>
    </tr>
    <tr>
        <td>4.</td>
        <td>... you don’t need source-maps to debug your code, since you do get the real code 1:1?</td>
        <td>You get a smoother Debugging Experience</td>
    </tr>
    <tr>
        <td>5.</td>
        <td>... you don’t have to use string based pseudo XML templates ever again?</td>
        <td>You get unreached simplicity, no more scoping nightmares</td>
    </tr>
    <tr>
        <td>6.</td>
        <td>... you don’t have to use any sort of templates at all, ever again?</td>
        <td>You gain full control!</td>
    </tr>
    <tr>
        <td>7.</td>
        <td>... you can use persistent JSON structures instead?</td>
        <td>You gain more simplicity</td>
    </tr>
    <tr>
        <td>8.</td>
        <td>... there is a custom virtual dom engine in place, which is so fast,
            that it will change your mind about the performance of web based user interfaces?</td>
        <td>You get extreme performance</td>
    </tr>
    <tr>
        <td>9.</td>
        <td>... the ES8 class system gets enhanced with a custom config system,
            making it easier to extend and work with config driven design patterns?</td>
        <td>Extensibility, a robust base for solid UI architectures</td>
    </tr>
    <tr>
        <td>10.</td>
        <td>... your user interfaces can truly scale?</td>
        <td>You get extreme Performance</td>
    </tr>
</table>

<!-- Want to learn more? -->
<h2 id="learn-more">Want to learn more?</h2>

<a href=".github/CONCEPT.md">neo.mjs Concepts</a>

<!-- Impossible? Pick with caution! -->
<h2 id="impossible">Impossible? Pick with caution!</h2>

<a href="https://en.wikipedia.org/wiki/Red_pill_and_blue_pill"><img alt="blue or red pill" src="https://raw.githubusercontent.com/neomjs/pages/master/resources/images/redorbluepill.png"></a>

Still here? Welcome to neo.mjs - The webworkers driven UI framework

<!-- Online Examples -->
<h2 id="online-examples">Online Examples</h2>

You can find a full list of (desktop based) online examples here:</br>
<a href="https://neomjs.github.io/pages/">Online Examples</a>

You can pick between the 3 modes (development, dist/development, dist/production) for each one.

<!-- Online Docs -->
<h2 id="online-docs">Online Docs</h2>

The Online Docs are also included inside the Online Examples.

dist/production does not support lazy loading the examples yet, but works in every browser:</br>
<a href="https://neomjs.github.io/pages/node_modules/neo.mjs/dist/production/docs/index.html">Online Docs (dist/production)</a>

The development mode only works on Chrome 80+, but does lazy load the example apps:</br>
<a href="https://neomjs.github.io/pages/node_modules/neo.mjs/docs/index.html">Online Docs (dev mode)</a>

Hint: As soon as you create your own apps, you want to use the docs app locally,</br>
since this will include the documentation for your own apps.

<!-- Ready to get started? -->
<h2 id="get-started">Ready to get started?</h2>

There are 3 different ways on how you can get the basics running locally.</br>
Please take a look at the <a href=".github/GETTING_STARTED.md">Getting Started Guide</a>.

<!-- Project History -->
<h2 id="project-history">Project History</h2>

neo.mjs got released to the public on November 23, 2019.</br>
Before this point, the project was already at 3720 commits.<br>
Find out more about the start of it inside the <a href=".github/NEOMJS_HISTORY.md">Project History</a> file.

<!-- Story & Vision -->
<h2 id="story--vision">Story & Vision</h2>

Although neo.mjs is ready to craft beautiful & blazing fast UIs,</br>
the current state is just a fraction of a bigger picture.

Take a look at the <a href=".github/STORY.md">Project Story</a> and <a href=".github/VISION.md">Vision</a>.

<!-- neo.mjs is in need of more contributors! -->
<h2 id="contributors">neo.mjs is in need for more contributors!</h2>

Another way to fasten up the neo.mjs development speed is to actively jump in.</br>
As the shiny "PRs welcome" badge suggests: open source is intended to be improved by anyone who is up for the challenge.

You can also write a guide in case you learned something new using neo.mjs or just help to get more eyes on this project.

Either way, here are more infos: <a href="./CONTRIBUTING.md">Contributing</a>

<!-- neo.mjs is in need of more sponsors! -->
<h2 id="sponsors1">neo.mjs is in need for more sponsors!</h2>

Is the current code base useful for you or could it be in the future?</br>
Do you like the neo.mjs concepts?</br>
So far the development was made possible with burning all of my (tobiu's) personal savings.</br>

This is obviously not sustainable, so to enable me to keep pushing like this, please support it.</br>
The benefit of doing so is to get results delivered faster.

Here you go: <a href="./BACKERS.md">Sponsors & Backers</a>

<!-- Slack Channel for questions & feedback -->
<h2 id="slack-channel">Slack Channel for questions & feedback</h2>

There are some Javascript legends hiding in the shadows and waiting to be discovered.</br>
Join our community:
<a href="https://join.slack.com/t/neotericjs/shared_invite/enQtNDk2NjEwMTIxODQ2LWRjNGQ3ZTMzODRmZGM2NDM2NzZmZTMzZmE2YjEwNDM4NDhjZDllNWY2ZDkwOWQ5N2JmZWViYjYzZTg5YjdiMDc">Slack Channel Invite Link</a>

Build with :heart: in Germany.

<br><br>
Copyright (c) 2015 - today, <a href="https://www.linkedin.com/in/tobiasuhlig/">Tobias Uhlig</a>
& <a href="https://www.linkedin.com/in/richwaters/">Rich Waters</a>
