# Workspace or Repository Fork

Neo.mjs supports two common starting points for application work:

1.  A generated workspace from `npx neo-app@latest`.
2.  A fork of the `neomjs/neo` repository.

Both can run Neo.mjs applications. The difference is ownership. A workspace is
your application project with Neo.mjs installed as a dependency. A repository
fork is a local copy of the framework source, examples, docs, and build
tooling.

## Choose a workspace for application development

A workspace is the default choice when your goal is to build and ship your own
app.

Use a workspace when:

-   Your application should live in its own Git repository.
-   You want to upgrade Neo.mjs through npm instead of merging framework
    development branches.
-   Your app-specific code, resources, and themes should stay separate from the
    framework source.
-   You do not need to edit Neo.mjs internals or contribute framework patches.

The tradeoff is that the framework source is not the thing you are editing. If
you need to debug or patch Neo.mjs itself, reproduce the issue in a repository
fork before opening a framework pull request.

## Choose a repository fork for framework work

A repository fork is the right choice when the framework itself is the target.

Use a fork when:

-   You are contributing to Neo.mjs core classes, build scripts, docs, examples,
    or tests.
-   You need the full in-repo example set.
-   You are debugging behavior that may require framework-source changes.
-   You want to validate a change against the same layout used by Neo.mjs pull
    requests.

The tradeoff is ownership pressure. App code placed in the framework repository
is close to the engine and examples, but it is also living inside the framework
project. For long-lived product work, move it into a workspace once it no
longer needs framework-source proximity.

## Build programs work the same way

The build programs are intentionally available from both layouts. Run them from
the root you are currently working in:

```bash readonly
npm run server-start
npm run create-app
npm run create-app-minimal
npm run build-all
npm run build-themes
```

The commands keep the same names and the same general responsibilities. The
root changes:

-   In a workspace, the root is your generated workspace directory.
-   In a repository fork, the root is the `neo` checkout.

This means the same app can move between layouts, but copied code must be
checked for relative paths. In-repo apps commonly import framework classes from
the local `src/` tree. Workspace apps commonly import the installed framework
package under `node_modules/neo.mjs/`. After migration, inspect the app's import
statements and its `neo-config.json` before assuming the app is portable.

## Move an app from the repository to a workspace

Use this direction when an app started as an in-repo experiment, demo, or
prototype and is becoming a standalone product.

1.  Create the target workspace:

    ```bash readonly
    npx neo-app@latest
    ```

2.  Copy the application folder from the repository into the workspace. For a
    normal app, this means copying:

    ```text readonly
    neo/apps/your-app/
    ```

    to:

    ```text readonly
    your-workspace/apps/your-app/
    ```

3.  Copy any app-owned files outside the app folder, preserving their relative
    paths. Common examples are app-specific assets under `resources/`, custom
    theme files, local data files, or shared classes that the app owns.

4.  Inspect framework imports. Imports that point into the repository's local
    `src/` tree need to resolve through the workspace's installed Neo.mjs
    package instead. Use a freshly generated workspace app as the reference
    pattern for import roots.

5.  Inspect `apps/your-app/neo-config.json`. Keep the app path and base paths
    consistent with the new workspace location.

6.  From the workspace root, reinstall and rebuild:

    ```bash readonly
    npm install
    npm run build-all
    ```

7.  Start the workspace server and open the moved app:

    ```bash readonly
    npm run server-start
    ```

If the app only works in development mode, run the relevant dist build before
calling the migration complete. Path issues often show up first in dist output.

## Move an app from a workspace to the repository

Use this direction when workspace app code has become framework documentation,
an example, or a reproduction for a Neo.mjs pull request.

1.  Fork and clone the repository, then create a branch for the migration.

2.  Choose the destination deliberately:

    -   Use `apps/` for a full application that belongs in the repository app
        set.
    -   Use `examples/` for a focused example that demonstrates one concept,
        component, or behavior.

3.  Copy the application folder into the chosen destination.

4.  Copy app-owned resources and theme files into the matching repository
    paths. Do not copy the generated workspace's installed dependency tree or
    package lock as part of an app migration.

5.  Inspect imports in the copied files. Workspace imports that point into
    `node_modules/neo.mjs/src/` usually need to point at the repository's local
    `src/` tree after the move.

6.  Inspect `neo-config.json` for the app's new depth. A path that was correct
    under `workspace/apps/your-app/` may be wrong under
    `neo/examples/some/category/your-app/`.

7.  From the repository root, install and build:

    ```bash readonly
    npm install
    npm run build-all
    ```

8.  Run the local server and verify the app in development mode and the dist
    environment that the pull request affects:

    ```bash readonly
    npm run server-start
    ```

For pull requests, include the exact app URL and build command you verified in
the PR body. That gives reviewers a reproducible path through the migrated
layout.

## Practical rule

Start in a workspace unless you know you are changing Neo.mjs itself. Move into
a fork when the app becomes a framework contribution. Move back out when the app
becomes product code again.
