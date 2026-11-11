import {setup} from '../../../setup.mjs';

setup({
    appConfig: {name: 'MainFileDownloadUnit'},
    mockMain : false
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';

const previousSlot = Neo.main?.addon?.FileDownload;
previousSlot && delete Neo.main.addon.FileDownload;
const {default: FileDownload} = await import('../../../../../src/main/addon/FileDownload.mjs');

const
    originalDocument = globalThis.document,
    originalSetTimeout = globalThis.setTimeout,
    originalCreateObjectURL = URL.createObjectURL,
    originalRevokeObjectURL = URL.revokeObjectURL,
    documentRef = {
        body: {
            appendChild(anchor) {
                anchor.parentNode = this
            }
        },
        createElement(tag) {
            if (tag !== 'a') throw new Error(`unexpected tag: ${tag}`);

            return {
                style: {},
                click() { this.clicked = true },
                remove() { this.removed = true }
            }
        }
    },
    createdBlobs = [],
    pendingCallbacks = [],
    revokedUrls = [];

test.describe('Neo.main.addon.FileDownload#saveText', () => {
    test.beforeEach(() => {
        globalThis.document = documentRef;
        globalThis.setTimeout = callback => {
            pendingCallbacks.push(callback);
            return 0
        };
        URL.createObjectURL = blob => {
            createdBlobs.push(blob);
            return `blob:file-download-${createdBlobs.length}`
        };
        URL.revokeObjectURL = url => revokedUrls.push(url);
        createdBlobs.length = 0;
        pendingCallbacks.length = 0;
        revokedUrls.length = 0
    });

    test.afterEach(() => {
        globalThis.setTimeout = originalSetTimeout;
        URL.createObjectURL = originalCreateObjectURL;
        URL.revokeObjectURL = originalRevokeObjectURL
    });

    test.afterAll(() => {
        originalDocument === undefined ? delete globalThis.document : globalThis.document = originalDocument;
        previousSlot && (Neo.main.addon.FileDownload = previousSlot)
    });

    test('downloads a String payload with the requested MIME type', async () => {
        const
            content = 'name,value\nFahim,1\n',
            result = FileDownload.prototype.saveText.call({}, {
                content,
                fileName: 'rows.csv',
                mimeType: 'text/csv'
            }),
            blob = createdBlobs[0];

        expect(result).toBe(true);
        expect(blob).toBeInstanceOf(Blob);
        expect(blob.type).toBe('text/csv');
        expect(await blob.text()).toBe(content);
        expect(pendingCallbacks).toHaveLength(1);
        pendingCallbacks[0]();
        expect(revokedUrls).toEqual(['blob:file-download-1'])
    });

    test('downloads a Uint8Array payload without changing its bytes', async () => {
        const
            content = new Uint8Array([0, 127, 128, 255]),
            result = FileDownload.prototype.saveText.call({}, {
                content,
                fileName: 'archive.bin',
                mimeType: 'application/octet-stream'
            }),
            blob = createdBlobs[0],
            bytes = new Uint8Array(await blob.arrayBuffer());

        expect(result).toBe(true);
        expect(blob).toBeInstanceOf(Blob);
        expect(blob.type).toBe('application/octet-stream');
        expect(blob.size).toBe(content.byteLength);
        expect(Array.from(bytes)).toEqual(Array.from(content));
        expect(pendingCallbacks).toHaveLength(1);
        pendingCallbacks[0]();
        expect(revokedUrls).toEqual(['blob:file-download-1'])
    });
});
