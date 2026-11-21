import {test, expect}              from '@playwright/test';
import {parse}                     from 'acorn';
import {readFileSync, readdirSync} from 'node:fs';
import path                        from 'node:path';
import {fileURLToPath}             from 'node:url';

/**
 * @summary Finds literal fire payloads that overwrite Observable's reserved sender key.
 * @param {String} code Module source.
 * @returns {Number[]} Lines declaring a conflicting key.
 */
function findReservedSources(code) {
    const lines = [];

    const visit = node => {
        if (!node?.type) return;

        if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression') {
            const callee  = node.callee,
                  method  = callee.computed ? callee.property.value : callee.property.name,
                  payload = node.arguments[1];

            if (method === 'fire' && payload?.type === 'ObjectExpression') {
                for (const property of payload.properties) {
                    if (property.type !== 'Property') continue;
                    const key = !property.computed && property.key.type === 'Identifier'
                        ? property.key.name : property.key.value;
                    if (key === 'source') lines.push(property.loc.start.line)
                }
            }
        }

        for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(visit);
            else if (value?.type) visit(value)
        }
    };

    visit(parse(code, {ecmaVersion: 'latest', sourceType: 'module', locations: true}));
    return lines
}

test.describe('Observable object payload source ownership (#21649)', () => {
    test('no engine fire payload declares its own source', () => {
        const root  = fileURLToPath(new URL('../../../../src/', import.meta.url)),
              files = readdirSync(root, {recursive: true, withFileTypes: true})
                  .filter(entry => entry.isFile() && entry.name.endsWith('.mjs')),
              violations = [];

        expect(files.length).toBeGreaterThan(0);
        for (const entry of files) {
            const file = path.join(entry.parentPath, entry.name);
            for (const line of findReservedSources(readFileSync(file, 'utf8'))) {
                violations.push(`${path.relative(root, file)}:${line}`)
            }
        }

        expect(violations.sort(), 'source is the sender id; use a distinct key for event metadata').toEqual([])
    });

    test('the guard catches literal keys without matching comments, strings or nested metadata', () => {
        for (const payload of ['{source: origin}', '{source}', '{"source": origin}', '{["source"]: origin}']) {
            expect(findReservedSources(`sender.fire('change', ${payload})`)).toEqual([1])
        }
        expect(findReservedSources("sender['fire']('change', {source})")).toEqual([1]);
        expect(findReservedSources(`
            // sender.fire('change', {source});
            const example = "sender.fire('change', {source})";
            sender.fire('change', {changeSource: 'keyboard', meta: {source}});
            sender.fire('change', payload);
            sender.other('change', {source});
        `)).toEqual([])
    });
});
