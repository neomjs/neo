# neo.mjs: Getting Started Guide

1. Clone this repo to your system to get the project files
   ```sh
   git clone https://github.com/neomjs/neo.git
   ```

2. Open the checked out top level folder inside your terminal
   ```sh
   cd neo
   ```

3. Get the required node modules
   ```sh
   npm install
   ```

4. Run the following build scripts:
   ```sh
   npm run generate-docs-json
   npm run dev-css-structure
   npm run dev-theme-dark
   npm run dev-theme-light
   ```

   (See the <a href="../docs/tutorials/10_BuildScripts.md">Build Scripts Guide</a> for further details.)

5. Make sure to use a local WebServer!
   * Use a local webserver of your choice
   * OR `npm run server-start`

   (JS module imports can not work on the local file system (security).)
   
6. npm run create-app

#### You can run the examples & docs app **without** any JS build directly:  
localhost/neo/docs/  
localhost/neo/examples/component/helix/

#### This does require setting a Chrome flag for now (strongly recommended for development!).
chrome://flags/#enable-experimental-web-platform-features (Copy the link into a new browser Tab)

See: <a href="../examples/README.md">examples/README.md</a> for more details!

After using the development and / or production build,
1. `npm run build-development`
2. `npm run build-production`

you can run the examples like this:

localhost/neo/dist/development/examples/component/helix/

localhost/neo/dist/production/examples/component/helix/

The build (dist) versions also work in Firefox & Safari and do not require the Chrome flag.

Copyright (c) 2015 - today, Tobias Uhlig & Rich Waters
