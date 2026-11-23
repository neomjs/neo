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
                    selector === `${node.tag}[property="${node.attrs.property}"]` ||
                    selector === `${node.tag}[rel="${node.attrs.rel}"]` ||
                    (node.tag === 'script' && node.type === 'application/ld+json' && (
                        selector === 'script[type="application/ld+json"]' ||
                        selector === `script[type="application/ld+json"][data-schema-name="${node.dataset.schemaName}"]`
                    ))
                ) || null
            },
            appendChild(node) { node.parentNode = head; nodes.push(node) },
            removeChild(node) {
                const index = nodes.indexOf(node);
                if (index !== -1) nodes.splice(index, 1);
                node.parentNode = null
            }
        };
        globalThis.document = {
            head,
            title: '',
            createElement(tag) {
                if (tag !== 'meta' && tag !== 'link' && tag !== 'script') throw new Error(`unexpected tag: ${tag}`);
                return {
                    tag,
                    attrs      : {},
                    dataset    : {},
                    textContent: '',
                    type       : '',
                    remove() { this.parentNode?.removeChild?.(this) },
                    setAttribute(name, value) { this.attrs[name] = value }
                }
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

    test('update with named ldJson and tags array preserves existing neo-organism ld+json (#20688)', () => {
        addon.setLdJson({
            name : 'neo-organism',
            value: {'@context': 'https://schema.org', '@graph': [{name: 'Neo.mjs'}]}
        });

        addon.update({
            canonicalUrl: 'https://neomjs.com/learn/benefits/Introduction',
            description : 'What Neo is and why it exists.',
            ldJson      : {
                name : 'neo-route',
                value: {
                    '@context': 'https://schema.org',
                    '@type'   : 'TechArticle',
                    headline  : 'What Is Neo.mjs?',
                    url       : 'https://neomjs.com/learn/benefits/Introduction'
                }
            },
            tags: [
                {tag: 'meta', property: 'og:title',       content: 'What Is Neo.mjs?'},
                {tag: 'meta', property: 'og:description', content: 'What Neo is and why it exists.'},
                {tag: 'meta', property: 'og:url',         content: 'https://neomjs.com/learn/benefits/Introduction'}
            ],
            title: 'What Is Neo.mjs?'
        });

        const organismScript = document.head.querySelector('script[type="application/ld+json"][data-schema-name="neo-organism"]');
        const routeScript    = document.head.querySelector('script[type="application/ld+json"][data-schema-name="neo-route"]');

        expect(organismScript).toBeTruthy();
        expect(JSON.parse(organismScript.textContent)).toEqual({
            '@context': 'https://schema.org',
            '@graph'  : [{name: 'Neo.mjs'}]
        });

        expect(routeScript).toBeTruthy();
        expect(JSON.parse(routeScript.textContent)).toEqual({
            '@context': 'https://schema.org',
            '@type'   : 'TechArticle',
            headline  : 'What Is Neo.mjs?',
            url       : 'https://neomjs.com/learn/benefits/Introduction'
        });

        expect(document.head.querySelector('meta[property="og:title"]').attrs.content).toBe('What Is Neo.mjs?');
        expect(document.head.querySelector('meta[property="og:description"]').attrs.content).toBe('What Neo is and why it exists.');
        expect(document.head.querySelector('meta[property="og:url"]').attrs.content).toBe('https://neomjs.com/learn/benefits/Introduction');

        addon.update({
            ldJson: {
                name : 'neo-route',
                value: null
            }
        });

        expect(document.head.querySelector('script[type="application/ld+json"][data-schema-name="neo-route"]')).toBeNull();
        expect(document.head.querySelector('script[type="application/ld+json"][data-schema-name="neo-organism"]')).toBeTruthy();
    });

    test('update treats schema.org objects carrying name and value as plain schemas rather than named wrappers (#20688)', () => {
        const scalarPropertyValue = {
            '@context': 'https://schema.org',
            '@type'   : 'PropertyValue',
            name      : 'threads',
            value     : '4'
        };

        addon.update({ldJson: scalarPropertyValue});

        expect(document.head.querySelector('script[type="application/ld+json"][data-schema-name="threads"]')).toBeNull();
        expect(addon.getLdJson()).toEqual(scalarPropertyValue);

        const objectPropertyValue = {
            '@type': 'PropertyValue',
            name   : 'workers',
            value  : {count: 4}
        };

        addon.update({ldJson: objectPropertyValue});

        expect(document.head.querySelector('script[type="application/ld+json"][data-schema-name="workers"]')).toBeNull();
        expect(addon.getLdJson()).toEqual(objectPropertyValue);
    });
});
