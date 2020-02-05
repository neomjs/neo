# Client Requirements

Running the examples locally **without** a webpack build requires browsers to be able to start webworkers from
Javascript Modules (.mjs files). This feature got released in Google Chrome v80 (February 4th, 2020),
other browsers are not there yet (see sticky <a href="https://github.com/neomjs/neo/issues">issues</a>)

- localhost/neo/examples/component/helix/

More details on JS Modules (and their use within workers) here:
https://v8.dev/features/modules

Without the Chrome flag (or for other browsers like Firefox or Safari), you can run the examples using the webpack build
version (which converts JS modules into plain JS files)
- localhost/neo/dist/development/examples/component/helix/

# Local Web-Server Requirements

Why do I need a local web-server?

In short: it is possible to run the framework without a local web-server, but this would be a huge security issue.
You can start Chrome using a flag (--allow-file-access-from-files), but this will allow the browser to access any
file on your hard drive. To avoid this, a local web-server (like XAMPP) is the way to go.

**Webpack Dev Server**  
`npm run server-start`

**All Servers**  
Ensure your server has a mime-type configured for Javascript Modules (.mjs) files. This should be set to the same as normal javascript (.js) files, normally 'application/-javascript'.

**JetBrains IDE**
- Go to Preferences -> Build, Execution, Deployment -> Debugger
- Built-in server -> Allow unsigned requests (true)

<br><br>
Copyright (c) 2015 - today, <a href="https://www.linkedin.com/in/tobiasuhlig/">Tobias Uhlig</a>
& <a href="https://www.linkedin.com/in/richwaters/">Rich Waters</a>