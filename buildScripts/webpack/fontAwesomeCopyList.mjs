/**
 * @summary The Font Awesome files the runtime loads, relative to the `@fortawesome/fontawesome-free` package root.
 *
 * `src/main/addon/Stylesheet.mjs` loads `css/all.min.css`, which references the font files in `webfonts/`. The
 * licence travels with the fonts. Every other file in the package (SVG sources, sprites, metadata, the JS build and
 * the SCSS sources) is not used at runtime, so the dist builds copy only this list.
 *
 * Both main-thread webpack configs (development and production) read this list, so they cannot drift apart.
 * `test/playwright/unit/buildScripts/FontAwesomeCopyList.spec.mjs` fails when the installed `all.min.css`
 * references a file this list does not cover.
 * @type {String[]}
 */
export const FONTAWESOME_COPY_LIST = [
    'css/all.min.css',
    'LICENSE.txt',
    'webfonts',
];
