import {setup} from '../../../setup.mjs';

setup({appConfig: {name: 'MainDocumentHeadUnit'}, mockMain: false});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';

const previousSlot = Neo.main?.addon?.DocumentHead;
previousSlot && delete Neo.main.addon.DocumentHead;
const {default: DocumentHead} = await import('../../../../../src/main/addon/DocumentHead.mjs');
const originalDocument        = globalThis.document;

test.describe('Neo.main.addon.DocumentHead metadata', () => {
    let nodes, addon;

    test.beforeEach(() => {
        nodes = [];
        const head = {
            querySelector(selector) {
                return nodes.find(node =>
                    selector === `${node.tag}[name="${node.attrs.name}"]` ||
                    selector === `${node.tag}[rel="${node.attrs.rel}"]`) || null
            },
            appendChild(node) { node.parentNode = head; nodes.push(node) }
        };
        globalThis.document = {
            head,
            title: '',
            createElement(tag) {
                if (tag !== 'meta' && tag !== 'link') throw new Error(`unexpected tag: ${tag}`);
                return {tag, attrs: {}, setAttribute(name, value) { this.attrs[name] = value }}
            }
        };
        addon = Object.create(DocumentHead.prototype)
    });

    test.afterAll(() => {
        originalDocument === undefined ? delete globalThis.document : globalThis.document = originalDocument;
        previousSlot && (Neo.main.addon.DocumentHead = previousSlot)
    });

    test('description and canonical create and then update their existing tags', () => {
        addon.setDescription({value: 'First'});
        addon.setCanonical({url: 'https://example.test/first'});
        const [description, canonical] = nodes;

        expect(description.attrs).toEqual({name: 'description', content: 'First'});
        expect(canonical.attrs).toEqual({rel: 'canonical', href: 'https://example.test/first'});
        addon.setDescription({value: 'Second'});
        addon.setCanonical({url: 'https://example.test/second'});
        expect(nodes).toEqual([description, canonical]);
        expect(description.attrs.content).toBe('Second');
        expect(canonical.attrs.href).toBe('https://example.test/second')
    });

    test('combined update applies description, canonical and a generic value-envelope tag', () => {
        addon.update({description: 'Connect', canonicalUrl: 'https://example.test/services', title: 'Connect',
            tag: {tag: 'meta', property: 'og:title', content: 'Connect'}});

        expect(document.title).toBe('Connect');
        expect(nodes.map(node => node.attrs)).toEqual([
            {rel: 'canonical', href: 'https://example.test/services'},
            {name: 'description', content: 'Connect'},
            {property: 'og:title', content: 'Connect'}
        ])
    });
});
