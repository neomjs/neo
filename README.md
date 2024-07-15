<p align="center">
  <img height="100"src="https://raw.githubusercontent.com/neomjs/pages/main/resources/images/logo/neo_logo_text_primary.svg">
</p>
</br>
<p align="center">
  <a href="https://npmcharts.com/compare/neo.mjs?minimal=true"><img src="https://img.shields.io/npm/dm/neo.mjs.svg?label=Downloads" alt="Downloads"></a>
  <a href="https://www.npmjs.com/package/neo.mjs"><img src="https://img.shields.io/npm/v/neo.mjs.svg?logo=npm" alt="Version"></a>
  <a href="https://www.npmjs.com/package/neo.mjs"><img src="https://img.shields.io/npm/l/neo.mjs.svg?label=License" alt="License"></a>
  <a href="https://join.slack.com/t/neomjs/shared_invite/zt-6c50ueeu-3E1~M4T9xkNnb~M_prEEOA"><img src="https://img.shields.io/badge/Slack-neo.mjs-brightgreen.svg?logo=slack" alt="Join the Slack channel"></a>
  <a href="https://discord.gg/6p8paPq"><img src="https://img.shields.io/discord/656620537514164249?label=Discord&logo=discord&logoColor=white" alt="Discord Chat"></a>
  <a href="./CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-green.svg?logo=GitHub&logoColor=white" alt="PRs Welcome"></a>
</p>

# Harness the Power of Multi-Threading for Ultra-Fast Frontends

Neo.mjs is **not** intended for rather simple & static websites.

The framework does not focus primarily on a fast first rendering experience for new users,
but instead on a super-fast update & navigation experience for returning users.

Neo.mjs drives the OMT (off the main thread) paradigm into perfection,
which is intended to move expensive tasks into Workers.

> So, what are the most expensive tasks we are dealing with?
 
The answer is simple: a framework and the apps which we build with it.

Neo.mjs moves most parts of the framework and your App(s) including their Components
into an Application Worker.

This enables us to re-use existing Component instances and mount & unmount them
several times. Even into different Browser-Windows.

Neo.mjs also provides sharing state across multiple Browser-Windows.

So far, it is the only framework which enables us to build complex multi-Window Apps
without the need for a native shell.

<img src="https://raw.githubusercontent.com/neomjs/pages/main/resources/images/workers-setup-v4.png">

</br></br>

[Spoiler] We are in the middle of wrapping up the new Framework Website,
which will include the first version of a self-study based Learning Section.

We are aiming to release it on August 1st, 2024.

The current development state is already inside the dev branch.


</br></br>
Copyright (c) 2015 - today, <a href="https://www.linkedin.com/in/tobiasuhlig/">Tobias Uhlig</a>
& <a href="https://www.linkedin.com/in/richwaters/">Rich Waters</a>
