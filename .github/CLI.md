# command-line interface
In case you want to create an App (workspace) based on neo.mjs, you don't need to clone this repository.</br>
Please take a look at <a href="https://github.com/neomjs/create-app">npx neo-app</a> in this case.

This guide explains the different scripts (programs) which are included inside the package.json.</br>
They are important for working on the framework code base.

You can run each script inside your terminal. E.g.:
> npm run build-all

Make sure to call them on the top-level folder (the one containing the package.json).

In case you want to pass program options, please use the node based calls instead. E.g.:
> node ./buildScripts/buildAll.js -f

You will notice that all programs are using the -f option here.
The reason is that you can call them inside your neo.mjs workspaces as well,
where the framework is included as a node module, but needs to deploy to a top-level dist folder.

## Content
1. <a href="#build-all">build-all</a>
2. <a href="#build-all-questions">build-all-questions</a>
3. <a href="#build-my-apps">build-my-apps</a>
4. <a href="#build-themes">build-themes</a>
5. <a href="#build-threads">build-threads</a>
6. <a href="#create-app">create-app</a>
7. <a href="#generate-docs-json">generate-docs-json</a>
8. <a href="#server-start">server-start</a>

## build-all
> node ./buildScripts/buildAll.js -f -n

```
Options:
  -V, --version            output the version number
  -i, --info               print environment debug info
  -e, --env <name>         "all", "dev", "prod"
  -l, --npminstall <name>  "yes", "no"
  -f, --framework          
  -n, --noquestions        
  -p, --parsedocs <name>   "yes", "no"
  -t, --themes <name>      "yes", "no"
  -w, --threads <name>     "yes", "no"
  -h, --help               display help for command
```

## build-all-questions
> node ./buildScripts/buildAll.js -f

## build-my-apps
> node ./buildScripts/webpack/buildMyApps.js -f

## build-themes
> node ./buildScripts/webpack/buildThemes.js -f

## build-threads
> node ./buildScripts/webpack/buildThreads.js -f

## create-app
> node ./buildScripts/createApp.js

## generate-docs-json
> node ./buildScripts/docs/jsdocx.js

## server-start
> webpack-dev-server --open