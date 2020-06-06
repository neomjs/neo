# Codebase Overview
Neo.mjs uses a mono-repo structure and the the folders should be mostly self explanatory.

## apps
This contains demo apps created with the <a href="https://github.com/neomjs/create-app" rel="_blank">create-app</a> script. Demo apps are created together in this repo, to allow for work on the framework source in parallel. Once a demo app is done, `npx neo-app` will createa a new shell and move it into the <a href="https://github.com/neomjs/" rel="_blank">neo namespace</a>.

## buildScripts
This contains the nodejs based programs as well as <a href="https://github.com/neomjs/create-app" rel="_blank">create-app</a>. The tooling (webpack) to create the dist versions, themes & docs output.

## dist
This should NOT be checked into version control. It will get generated from build scripts. Please do not remove from `.gitignore`.

## docs
This contains the codebase for the documentation site and the docs output (generated with the geneate-docs-json script). The documentation app is build using neo.mjs. Take a look at the API section of the <a href="https://neomjs.github.io/pages/node_modules/neo.mjs/docs/index.html" rel="_blank">online version</a> of the online version for Chrome v80+ to get an idea about the class heirarchy of neo.mjs.

## examples
This contains examples of various UI elements. Many of the UI elements get added into the docs app (examples section).

## node_modules
This should NOT be checked into version control. Please do not remove from `.gitignore`.

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