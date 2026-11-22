/**
 * @file test/playwright/unit/main/DomApiRendererMediaMuted.spec.mjs
 * @summary Pins `DomApiRenderer#createDomTree` and `voidAttributes` so `<video muted>` sets the live
 * `HTMLMediaElement#muted` IDL property in addition to the boolean attribute.
 *
 * In the HTML DOM API, `document.createElement('video')` followed by `setAttribute('muted', ...)` or
 * `toggleAttribute('muted', true)` updates `defaultMuted` only and leaves `video.muted === false`, causing modern
 * browsers to block muted autoplay until `domNode.muted` is assigned directly.
 */

import {setup} from '../../setup.mjs';

const appName = 'DomApiRendererMediaMutedTest';

setup({
    appConfig: {name: appName},
    neoConfig: {unitTestMode: true, useDomApiRenderer: true, useDomIds: true}
});

import {test, expect}   from '@playwright/test';
import Neo              from '../../../../src/Neo.mjs';
import * as core        from '../../../../src/core/_export.mjs';
import DomApiRenderer   from '../../../../src/main/render/DomApiRenderer.mjs';
import {voidAttributes} from '../../../../src/vdom/domConstants.mjs';

test.describe('Neo.main.render.DomApiRenderer media boolean attributes', () => {
    let originalDocument;

    test.beforeEach(() => {
        originalDocument = globalThis.document;

        globalThis.document = {
            createElement(tagName) {
                const attrs = new Map();

                return {
                    attributes  : attrs,
                    childNodes  : [],
                    classList   : {add() {}},
                    defaultMuted: false,
                    id          : '',
                    muted       : false,
                    style       : {setProperty() {}},
                    tagName     : tagName.toUpperCase(),
                    append(...nodes) {
                        this.childNodes.push(...nodes)
                    },
                    hasAttribute(name) {
                        return attrs.has(name)
                    },
                    setAttribute(name, val) {
                        attrs.set(name, String(val));
                        if (name === 'muted') {
                            this.defaultMuted = true
                        }
                    },
                    toggleAttribute(name, force) {
                        const next = force === undefined ? !attrs.has(name) : Boolean(force);
                        next ? attrs.set(name, '') : attrs.delete(name);
                        if (name === 'muted') {
                            this.defaultMuted = next
                        }
                        return next
                    }
                }
            }
        }
    });

    test.afterEach(() => {
        globalThis.document = originalDocument
    });

    test('treats media boolean attributes as void attributes and syncs live video.muted on mount', () => {
        expect(voidAttributes.has('autoplay')).toBe(true);
        expect(voidAttributes.has('controls')).toBe(true);
        expect(voidAttributes.has('loop')).toBe(true);
        expect(voidAttributes.has('muted')).toBe(true);

        const mutedVideo = DomApiRenderer.createDomTree({
            isRoot: true,
            vnode : {
                attributes: {autoplay: 'true', controls: 'true', loop: 'true', muted: 'true'},
                childNodes: [],
                className : ['neo-video-media'],
                id        : 'neo-vnode-video-1',
                nodeName  : 'video',
                style     : {}
            }
        });

        expect(mutedVideo.hasAttribute('autoplay')).toBe(true);
        expect(mutedVideo.hasAttribute('controls')).toBe(true);
        expect(mutedVideo.hasAttribute('loop')).toBe(true);
        expect(mutedVideo.hasAttribute('muted')).toBe(true);
        expect(mutedVideo.defaultMuted).toBe(true);
        expect(mutedVideo.muted).toBe(true);

        const unmutedVideo = DomApiRenderer.createDomTree({
            isRoot: true,
            vnode : {
                attributes: {muted: 'false'},
                childNodes: [],
                className : ['neo-video-media'],
                id        : 'neo-vnode-video-2',
                nodeName  : 'video',
                style     : {}
            }
        });

        expect(unmutedVideo.hasAttribute('muted')).toBe(false);
        expect(unmutedVideo.muted).toBe(false)
    })
});
