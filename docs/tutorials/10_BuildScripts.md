# Neo build scripts
You can run each script using npm run inside your termial
(e.g. npm run build-development).
All scripts are defined inside the <a href="../../package.json">package.json</a>.

### create-app
Automatically creates an Neo App for you. You can choose the name of your app (defaults to MyApp),
as well as the used theme(s).

### server-start
Starts the server and opens a new browser window inside your default browser.
Optional, feel free to use a local web-server of your choice.

### generate-docs-json
Parses the Neo framework source to generate the data for the Neo docs app content.
Recommended to run whenever files inside the Neo src folder get changed.

### build-development
Creates the content for dist/development. This includes the main thread, data & vdom workers,
as well as all examples & the docs app. The dev version runs inside Chrome, Firefox & Safari
and is using source maps.

### build-production
Creates the content for dist/production. This includes the main thread, data & vdom workers,
as well as all examples & the docs app. The prod version runs inside Chrome, Firefox & Safari.
The output is minfied and is **not** using source maps.

### dev-css-structure
Creates the CSS structure output for all Neo themes including CSS variables.
The file gets saved to dist/development/neo-structure.css
and is being used by the dev mode as well as the "non build" versions of the docs app & examples.

### dev-theme-dark
Creates the CSS variables output for the dark theme.
The file gets saved to dist/development/neo-theme-dark.css
and is being used by the dev mode as well as the "non build" versions of the docs app & examples.

### dev-theme-light
Creates the CSS variables output for the light theme.
The file gets saved to dist/development/neo-theme-light.css
and is being used by the dev mode as well as the "non build" versions of the docs app & examples.

### prod-css-structure
Creates the CSS structure output for all Neo themes including CSS variables.
The file gets saved to dist/production/neo-structure.css
and is being used by the prod mode version of the docs app & examples.

### prod-theme-dark
Creates the CSS variables output for the dark theme.
The file gets saved to dist/production/neo-theme-dark.css
and is being used by the prod mode version of the docs app & examples.

### prod-theme-light
Creates the CSS variables output for the light theme.
The file gets saved to dist/production/neo-theme-light.css
and is being used by the prod mode version of the docs app & examples.

# Additional build scripts
It is possible to create versions of the Neo themes without using CSS variables.
This is mostly interesting for legacy browsers (IE 11).
In case you just want to use 1 theme inside your app and don't need CSS vars,
the output will have a smaller file size.
