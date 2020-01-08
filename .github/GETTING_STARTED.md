# neo.mjs: Getting Started Guide
The following guide is intended to get this repository running locally.<br>
In case you want to create a neo.mjs App, you have 3 different options:

1. Use <a href="https://github.com/neomjs/create-app">npx neo-app</a>
2. Fork the <a href="https://github.com/neomjs/workspace">neo.mjs workspace</a>
3. Follow this guide (Step 6 creates a new App inside neo/apps)

## Get this repository running locally
1. Clone this repo to your system to get the project files
   ```sh
   git clone https://github.com/neomjs/neo.git
   ```

2. Open the checked out top level folder inside your terminal
   ```sh
   cd neo
   ```

3. Install the required node modules & run all relevant build scripts at once
   ```sh
   npm run build-all
   ```

   (See the <a href="../docs/tutorials/10_BuildScripts.md">Build Scripts Guide</a> for further details.)

4. Make sure to use a local WebServer!
   * Use a local webserver of your choice
   * OR `npm run server-start`

   (JS module imports can not work on the local file system (security).)
   
5. Optional: `npm run create-app`

#### You can run the examples & docs app **without** any JS build directly:  
> localhost/neo/docs/
>
> localhost/neo/examples/component/helix/

#### This does require setting a Chrome flag ( until Chrome v80; strongly recommended for development!).
> chrome://flags/#enable-experimental-web-platform-features

(Copy the link into a new browser Tab)

See: <a href="../examples/README.md">examples/README.md</a> for more details!

### You can run the dist version examples like this:
These versions also work in Firefox & Safari and do not require the Chrome flag

> localhost/neo/dist/development/examples/component/helix/
>
> localhost/neo/dist/production/examples/component/helix/

Copyright (c) 2015 - today, <a href="https://www.linkedin.com/in/tobiasuhlig/">Tobias Uhlig</a>
& <a href="https://www.linkedin.com/in/richwaters/">Rich Waters</a>
