/**
 * @file test/playwright/unit/main/DomAccessModalMask.spec.mjs
 * @summary Pins where `Neo.main.DomAccess#syncModalMask` puts the one modal mask: below the topmost displayed modal
 * element, never below one that gives the mask up while its node is still on the page.
 *
 * A closing dialog syncs before its removal lands, since the two travel in no fixed order. The page here is a list of
 * body children, so each arm reads which node the mask sits in front of.
 */

import {setup} from '../../setup.mjs';

const appName = 'DomAccessModalMaskTest';

// DomAccess is a main-thread singleton whose constructor installs document listeners
const bootDocument = {addEventListener() {}};

const originalDocumentAtImport = globalThis.document;
globalThis.document = bootDocument;

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';

const replacedDomAccess = Neo.main?.DomAccess;

if (replacedDomAccess && replacedDomAccess.className !== 'Neo.main.DomAccess') {
    delete Neo.main.DomAccess
}

const {default: DomAccess} = await import('../../../../src/main/DomAccess.mjs');
globalThis.document = originalDocumentAtImport;
// The namespace gets back what it held, so a later spec in this worker never reaches the real singleton
replacedDomAccess === undefined ? delete Neo.main.DomAccess : Neo.main.DomAccess = replacedDomAccess;

setup({
    appConfig: {name: appName},
    neoConfig: {unitTestMode: true, useDomIds: true}
});

let originalDocument, originalUseDomIds, page;

const remove = item => {
    const index = page.indexOf(item);
    index > -1 && page.splice(index, 1)
};

const pageDocument = {
    addEventListener() {},
    body: {
        insertBefore(item, reference) {
            remove(item);
            page.splice(page.indexOf(reference), 0, item)
        }
    },
    contains      : item => page.includes(item),
    createElement : () => ({addEventListener() {}, className: '', remove() {remove(this)}}),
    defaultView   : {getComputedStyle: item => ({getPropertyValue: () => item.display})},
    getElementById: id => page.find(item => item.id === id) || null,
    // the one selector the method queries: '.neo-modal'
    querySelectorAll: () => page.filter(item => item.modal)
};

/**
 * @param {String} id
 * @param {Object} [options]
 * @param {String} [options.display='block']
 * @returns {Object} A body child carrying the `neo-modal` class
 */
const modalNode = (id, {display='block'}={}) => ({display, id, modal: true, ownerDocument: pageDocument});

/**
 * @returns {String|null} The id of the node the mask sits in front of, null when it is off the page
 */
const maskHolder = () => {
    const index = page.indexOf(DomAccess.modalMask);
    return index > -1 ? page[index + 1].id : null
};

test.beforeEach(() => {
    originalDocument  = globalThis.document;
    originalUseDomIds = Neo.config.useDomIds;
    page              = [];

    Neo.config.useDomIds  = true;
    globalThis.document   = pageDocument;
    DomAccess._modalMask  = null
});

test.afterEach(() => {
    DomAccess._modalMask = null;
    Neo.config.useDomIds = originalUseDomIds;
    globalThis.document  = originalDocument
});

test.describe('Neo.main.DomAccess#syncModalMask', () => {
    test('a displayed modal dialog holds the mask', () => {
        page.push(modalNode('dialog-1'));

        DomAccess.syncModalMask({id: 'dialog-1', modal: true});

        expect(maskHolder()).toBe('dialog-1')
    });

    test('a closing dialog still on the page gives the mask up', () => {
        page.push(modalNode('dialog-1'));
        DomAccess.syncModalMask({id: 'dialog-1', modal: true});

        // its removal has not landed yet
        DomAccess.syncModalMask({id: 'dialog-1', modal: false});

        expect(maskHolder()).toBeNull();
        expect(page.map(item => item.id)).toEqual(['dialog-1'])
    });

    test('the mask moves below the next topmost modal dialog, while the closing one is still on the page', () => {
        page.push(modalNode('dialog-1'), modalNode('dialog-2'));
        DomAccess.syncModalMask({id: 'dialog-2', modal: true});
        expect(maskHolder()).toBe('dialog-2');

        DomAccess.syncModalMask({id: 'dialog-2', modal: false});

        expect(maskHolder()).toBe('dialog-1')
    });

    test('a dialog that already left the page hands the mask to the topmost one still there', () => {
        page.push(modalNode('dialog-1'));

        DomAccess.syncModalMask({id: 'dialog-2', modal: true});

        expect(maskHolder()).toBe('dialog-1')
    });

    test('a modal node that is not displayed never takes the mask', () => {
        page.push(modalNode('dialog-1', {display: 'none'}), modalNode('dialog-2'));
        DomAccess.syncModalMask({id: 'dialog-2', modal: true});

        DomAccess.syncModalMask({id: 'dialog-2', modal: false});

        expect(maskHolder()).toBeNull()
    })
});
