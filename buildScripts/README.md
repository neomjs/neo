# Command-Line Interface
In case you want to create an App (workspace) based on neo.mjs, you don't need to clone this repository.</br>
Please take a look at the <a href="https://github.com/neomjs/create-app">create-app repository</a> (npx neo-app).

This guide explains the different scripts (programs) which are included inside the
<a href="../package.json">package.json</a>.</br>
They are important for working on the framework code base.

You can run each script inside your terminal. E.g.:
> npm run build-all

Make sure to call them on the top-level folder (the one containing the package.json).

In case you want to pass program options, use -- before adding options. E.g.:
> npm run build-all -- -h

All programs which are using options also have the visual inquirer interface in place.</br>
So it is up to you if you prefer adding the options manually (e.g. for adding them into your own CI),</br>
or selecting them without memorising the shortcuts.

You will notice that most programs are using the -f (framework) option here.
The reason is that you can call them inside your neo.mjs workspaces as well,
where the framework is included as a node module, but needs to deploy to a top-level dist folder.

## Content
1. <a href="#build-all">build-all</a>
2. <a href="#build-all-questions">build-all-questions</a>
3. <a href="#build-themes">build-themes</a>
4. <a href="#build-threads">build-threads</a>
5. <a href="#create-app">create-app</a>
6. <a href="#generate-docs-json">generate-docs-json</a>
7. <a href="#server-start">server-start</a>

## build-all
> npm run build-all

It is strongly recommended to run this program after each git pull on this repo.

```bash
Options:
  -V, --version             output the version number
  -i, --info                print environment debug info
  -e, --env <value>         "all", "dev", "prod"
  -l, --npminstall <value>  "yes", "no"
  -f, --framework          
  -n, --noquestions        
  -p, --parsedocs <value>   "yes", "no"
  -t, --themes <value>      "yes", "no"
  -w, --threads <value>     "yes", "no"
  -h, --help                display help for command
```

The build-all program is using the -n (noquestions) option.
Take a look at the next section for details on those.

1. The program starts with a npm install(-l option).
2. It builds the themes next (-t option) => <a href="#build-themes">build-themes</a>.
3. It builds the threads (-w option) => <a href="#build-threads">build-threads</a>.</br>
(-w is a shortcut for "workers", since -t was already taken.)
4. It parses the docs comments (-p option) => <a href="#generate-docs-json">generate-docs-json</a>.

You can disable each step using the program options.

build-all will delegate the env, framework & noquestions options to build-themes & build-threads.

You can use the -e (environment) option in case you want to limit the build either to dist/development
or dist/production.

Source code: <a href="./buildAll.js">build-all</a>

## build-all-questions
> npm run build-all-questions

This entry point is running the build-all program without passing options,
so we can select them using the inquirer interface.

Let us take a look at the different inquirer steps:
1. Pick the -l (npminstall) option:
```bash
neo % npm run build-all-questions

> neo.mjs@1.4.14 build-all-questions /Users/Shared/github/neomjs/neo
> node ./buildScripts/buildAll.js -f

neo.mjs buildAll
? Run npm install?: (Use arrow keys)
❯ yes 
  no 
```
2. Pick the -e (env) option:
```bash
neo.mjs buildAll
? Run npm install?: yes
? Please choose the environment: (Use arrow keys)
❯ all 
  dev 
  prod 
```
3. Pick the -t (themes) option:
```bash
neo.mjs buildAll
? Run npm install?: yes
? Please choose the environment: all
? Build the themes? (Use arrow keys)
❯ yes 
  no 
```
4. Pick the -w (threads) option:
```bash
neo.mjs buildAll
? Run npm install?: yes
? Please choose the environment: all
? Build the themes? yes
? Build the threads? (Use arrow keys)
❯ yes 
  no 
```
5. Pick the -p (parsedocs) option:
```bash
neo.mjs buildAll
? Run npm install?: yes
? Please choose the environment: all
? Build the themes? yes
? Build the threads? yes
? Trigger the jsdocx parsing? (Use arrow keys)
❯ yes 
  no 
```

Source code: <a href="./buildAll.js">build-all</a>

## build-themes
> npm run build-themes

```bash
Options:
  -V, --version          output the version number
  -i, --info             print environment debug info
  -c, --cssVars <value>  "all", "true", "false"
  -e, --env <value>      "all", "dev", "prod"
  -f, --framework       
  -n, --noquestions     
  -t, --themes <value>   "all", "dark", "light"
  -h, --help             display help for command
```

Let us take a look at the different inquirer steps:
1. Pick the -t (themes) option:
```bash
neo % npm run build-themes

> neo.mjs@1.4.14 build-themes /Users/Shared/github/neomjs/neo
> node ./buildScripts/webpack/buildThemes.js -f

neo.mjs buildThemes
? Please choose the themes to build: (Use arrow keys)
❯ all 
  dark 
  light 
```
2. Pick the -e (env) option:
```bash
neo.mjs buildThemes
? Please choose the themes to build: all
? Please choose the environment: (Use arrow keys)
❯ all 
  dev 
  prod 
```
3. Pick the -c (cssVars) option:
```bash
neo.mjs buildThemes
? Please choose the themes to build: all
? Please choose the environment: all
? Build using CSS variables? (Use arrow keys)
  all 
❯ yes 
  no 
```

Source code: <a href="./webpack/buildThemes.js">build-themes</a>

## build-threads
> npm run build-threads

Since the default neo.mjs setup is using 3 workers, we have the following 4 threads to build:</br>
"app", "data", "main", "vdom"

Most of the framework code base & the apps you build with it run inside the App Worker,</br>
so most of the time you only need to build the app thread.

```bash
Options:
  -V, --version          output the version number
  -i, --info             print environment debug info
  -e, --env <value>      "all", "dev", "prod"
  -f, --framework       
  -n, --noquestions     
  -t, --threads <value>  "all", "app", "data", "main", "vdom"
  -h, --help             display help for command
```

Let us take a look at the different inquirer steps:
1. Pick the -t (threads) option:
```bash
neo % npm run build-threads

> neo.mjs@1.4.14 build-threads /Users/Shared/github/neomjs/neo
> node ./buildScripts/webpack/buildThreads.js -f

neo.mjs buildThreads
? Please choose the threads to build: (Use arrow keys)
❯ all 
  app 
  data 
  main 
  vdom 
```
2. Pick the -e (env) option:
```bash
neo.mjs buildThreads
? Please choose the threads to build: all
? Please choose the environment: (Use arrow keys)
❯ all 
  dev 
  prod 
```

Source code: <a href="./webpack/buildThreads.js">build-threads</a>

## create-app
> npm run create-app

Again: In case you want to create an App (workspace) based on neo.mjs, you don't need to clone this repository.</br>
Please take a look at the <a href="https://github.com/neomjs/create-app">create-app repository</a> (npx neo-app).

If you want to create a new Demo App inside the framework repo,
using the create-app program makes sense, since you can work on the app & framework code in parallel.

Using the default options, this will generate the following 4 files:
```
neo
 | - apps
 |    | - myapp
 |    |    | - app.mjs
 |    |    | - index.html
 |    |    | - neo-config.json
 |    |    | - MainContainer.mjs
```

The program will also add the App config into buildScripts/webpack/json/myApps.json.
```json
"apps": [
    "Docs",
    "MyApp"
]
```
This file is added inside the .gitignore.</br>
If the file does not exist yet, the program will copy buildScripts/webpack/json/myApps.template.json to create it.

```bash
Options:
  -V, --version                   output the version number
  -i, --info                      print environment debug info
  -a, --appName <value>           
  -m, --mainThreadAddons <value>  Comma separated list of AmCharts, AnalyticsByGoogle, HighlightJS, LocalStorage,
                                  MapboxGL, Markdown, Siesta, Stylesheet.
                                  Defaults to Stylesheet
  -t, --themes <value>            "all", "dark", "light"
  -u, --useSharedWorkers <value>  "yes", "no"
  -h, --help                      display help for command
```

Let us take a look at the different inquirer steps:
1. Pick the -a (appName) option:
```bash
neo % npm run create-app

> neo.mjs@1.4.14 create-app /Users/Shared/github/neomjs/neo
> node ./buildScripts/createApp.js

neo.mjs create-app
? Please choose a name for your neo app: (MyApp) 
```
2. Pick the -t (themes) option:
```bash
neo.mjs create-app
? Please choose a name for your neo app: MyApp
? Please choose a theme for your neo app: (Use arrow keys)
  neo-theme-dark 
  neo-theme-light 
❯ both 
```
3. Pick the -m (mainThreadAddons) option:
```bash
neo.mjs create-app
? Please choose a name for your neo app: MyApp
? Please choose a theme for your neo app: both
? Please choose your main thread addons: (Press <space> to select, <a> to toggle all, <i> to invert selection)
❯◯ AmCharts
 ◯ AnalyticsByGoogle
 ◯ HighlightJS
 ◯ LocalStorage
 ◯ MapboxGL
 ◯ Markdown
 ◯ Siesta
(Move up and down to reveal more choices)
```
4. Pick the -u (useSharedWorkers) option:
```bash
neo.mjs create-app
? Please choose a name for your neo app: MyApp
? Please choose a theme for your neo app: both
? Please choose your main thread addons: Stylesheet
? Do you want to use SharedWorkers? Pick yes for multiple main threads (Browser Windows): (Use arrow keys)
  yes 
❯ no 
```

No worries, you can easily change the options after you created your App shell.

E.g. in case you want to add the MapboxGL main thread addon later on,
you can add it inside your neo-config.json file:
```json
{
    "appPath"         : "apps/myapp/app.mjs",
    "basePath"        : "../../",
    "environment"     : "development",
    "mainPath"        : "./Main.mjs",
    "mainThreadAddons": ["DragDrop", "MapboxGL", "Navigator", "Stylesheet"]
}
```

Regarding the -u (SharedWorkers) option:</br>
Only use it in case you want to create an App which uses multiple main threads (Browser Windows).</br>
Even in this case I recommend to start without it and switch at the point when your App is ready to connect
a second one, since it does make the debugging more complicated.

With normal Workers, you can get console logs & error messages inside your Browser Tab dev tools.</br>
Using SharedWorkers, you need to open a separate Window to inspect them:</br>
> chrome://inspect/#workers

Source code: <a href="./buildScripts/createApp.js">create-app</a>

## generate-docs-json
> npm run generate-docs-json

neo.mjs is using jsdoc
> https://github.com/jsdoc/jsdoc

to parse code comments and get the input we need for the Docs App.
More precisely, our parser is based on:
> https://github.com/onury/jsdoc-x

to get the output in json based format.
There are several enhancements around it to polish it for our class system improvements. 

Source code: <a href="./docs/jsdocx.js">generate-docs-json</a>

## server-start
> npm run server-start

To open JS modules locally inside your Browser you need a web-server, since importing files is not possible
otherwise for security reasons. You could enable this on an OS level, but this is definitely not recommended.

One option is to use
> https://github.com/webpack/webpack-dev-server

We are running the server on the repository root folder, since we want to access the apps & examples
folders directly for the development mode.

Normally this server does get mapped to the dist folder, which enables hot module replacements for
dist/development. Since the neo.mjs development mode runs without any JS builds or transpilations,
this is not really needed.

There is a ticket for it (low prio):
> https://github.com/neomjs/neo/issues/96

I am mostly using the WebStorm IDE web-server instead, which works fine as well.
