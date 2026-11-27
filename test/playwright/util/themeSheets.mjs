import fs              from 'node:fs';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * @summary The theme stylesheets `Neo.main.addon.Stylesheet` would load for `classNames` under `themes`, read from
 * the built `resources/theme-map.json`: each theme folder's `Global.css`, then each class's `theme-base` sheet and
 * its sheet in every mapped folder of those themes. A component spec links these instead of naming theme folders,
 * so moving a package into `theme-base` needs no spec edit. `src` sheets stay the spec's choice.
 * @param {String[]} themes Theme classes, e.g. `['neo-theme-neo-light', 'neo-theme-light']`.
 * @param {String[]} classNames Engine classes without the `Neo.` namespace, e.g. `['button.Base']`.
 * @param {String} [env='development']
 * @returns {String[]} Root-relative hrefs, each once.
 */
export function themeSheetHrefs(themes, classNames, env = 'development') {
    const map     = JSON.parse(fs.readFileSync(path.join(repoRoot, 'resources/theme-map.json'), 'utf8')),
          folders = new Set(themes.flatMap(theme => map.themes[theme] ?? [])),
          hrefs   = new Set();

    for (const folder of folders) {
        fs.existsSync(path.join(repoRoot, `dist/${env}/css/${folder}/Global.css`)) && hrefs.add(`/dist/${env}/css/${folder}/Global.css`)
    }

    for (const className of classNames) {
        const parts = className.split('.');

        for (const folder of parts.reduce((node, part) => node?.[part], map.Neo) ?? []) {
            (folder === 'theme-base' || folders.has(folder)) && hrefs.add(`/dist/${env}/css/${folder}/${parts.join('/')}.css`)
        }
    }

    return [...hrefs]
}
