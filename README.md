<p align="center">
  <img height="100"src="https://raw.githubusercontent.com/neomjs/pages/main/resources_pub/images/logo/neo_logo_text_primary.svg">
</p>
</br>
<p align="center">
  <a href="https://npmcharts.com/compare/neo.mjs?minimal=true"><img src="https://img.shields.io/npm/dm/neo.mjs.svg?label=Downloads" alt="Downloads"></a>
  <a href="https://www.npmjs.com/package/neo.mjs"><img src="https://img.shields.io/npm/v/neo.mjs.svg?logo=npm" alt="Version"></a>
  <a href="https://www.npmjs.com/package/neo.mjs"><img src="https://img.shields.io/npm/l/neo.mjs.svg?label=License" alt="License"></a>
  <a href="https://join.slack.com/t/neomjs/shared_invite/zt-6c50ueeu-3E1~M4T9xkNnb~M_prEEOA"><img src="https://img.shields.io/badge/Slack-Neo.mjs-brightgreen.svg?logo=slack" alt="Join the Slack channel"></a>
  <a href="https://discord.gg/6p8paPq"><img src="https://img.shields.io/discord/656620537514164249?label=Discord&logo=discord&logoColor=white" alt="Discord Chat"></a>
  <a href="./CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-green.svg?logo=GitHub&logoColor=white" alt="PRs Welcome"></a>
</p>

# Harness the Power of Multi-Threading for Ultra-Fast Frontends

## Content
1. <a href="#introduction">Introduction</a>
2. <a href="#slack-channel">Slack Channel for questions & feedback</a>
3. <a href="#architectures">Scalable frontend architectures</a>
4. <a href="#getting-started">Getting Started</a>
5. <a href="#cli">Command-Line Interface</a>
6. <a href="#blog">Blog</a>

</br></br>
<h2 id="introduction">1. Introduction</h2>
Neo.mjs is **not** intended for rather simple & static websites.

The Framework does not focus primarily on a fast first rendering experience for new users,
but instead on a super-fast update & navigation experience for returning users.

Neo.mjs drives the OMT (off the main thread) paradigm into perfection,
which is intended to move expensive tasks into Workers.

> So, what are the most expensive tasks we are dealing with?

The answer is simple: a Framework and the Apps which we build with it.

Neo.mjs moves most parts of the framework and your App(s) including their Components
into an Application Worker.

This enables us to re-use existing Component instances and mount & unmount them
several times. Even into different Browser-Windows.

Neo.mjs also provides sharing state across multiple Browser-Windows.

So far, it is the only Framework which enables us to build complex multi-Window Apps
without the need for a native shell.

<img src="https://raw.githubusercontent.com/neomjs/pages/main/resources_pub/images/workers-setup-v4.png">

Potential Use-Cases:
1. Finance (Banking & Trading Apps)
2. Data Science
3. Web-based IDEs
4. Multi-Window Data Visualisation

</br></br>
<h2 id="slack-channel">2. Slack Channel for questions, ideas & feedback</h2>
Join our community:</br>
<a href="https://join.slack.com/t/neomjs/shared_invite/zt-6c50ueeu-3E1~M4T9xkNnb~M_prEEOA"><img src="https://img.shields.io/badge/Slack-neo.mjs-brightgreen.svg?logo=slack&style=for-the-badge" alt="Join the Slack channel"></a>

</br></br>
<h2 id="getting-started">4. Getting Started</h2>
Take a look at the <a href="./.github/GETTING_STARTED.md">Getting Started Guide</a>
</br></br>
There are 2 options:</br>
In case you want to create a Neo.mjs App (workspace), use:
> npx neo-app@latest
 
In case you want to work on the Framework and your App in parallel,
you can fork this repository and use
> npm run create-app

inside of it.

1. You can easily move your app from the framework to a workspace or vice versa.
2. The CLI inside the framework and inside a workspace works the same.

Also take a look into the <a href="https://neomjs.com/dist/production/apps/portal/#/learn/Setup">Learning Section</a>

The most advanced tutorial to help you with getting up to speed is this one:</br>
<a href="https://neomjs.com/dist/production/apps/portal/#/learn/Earthquakes">Earthquakes Tutorial</a>

</br></br>
<h2 id="cli">5. Command-Line Interface</h2>
You can find an in-depth description here: <a href="./buildScripts/README.md">Neo.mjs CLI</a>

</br></br>
<h2 id="blog">6. Blog</h2>
All Blog Posts are listed here: <a href="https://neomjs.com/dist/production/apps/portal/#/blog">Neo.mjs Blog</a>

</br></br>
Copyright (c) 2015 - today, <a href="https://www.linkedin.com/in/tobiasuhlig/">Tobias Uhlig</a>
& <a href="https://www.linkedin.com/in/richwaters/">Rich Waters</a>
