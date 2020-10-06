# neo.mjs command-line interface
This guide explains the different scripts (programs) which are included inside the package.json.</br>
They are important for working on the framework code base.

You can run each script inside your terminal.
Make sure to call them on the top-level folder (the one containing the package.json).

In case you want to create an App (workspace) based on neo.mjs, you don't need to clone this repository.</br>
Please take a look at <a href="https://github.com/neomjs/create-app">npx neo-app</a> in this case.

## Content
1. <a href="#build-all-questions">build-all-questions</a>
2. <a href="#build-all">build-all</a>
3. <a href="#build-my-apps">build-my-apps</a>
4. <a href="#build-themes">build-themes</a>
5. <a href="#build-threads">build-threads</a>
6. <a href="#create-app">create-app</a>
7. <a href="#generate-docs-json">generate-docs-json</a>
8. <a href="#server-start">server-start</a>

<h2 id="build-all-questions">build-all-questions</h2>

> npm run build-all-questions

This call matches:
> node ./buildScripts/buildAll.js -f -n

<h2 id="build-all">build-all</h2>
> npm run build-all

This call matches:
> node ./buildScripts/buildAll.js -f

<h2 id="build-my-apps">build-my-apps</h2>
> npm run build-my-apps

This call matches:
> node ./buildScripts/webpack/buildMyApps.js -f

<h2 id="build-themes">build-themes</h2>
> npm run build-themes

This call matches:
> node ./buildScripts/webpack/buildThemes.js -f

<h2 id="build-threads">build-threads</h2>
> npm run build-threads

This call matches:
> node ./buildScripts/webpack/buildThreads.js -f

<h2 id="create-app">create-app</h2>
> npm run create-app

This call matches:
> node ./buildScripts/createApp.js

<h2 id="generate-docs-json">generate-docs-json</h2>
> npm run generate-docs-json

This call matches:
> node ./buildScripts/docs/jsdocx.js

<h2 id="server-start">server-start</h2>
> npm run server-start

This call matches:
> webpack-dev-server --open