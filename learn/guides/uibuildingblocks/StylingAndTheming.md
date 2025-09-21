# Styling and Theming in Neo.mjs

This guide provides a comprehensive overview of how to style your Neo.mjs applications, from basic component styling to creating entirely new themes.

## The Core Concepts

Styling in Neo.mjs is a layered system designed for both performance and flexibility. It combines component-level styles, a powerful SCSS-based theme engine, and a lazy-loading mechanism to ensure that only the necessary CSS is loaded at any given time.

Here are the key pillars of the styling system:

1.  **Component-Based Styles**: Applying styles directly to component instances.
2.  **VDOM-Based Styles**: How component styles are translated into the virtual DOM.
3.  **SCSS & Theming**: The structure of the SCSS source files and how themes are built.
4.  **Theme Inheritance**: How themes can extend and override base styles.
5.  **Build Process**: The scripts used to compile SCSS into CSS.
6.  **Lazy Loading**: How the framework efficiently loads theme styles on demand.

Let's dive into each of these areas.

## 1. Component-Based Styles

The primary way to style individual components is through configuration properties on the component itself. The `Neo.component.Base` class provides several key configs for this purpose.

### `style`

For applying inline CSS styles, use the `style` config. It accepts a standard JavaScript object. While the recommended convention is to use camelCased keys for CSS properties, you can also use quoted kebab-case keys.

```javascript readonly
// Recommended: camelCase
{
    ntype: 'button',
    text: 'Click Me',
    style: {
        backgroundColor: 'blue',
        color: 'white',
        borderRadius: '5px'
    }
}

// Also valid: quoted kebab-case
{
    ntype: 'button',
    text: 'Click Me',
    style: {
        'background-color': 'blue',
        'color': 'white',
        'border-radius': '5px'
    }
}
```

This will be rendered as `style="background-color: blue; color: white; border-radius: 5px;"` on the component's main HTML element.

### `cls`

To apply CSS classes, use the `cls` config, which accepts an array of strings.

```javascript readonly
{
    ntype: 'panel',
    cls: ['my-custom-panel', 'another-class']
}
```

Neo.mjs will automatically add its own classes for theming and functionality, so your custom classes will be merged with the framework's classes.

### `ui`

The `ui` config is a special styling hook that provides a simple way to apply a predefined set of styles to a component. It works by adding a CSS class in the format `neo-<ntype>-<ui>`.

For example, if you have a button:

```javascript readonly
{
    ntype: 'button',
    text: 'Important Button',
    ui: 'primary'
}
```

This will add the class `neo-button-primary` to the button's element, allowing you to target it with specific styles in your theme.

#### Implementing a Custom `ui` Style

To create your own `ui` variant, you simply add the corresponding CSS rule to your theme's SCSS file. For example, to create a "success" button style, you would first set the config:

```javascript readonly
{
    ntype: 'button',
    text: 'Save Changes',
    ui: 'success'
}
```

Then, in your theme's SCSS file (e.g., `resources/scss/theme-my-theme/button/Base.scss`), you would add the style definition:

```scss readonly
.neo-button-success {
    background-color: #28a745; // Green for success
    color: white;
    // any other styles...
}
```

### Advanced Styling: Wrappers and Root Nodes

For more advanced control, `Neo.component.Base` provides a set of five style and class-related configs. Understanding them requires understanding the difference between a component's **outermost node** and its **logical root node** (`getVdomRoot()`).

-   For many simple components, these two nodes are the same.
-   For complex components, the logical root might be a child of the outermost node. For example, a grid cell component's logical root might be a `<div>`, but its outermost node is the `<td>` that wraps it.

This distinction explains the purpose of the different configs:

-   **`style`**: An object of inline styles applied to the component's **logical root node**.
-   **`cls`**: An array of CSS classes applied to the component's **logical root node**.
-   **`wrapperStyle`**: An object of inline styles applied to the component's **outermost node**. This is only needed when the outermost node is different from the logical root.
-   **`wrapperCls`**: An array of CSS classes applied to the component's **outermost node**, for the same reason as `wrapperStyle`.
-   **`baseCls`**: An array of fundamental CSS classes applied by the component class itself for its core functionality. This is for internal framework use and is automatically merged into the final `cls` array.

### Best Practice: `cls` vs. `style`

Whenever possible, it is considered **best practice to use `cls` instead of `style`**. Defining styles in CSS classes keeps your component definitions cleaner and makes your styles more reusable and maintainable.

The `style` config should be reserved for situations where style properties are being calculated dynamically at runtime and are specific to that single component instance. A perfect example is a resizable `Dialog` component. As a user drags the corner of the dialog, the framework will dynamically update its `width` and `height` via the `style` config. These are transient, calculated values that don't belong in a reusable CSS class.

## 2. VDOM-Based Styles

All component configurations, including `style` and `cls`, are ultimately applied to the component's Virtual DOM (VDOM) tree. The framework then efficiently updates the real DOM based on changes to the VDOM.

When you change a style-related config at runtime, the component's `afterSet` hook for that config (e.g., `afterSetStyle()`) is triggered. This hook updates the VDOM, and the framework's rendering engine applies the changes to the live DOM. This reactive system ensures that UI updates are fast and automatic.

### Where to Apply Styles: A Critical Distinction

To avoid conflicts and ensure the reactive system works correctly, it is critical to follow this rule:

-   **For the component's root VDOM node(s):** Always use the component-level configs (`cls`, `style`, `wrapperCls`, `wrapperStyle`). Do **not** add `cls` or `style` attributes directly to the root node within the `vdom` object itself. This allows the framework to manage these styles reactively. If you set them directly on the VDOM root, your styles could be overwritten by a config change, or they could conflict with it.

-   **For all other descendant VDOM nodes:** Use the standard inline `cls` (as an array) and `style` (as an object) attributes directly inside the VDOM structure. This is the correct and intended way to style the inner parts of your component.

```javascript readonly
// GOOD EXAMPLE
{
    ntype: 'container',
    // Use component configs for the root node
    cls: ['my-container'],
    style: { border: '1px solid blue' },

    // Define VDOM with inline styles for descendants
    vdom: {
        // No cls or style here!
        cn: [{
            tag: 'h1',
            cls: ['my-title'], // Correct for a descendant
            style: { color: 'blue' }, // Correct for a descendant
            text: 'My Component'
        }, {
            // ... other descendant nodes
        }]
    }
}
```

## 3. SCSS & Theming

Neo.mjs's theming system is built with SCSS. The source files are located in the `resources/scss` directory.

The structure is typically:

-   `resources/scss/src/`: Contains the base structural styles for all components. These are the un-themed, core styles.
-   `resources/scss/theme-light/`: Contains the styles for the light theme.
-   `resources/scss/theme-dark/`: Contains the styles for the dark theme.

Within each of these folders, the SCSS files are organized to mirror the component's namespace in the `src` directory. For example, the styles for `Neo.button.Base` would be located at:

-   `resources/scss/src/button/Base.scss`
-   `resources/scss/theme-light/button/Base.scss`
-   `resources/scss/theme-dark/button/Base.scss`

## 4. SCSS File & Namespace Mapping

For the automatic lazy-loading of theme files to work, it is **critical** that the path of an SCSS file mirrors the namespace of the JavaScript class it styles. The build process uses this convention to generate the `theme-map.json`.

### Framework Components

For standard framework components, the mapping is direct. The path within `resources/scss/src` (or a theme folder) matches the class path after `Neo.`.

-   **JS Class:** `src/button/Base.mjs` (which defines `Neo.button.Base`)
-   **Maps to SCSS:** `resources/scss/src/button/Base.scss`

### Application Components (The `view` rule)

Applications follow a similar rule, but with one important exception: the `view` folder in the JavaScript path is **omitted** from the SCSS path. It is a mandatory convention that only components inside an application's `view` folder should have associated SCSS files.

-   **JS Class:** `apps/portal/view/Viewport.mjs` (defines `Portal.view.Viewport`)
-   **Maps to SCSS:** `resources/scss/src/apps/portal/Viewport.scss`

Notice how `view/` is not present in the SCSS path. The framework's build tools and runtime loader are specifically coded to handle this convention. Adhering to it is essential for your application's styles to be loaded correctly.

## 4. SCSS File & Namespace Mapping

For the automatic lazy-loading of theme files to work, it is **critical** that the path of an SCSS file mirrors the namespace of the JavaScript class it styles. The build process uses this convention to generate the `theme-map.json`.

### Framework Components

For standard framework components, the mapping is direct. The path within `resources/scss/src` (or a theme folder) matches the class path after `Neo.`.

-   **JS Class:** `src/button/Base.mjs` (which defines `Neo.button.Base`)
-   **Maps to SCSS:** `resources/scss/src/button/Base.scss`

### Application Components (The `view` rule)

Applications follow a similar rule, but with one important exception: the `view` folder in the JavaScript path is **omitted** from the SCSS path. It is a mandatory convention that only components inside an application's `view` folder should have associated SCSS files.

-   **JS Class:** `apps/portal/view/Viewport.mjs` (defines `Portal.view.Viewport`)
-   **Maps to SCSS:** `resources/scss/src/apps/portal/Viewport.scss`

Notice how `view/` is not present in the SCSS path. The framework's build tools and runtime loader are specifically coded to handle this convention. Adhering to it is essential for your application's styles to be loaded correctly.

## 5. Theme Inheritance

The theming engine uses a powerful and automatic inheritance model. You **do not** need to manually `@import` base styles into your theme's SCSS files. The framework handles this for you at runtime.

Here's how it works: When a component is created, the `insertThemeFiles()` method (in `src/worker/App.mjs`) inspects the component's entire JavaScript prototype chain. It walks **up** the chain from the component's class (e.g., `MyApp.view.CustomButton`) through its parents (like `Neo.button.Base`, `Neo.component.Base`, etc.) and loads the corresponding CSS file for each class that has one.

This means that the styles from `src` are always loaded as the base, and your theme's styles are automatically applied on top of them as overrides.

This approach has two major benefits:
1.  **Simplicity:** Your theme files only need to contain the specific styles you want to change. You don't need to worry about managing complex SCSS imports.
2.  **Accuracy:** The CSS inheritance perfectly mirrors the JavaScript class inheritance.

A theme file can therefore be very clean and focused:

```scss readonly
// resources/scss/theme-dark/button/Base.scss

// No @import needed!

.neo-button {
    // Dark theme overrides
    background-color: var(--dark-button-background-color);
    color: var(--dark-button-text-color);
}
```

You can also create your own themes that inherit from the existing Neo.mjs themes. The same principle applies: the framework will load the base theme's CSS first, followed by your new theme's CSS.

## 6. Architecting Nestable Themes

A key feature of the Neo.mjs theming architecture is the ability to nest components with different themes inside each other. For example, you could have a dark-themed grid inside a light-themed panel. To make this work reliably, themes must follow a strict separation of concerns.

**The Golden Rule:**
-   **`resources/scss/src/` defines structure:** The SCSS files in the `src` directory should define all the CSS selectors and structural properties (like `display`, `position`, `overflow`, etc.). They use CSS variables (`var()`) for all cosmetic properties (like `color`, `background-color`, `border`, etc.).
-   **`resources/scss/theme-*/` defines the skin:** Theme files should, ideally, **only** contain definitions for CSS variables. They should not introduce new selectors or override structural properties.

### A Practical Example: `list/Base.scss`

This principle is clearly demonstrated in the styling for `Neo.list.Base`.

**Structure (`src/list/Base.scss`):**
```scss readonly
.neo-list-wrapper {
    background-color: var(--list-container-background-color);
    border          : var(--list-container-border);
    overflow        : hidden;
    position        : relative;
}

.neo-list-item {
    background-color: var(--list-item-background-color);
    padding         : var(--list-item-padding);
    /* ... more structural styles */
}
```
This file sets up the rules. It says that a `.neo-list-wrapper` *can* have a `border`, and its value is determined by the `--list-container-border` variable.

**Skin (`theme-dark/list/Base.scss`):**
```scss readonly
:root .neo-theme-dark {
    --list-container-border: 1px solid #282829;
    /* ... other dark theme variables */
}
```
The dark theme provides a value for the border variable.

**Skin & Nullification (`theme-light/list/Base.scss`):**
```scss readonly
:root .neo-theme-light {
    --list-container-border: 0;
    /* ... other light theme variables */
}
```
The light theme explicitly sets the border variable to `0`. This is called **nullification**. It's critical for nesting. If a light-themed list is placed inside a dark-themed component, this rule ensures the list does not incorrectly inherit the dark theme's 1px border. It actively resets the property defined in the `src` structure.

### Bad Practice & The Right Way Forward

While you technically *can* add new selectors or structural overrides inside a theme file, it is considered **bad practice** if you want your theme to be nestable and composable with other themes. Doing so can lead to unpredictable side effects when themes are mixed and matched.

**What if a needed selector doesn't exist in `src`?**

There might be cases where your custom design requires styling a part of a component that doesn't have a dedicated CSS class or selector in the base `src` files. Here is the recommended workflow:

1.  **Temporarily add the selector to your theme:** To keep your project moving, it is acceptable to add the new structural selector directly into your theme's SCSS file as a temporary measure.
2.  **Open a feature request:** Immediately after, you should open a feature request ticket in the [Neo.mjs GitHub repository](https://github.com/neomjs/neo/issues). The ticket should describe the component you are styling and the new selector(s) you need.

This process allows you to continue your work without being blocked, while also contributing back to the framework. Once the new selectors are added to the `src` files in a future Neo.mjs update, you can refactor your theme to remove the temporary structural code and use the new, official CSS variables instead. This keeps themes clean and aligned with the framework's architecture for the long term.

If you are creating a one-off, custom theme that will never be nested, this rule is less critical. However, for creating robust, reusable themes, sticking to the "structure vs. skin" separation is essential.

## 7. Creating a New Theme

The most efficient and recommended way to create a new theme is to start with an existing one. This ensures you have all the necessary folder structures and CSS variable definitions in place.

1.  **Choose a Base Theme and Duplicate It:**
    Decide whether `theme-light` or `theme-dark` is a closer starting point for your design. Then, duplicate the folder and give it a new name.

    ```bash readonly
    # Example: Creating a new theme based on theme-light
    cp -r resources/scss/theme-light resources/scss/theme-my-awesome-theme
    ```

2.  **Customize Your Theme's Variables:**
    Now you can go through the `.scss` files in your new `theme-my-awesome-theme` folder and adjust the CSS variable values to match your design requirements.

3.  **Configure Your Application:**
    In your `neo-config.json`, add your new theme to the `themes` array. The first theme in the array becomes the default theme for the application.

    ```json readonly
    {
        "themes": ["neo-theme-my-awesome-theme", "neo-theme-light"]
    }
    ```
    **Note:** The `neo-` prefix is required, and your folder name should not include it (e.g., folder `theme-foo` becomes `neo-theme-foo` in the config).

4.  **Build Your New Theme:**
    Run the full theme build process to compile the SCSS for your new theme and, critically, to update the `theme-map.json` file to include it.

    ```bash readonly
    npm run build-themes
    ```

## 8. Theming in a Workspace

While the concepts above apply everywhere, it's important to understand *where* you should place your custom theme files when developing your own application. For this, Neo.mjs uses a **workspace** structure, typically created with `npx neo-app`.

A workspace mirrors the main `neo.mjs` repository structure, including its own `resources/scss` directory. This allows you to add themes and styles for your custom applications without modifying the framework's source code (which is included as an npm dependency in `node_modules`).

### The SCSS Merge Mechanism

The most powerful feature of workspace theming is how the build scripts work. When you run `npm run build-themes` from your workspace, the script intelligently **merges** the SCSS files from your workspace's `resources/scss` directory with the ones from `node_modules/neo.mjs/resources/scss`.

The workspace's files act as an overlay, giving you fine-grained control.

This enables several powerful workflows:

1.  **Override Specific Variables:** To change just a few variables for an existing theme (e.g., `theme-dark`), you only need to create a file at the corresponding path in your workspace (e.g., `my-workspace/resources/scss/theme-dark/button/Base.scss`) and redefine only the variables you want to change. The build script will merge your changes with the original theme file from the framework.

2.  **Create an Entirely New Theme:** You can create a brand new theme folder (e.g., `my-workspace/resources/scss/theme-corporate`) inside your workspace. By creating SCSS files that match the paths of the framework components, you can provide a complete set of CSS variable definitions for your theme. The build script will discover and compile your new theme, allowing you to build a unique look and feel from the ground up without ever touching the framework's source code.

3.  **Style App-Specific Components:** If you create a component that is only used within a single application (e.g., `my-workspace/apps/my-app/view/MyComponent.mjs`), you can create its structural styles in your workspace at `my-workspace/resources/scss/src/apps/my-app/MyComponent.scss`. The build script will pick it up and process it just like a framework component.

4.  **Style Workspace-Shared Components:** For components intended to be shared across multiple apps in your workspace, you can create them in the workspace's main `src` folder. These components must use the `Neo` namespace (e.g., `my-workspace/src/component/MyWorkspaceWidget.mjs` defining `Neo.component.MyWorkspaceWidget`). You can then provide their structural styles in the corresponding path within your workspace's `resources/scss/src` folder (e.g., `my-workspace/resources/scss/src/component/MyWorkspaceWidget.scss`).

This overlay approach is extremely powerful. It lets you maintain a clean separation between your application code and the framework, making framework upgrades significantly easier.

## 9. The Build Process

To compile the SCSS files into the CSS that the browser uses, Neo.mjs provides two main build scripts.

### `build-themes`

The `npm run build-themes` command is the main script for a full theme build. It:
1.  Compiles all `.scss` files in `resources/scss` into `.css` files.
2.  Uses `postcss` to add vendor prefixes (`autoprefixer`) and minify the CSS (`cssnano`) for production builds.
3.  Places the output into the `dist/<environment>/css/` directory.
4.  Generates a critical file: `resources/theme-map.json`.

The `theme-map.json` file creates a mapping between every class name and the themes that have custom styles for it. This file is the key to the lazy loading mechanism.

### `watch-themes`

For development, you can use `npm run watch-themes`. This script will watch the `resources/scss` directory for any changes and recompile only the file that was changed. This provides a much faster feedback loop when you are developing themes.

**Important Note:** The current version of `watch-themes` only handles changes to *existing* files. It does **not** detect new files, renamed files, or deleted files. As a result, if you add, move, or delete SCSS files while the watcher is running, the `theme-map.json` will not be updated, which can lead to inconsistencies. To apply these kinds of changes, you can run a full `npm run build-themes` command in a separate terminal. Enhancing the watch script to handle these cases is a planned improvement.

## 9. Lazy Loading in Action

You do not need to manually include any theme CSS files in your application's `index.html`. The framework handles it automatically.

Here's how it works:

1.  When the application starts, the `worker.App` loads the `theme-map.json` file.
2.  When a component is about to be created, the framework checks the `theme-map.json` to see if the active theme has a specific CSS file for that component.
3.  If it does, it sends a message to the `main.addon.Stylesheet` (in the main thread) to dynamically create a `<link>` tag for that CSS file and add it to the document's `<head>`.
4.  The browser then loads the CSS file.

This process ensures that you only ever load the CSS that is actually needed for the components currently in your application, which can significantly improve initial load times.

### VDOM Updates and Style Loading

The lazy loading of styles is tightly integrated with the framework's rendering engine to prevent a "flash of unstyled content" (FOUC) and unnecessary layout recalculations.

Imagine you are showing a complex component, like a grid, for the first time. The framework will trigger the lazy loading of the grid's theme CSS. If a VDOM update for the grid were to proceed immediately, the browser might render the grid's DOM structure *before* its styles have arrived, causing a flicker or a jarring layout shift once the styles are applied.

To prevent this, the `updateVdom()` method in `src/mixin/VdomLifecycle.mjs` contains a crucial check. It looks at the `Neo.worker.App` instance to see if any theme files are currently being loaded (`countLoadingThemeFiles > 0`). If they are, it will pause the VDOM update for the component and listen for a `themeFilesLoaded` event. Once all pending CSS files have been loaded, the VDOM update is automatically resumed.

This elegant mechanism ensures that a component's DOM is only mounted or updated after its required styles are in place, leading to a smoother and more professional user experience.
