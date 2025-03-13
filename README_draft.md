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

# Build Ultra-Fast, Scalable, and Extensible Web Apps with Neo.mjs :zap:
:rocket: **Break Free from the Main Thread – Experience True Multi-Threading**

Neo.mjs enables the creation of highly dynamic web applications by running everything **inside an App Worker**.
From components and state providers to view controllers, everything operates within the worker,
allowing the main thread to focus only on **DOM updates** and **delegating UI events**.
This ensures **high performance, smooth reactivity**, and **extensibility** for both **multi-window** and **SPA applications**.

<p align="center">
  <a href="https://youtu.be/pYfM28Pz6_0"><img height="316px" width="400px" src="https://raw.githubusercontent.com/neomjs/pages/master/resources_pub/images/neo33s.png"></a>
  <a href="https://youtu.be/aEA5333WiWY"><img height="316px" width="400px" src="https://raw.githubusercontent.com/neomjs/pages/master/resources_pub/images/neo-movie.png"></a>
</p>

## Key Features
:rocket: **App Worker-Based Architecture**: Run all logic, state, components, and UI handling inside the App Worker,
keeping the main thread free for non-blocking DOM updates and UI interactions.

:arrows_counterclockwise: **Reactive State Management**: Built-in reactivity allows dynamic, efficient updates between components and state providers.

:performing_arts: **Actor Model**: The App Worker acts as the central actor, handling application state and logic, independent of the main thread.

:zap: **Instant Development Mode**: No need for builds—run your app directly in the browser, modify reactive properties in real-time, and see instant updates.

:bar_chart: **Hierarchical State Management**: Seamlessly manage state between parent and child components with nested state providers.

:jigsaw: **Clean Architecture**: View controllers ensure a **separation of concerns**, isolating business logic from UI components for easier maintenance and testing.

:globe_with_meridians: **Multi-Window & SPAs**: Easily build and manage complex, highly interactive applications that require multiple windows or traditional SPAs.

:cyclone: **Dynamic Component Management**: Unmount, move, and remount components across the UI or even in separate browser windows
— without losing the component’s state or logic. This **runtime flexibility** is a game-changer, **preserving JS instances** while still updating the UI dynamically.

:white_check_mark: **Instant Development Mode – Zero builds or transpilations** required.
Run apps directly in the browser, modify reactive properties on the fly, and debug live via the browser console.
You can even build **entire apps inside the console** if you wish. This gives you an **unmatched debugging experience**.

<img src="./resources/images/workers-focus.svg">

## :bulb: Perfect for Complex Use Cases
Need a **web-based IDE, banking dashboard**, or an **enterprise-grade multi-window app**? Neo.mjs is built for it.

## Why Neo.mjs?
Neo.mjs is designed for **extensible, scalable**, and **reactive** applications. By utilizing the App Worker and maintaining separation between logic and UI,
it ensures high performance while remaining highly dynamic and developer-friendly.

## :hammer_and_wrench: Get Started in Minutes
:one: Run `npx neo-app@latest` inside your terminal, and your new app will open inside a new browser window.

:book: More details? Check out our <a href="./.github/GETTING_STARTED.md">Getting Started</a> Guide

:student: Make sure to dive into the <a href="https://neomjs.com/dist/production/apps/portal/#/learn/gettingstarted.Setup">Learning Section</a>

:brain: The most advanced tutorial to help you with getting up to speed is this one:
<a href="https://neomjs.com/dist/production/apps/portal/#/learn/tutorials.Earthquakes">Earthquakes Tutorial</a>

## :handshake: Join the Community

:speech_balloon: Have questions? Join our <a href="https://join.slack.com/t/neomjs/shared_invite/zt-6c50ueeu-3E1~M4T9xkNnb~M_prEEOA">Slack channel</a> and connect with other developers.

:hammer_and_wrench: Want to contribute? Check out our <a href="https://github.com/neomjs/neo/blob/dev/CONTRIBUTING.md">Contributing Guide.

</br></br>
Copyright (c) 2015 - today, <a href="https://www.linkedin.com/in/tobiasuhlig/">Tobias Uhlig</a>
