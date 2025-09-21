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

For applying inline CSS styles, use the `style` config. It accepts a standard JavaScript object where keys are camelCased CSS properties.

```javascript
{
    ntype: 'button',
    text: 'Click Me',
    style: {
        backgroundColor: 'blue',
        color: 'white',
        borderRadius: '5px'
    }
}
```

This will be rendered as `style="background-color: blue; color: white; border-radius: 5px;"` on the component's main HTML element.

### `cls`

To apply CSS classes, use the `cls` config, which accepts an array of strings.

```javascript
{
    ntype: 'panel',
    cls: ['my-custom-panel', 'another-class']
}
```

Neo.mjs will automatically add its own classes for theming and functionality, so your custom classes will be merged with the framework's classes.

### `ui`

The `ui` config is a special styling hook that provides a simple way to apply a predefined set of styles to a component. It works by adding a CSS class in the format `neo-<ntype>-<ui>`.

For example, if you have a button:

```javascript
{
    ntype: 'button',
    text: 'Important Button',
    ui: 'primary'
}
```

This will add the class `neo-button-primary` to the button's element, allowing you to target it with specific styles in your theme.

## 2. VDOM-Based Styles

All component configurations, including `style` and `cls`, are ultimately applied to the component's Virtual DOM (VDOM) tree. The framework then efficiently updates the real DOM based on changes to the VDOM.

When you change a style-related config at runtime, the component's `afterSet` hook for that config (e.g., `afterSetStyle()`) is triggered. This hook updates the VDOM, and the framework's rendering engine applies the changes to the live DOM. This reactive system ensures that UI updates are fast and automatic.

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

## 4. Theme Inheritance

The theming engine uses a powerful and automatic inheritance model. You **do not** need to manually `@import` base styles into your theme's SCSS files. The framework handles this for you at runtime.

Here's how it works: When a component is created, the `insertThemeFiles()` method (in `src/worker/App.mjs`) inspects the component's entire JavaScript prototype chain. It walks **up** the chain from the component's class (e.g., `MyApp.view.CustomButton`) through its parents (like `Neo.button.Base`, `Neo.component.Base`, etc.) and loads the corresponding CSS file for each class that has one.

This means that the styles from `src` are always loaded as the base, and your theme's styles are automatically applied on top of them as overrides.

This approach has two major benefits:
1.  **Simplicity:** Your theme files only need to contain the specific styles you want to change. You don't need to worry about managing complex SCSS imports.
2.  **Accuracy:** The CSS inheritance perfectly mirrors the JavaScript class inheritance.

A theme file can therefore be very clean and focused:

```scss
// resources/scss/theme-dark/button/Base.scss

// No @import needed!

.neo-button {
    // Dark theme overrides
    background-color: var(--dark-button-background-color);
    color: var(--dark-button-text-color);
}
```

You can also create your own themes that inherit from the existing Neo.mjs themes. The same principle applies: the framework will load the base theme's CSS first, followed by your new theme's CSS.

## 5. The Build Process

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

## 6. Creating a New Theme

To create a new theme, follow these steps:

1.  **Create a new theme folder:**
    Inside `resources/scss`, create a new folder, e.g., `theme-my-awesome-theme`.

2.  **Add SCSS files:**
    Start adding SCSS files that mirror the structure of the `src` or other theme folders. You only need to create files for the components you want to style differently. For any component you don't provide a custom style for, it will inherit the base `src` style.

3.  **Configure your application:**
    In your `neo-config.json`, add your new theme to the `themes` array. The first theme in the array is the default theme.

    ```json
    {
        "themes": ["neo-theme-my-awesome-theme", "neo-theme-light"]
    }
    ```
    *Note: The `neo-` prefix is important.*

4.  **Build the themes:**
    Run `npm run build-themes` to compile your new theme and update the `theme-map.json`.

5.  **Run your application:**
    Your application will now use your new theme.

## 7. Lazy Loading in Action

You do not need to manually include any theme CSS files in your application's `index.html`. The framework handles it automatically.

Here's how it works:

1.  When the application starts, the `worker.App` loads the `theme-map.json` file.
2.  When a component is about to be created, the framework checks the `theme-map.json` to see if the active theme has a specific CSS file for that component.
3.  If it does, it sends a message to the `main.addon.Stylesheet` (in the main thread) to dynamically create a `<link>` tag for that CSS file and add it to the document's `<head>`.
4.  The browser then loads the CSS file.

This process ensures that you only ever load the CSS that is actually needed for the components currently in your application, which can significantly improve initial load times.
