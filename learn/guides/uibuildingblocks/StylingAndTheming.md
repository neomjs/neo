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

## 5. Architecting Nestable Themes

A key feature of the Neo.mjs theming architecture is the ability to nest components with different themes inside each other. For example, you could have a dark-themed grid inside a light-themed panel. To make this work reliably, themes must follow a strict separation of concerns.

**The Golden Rule:**
-   **`resources/scss/src/` defines structure:** The SCSS files in the `src` directory should define all the CSS selectors and structural properties (like `display`, `position`, `overflow`, etc.). They use CSS variables (`var()`) for all cosmetic properties (like `color`, `background-color`, `border`, etc.).
-   **`resources/scss/theme-*/` defines the skin:** Theme files should, ideally, **only** contain definitions for CSS variables. They should not introduce new selectors or override structural properties.

### A Practical Example: `list/Base.scss`

This principle is clearly demonstrated in the styling for `Neo.list.Base`.

**Structure (`src/list/Base.scss`):**
```scss
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
```scss
:root .neo-theme-dark {
    --list-container-border: 1px solid #282829;
    /* ... other dark theme variables */
}
```
The dark theme provides a value for the border variable.

**Skin & Nullification (`theme-light/list/Base.scss`):**
```scss
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
