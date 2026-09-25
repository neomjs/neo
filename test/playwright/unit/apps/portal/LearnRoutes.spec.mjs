import {test, expect}  from '@playwright/test';
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';

const
    root       = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../'),
    portalDir  = path.join(root, 'apps/portal'),
    routeRegex = /#\/learn\/([\w./-]+)/g;

/**
 * The portal files that can hold a learn route: every `.mjs` and `.html` below `apps/portal`,
 * except the generated data in `resources/`.
 * @param {String} dir
 * @returns {String[]}
 */
function collectSources(dir) {
    return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            return fullPath === path.join(portalDir, 'resources') ? [] : collectSources(fullPath)
        }

        return /\.(html|mjs)$/.test(entry.name) ? [fullPath] : []
    })
}

test.describe('Portal learn routes', () => {
    test('every #/learn/ route in the portal source names a record in learn/tree.json', () => {
        const
            ids    = new Set(JSON.parse(fs.readFileSync(path.join(root, 'learn/tree.json'), 'utf-8')).data.map(record => record.id)),
            found  = [],
            misses = [];

        collectSources(portalDir).forEach(file => {
            fs.readFileSync(file, 'utf-8').split('\n').forEach((line, index) => {
                for (const [, id] of line.matchAll(routeRegex)) {
                    found.push(id);
                    ids.has(id) || misses.push(`${path.relative(root, file)}:${index + 1} ${id}`)
                }
            })
        });

        // The scan must see the routes it guards, or an empty miss list proves nothing
        expect(found).toContain('agentos/NeuralLink');
        expect(misses).toEqual([])
    })
});
