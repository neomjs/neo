import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'InputModalityTest'
    },
    neoConfig: {
        unitTestMode: true
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import InputModality  from '../../../../../src/main/addon/InputModality.mjs';

/**
 * @summary Creates the minimal document surface owned by the addon.
 * @returns {Document}
 */
function createDocument() {
    const
        attributes  = new Map(),
        documentRef = new EventTarget();

    documentRef.documentElement = {
        getAttribute(name) {
            return attributes.get(name) ?? null
        },
        removeAttribute(name) {
            attributes.delete(name)
        },
        setAttribute(name, value) {
            attributes.set(name, String(value))
        }
    };

    return documentRef
}

/**
 * @param {Document} documentRef
 * @returns {Promise<Neo.main.addon.InputModality>}
 */
async function createTracker(documentRef) {
    globalThis.document = documentRef;

    const tracker = Neo.create(InputModality);

    await tracker.ready();

    return tracker
}

test.describe('Neo.main.addon.InputModality', () => {
    let originalDocument,
        trackers;

    test.beforeEach(() => {
        originalDocument = globalThis.document;
        trackers         = []
    });

    test.afterEach(() => {
        trackers.forEach(tracker => tracker.destroy());

        originalDocument === undefined ? delete globalThis.document : globalThis.document = originalDocument
    });

    test('flips the document marker on native pointer, mouse, and keyboard input', async () => {
        const
            documentRef = createDocument(),
            tracker     = await createTracker(documentRef);

        trackers.push(tracker);

        expect(tracker.getModality()).toBeNull();

        documentRef.dispatchEvent(new Event('pointerdown'));
        expect(tracker.getModality()).toBe('pointer');

        documentRef.dispatchEvent(new Event('keydown'));
        expect(tracker.getModality()).toBe('keyboard');

        documentRef.dispatchEvent(new Event('mousedown'));
        expect(tracker.getModality()).toBe('pointer')
    });

    test('keeps modality truth isolated per document instance', async () => {
        const
            firstDocument  = createDocument(),
            firstTracker   = await createTracker(firstDocument),
            secondDocument = createDocument(),
            secondTracker  = await createTracker(secondDocument);

        trackers.push(firstTracker, secondTracker);

        firstDocument.dispatchEvent(new Event('keydown'));

        expect(firstTracker.getModality()).toBe('keyboard');
        expect(secondTracker.getModality()).toBeNull();

        secondDocument.dispatchEvent(new Event('pointerdown'));

        expect(firstTracker.getModality()).toBe('keyboard');
        expect(secondTracker.getModality()).toBe('pointer')
    });

    test('accepts a named-window worker stamp and rejects unknown marker values', async () => {
        const tracker = await createTracker(createDocument());

        trackers.push(tracker);

        expect(tracker.setModality({modality: 'keyboard', windowId: 'popup-window'})).toBe(true);
        expect(tracker.getModality({windowId: 'popup-window'})).toBe('keyboard');
        expect(tracker.setModality({modality: 'touch', windowId: 'popup-window'})).toBe(false);
        expect(tracker.getModality()).toBe('keyboard')
    });

    test('removes listeners and the owned marker on destroy', async () => {
        const
            documentRef = createDocument(),
            tracker     = await createTracker(documentRef);

        documentRef.dispatchEvent(new Event('keydown'));
        expect(tracker.getModality()).toBe('keyboard');

        tracker.destroy();
        documentRef.dispatchEvent(new Event('pointerdown'));

        expect(documentRef.documentElement.getAttribute('data-input-modality')).toBeNull()
    });

    test('fails safe when no document exists', async () => {
        delete globalThis.document;

        const tracker = Neo.create(InputModality);

        trackers.push(tracker);
        await tracker.ready();

        expect(tracker.getModality()).toBeNull();
        expect(tracker.setModality({modality: 'keyboard', windowId: 'missing-window'})).toBe(false)
    })
});
