# Codebase Overview

Neo.mjs uses a mono-repo structure and the the folders should be mostly self explanatory.

## apps

This contains demo apps created with the <a href="../buildScripts/createApp.js" target="_blank">createApp</a> build script. Demo apps are created together in this repo, to allow for work on the framework source in parallel. (Note: The createApp build script creates a neo.mjs app shell within this repository's app folder.) Once a demo app is done, `npx neo-app` will create a new shell and move it into the <a href="https://github.com/neomjs/" rel="_blank">neo namespace</a>.

## buildScripts

This contains the nodejs based programs such as <a href="../buildScripts/createApp.js" rel="_blank">createApp</a>. The tooling (webpack) to create the dist versions, themes & docs output.

## dist

This should NOT be checked into version control. It will get generated from build scripts. Please do not remove from `.gitignore`.

## docs

This contains the codebase for the documentation site and the docs output (generated with the geneate-docs-json script). The documentation app is build using neo.mjs. Take a look at the API section of the <a href="https://neomjs.github.io/pages/node_modules/neo.mjs/docs/index.html" rel="_blank">online version</a> of the online version for Chrome v80+ to get an idea about the class heirarchy of neo.mjs.

## examples

This contains examples of various UI elements. Many of the UI elements get added into the docs app (examples section).

## node_modules

This should NOT be checked into version control. Please do not remove from `.gitignore`.

## src
This contains the bulk of the framework code. You will spend most of your time working here.

## resources

This contains mostly static assests such as style sheets and images for the neo themes (dark and light thenes) and structuring.

## test

This contains the siesta based unit & user interaction tests. This part definitely needs more love and contribution.

<br>

## Slack Channel for questions & feedback

There are some Javascript legends hiding in the shadows and waiting to be discovered.</br>
Join our community:
<a href="https://join.slack.com/t/neotericjs/shared_invite/enQtNDk2NjEwMTIxODQ2LWRjNGQ3ZTMzODRmZGM2NDM2NzZmZTMzZmE2YjEwNDM4NDhjZDllNWY2ZDkwOWQ5N2JmZWViYjYzZTg5YjdiMDc">Slack Channel Invite Link</a>

Build with :heart: in Germany

<br>
<br>
Copyright (c) 2015 - today, <a href="https://www.linkedin.com/in/tobiasuhlig/">Tobias Uhlig</a>
& <a href="https://www.linkedin.com/in/richwaters/">Rich Waters</a>
