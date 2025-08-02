# Client Requirements

Running the examples locally works fine in all environments inside all major browsers at this point:
Chrome, Edge, Firefox & Safari


# Local Web-Server Requirements

Why do I need a local web-server?

In short: it is possible to run the framework without a local web-server, but this would be a huge security issue.
You can start Chrome using a flag (--allow-file-access-from-files), but this will allow the browser to access any
file on your hard drive. To avoid this, a local web-server is the way to go.

**Webpack Dev Server**  
`npm run server-start`

**All Servers**  
Ensure your server has a mime-type configured for Javascript Modules (.mjs) files. This should be set to the same as
normal javascript (.js) files, normally 'application/-javascript'.

**JetBrains IDE**
- Go to Preferences -> Build, Execution, Deployment -> Debugger
- Built-in server -> Allow unsigned requests (true)

<br><br>
Copyright (c) 2015 - today, <a href="https://www.linkedin.com/in/tobiasuhlig/">Tobias Uhlig</a>
