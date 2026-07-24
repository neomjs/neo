import {setup} from '../../../setup.mjs';

setup({appConfig: {appName: 'TestApp'}});

import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import {test, expect} from '@playwright/test';
import FileUpload     from '../../../../../src/form/field/FileUpload.mjs';
import Transport      from '../../../../../src/form/field/fileUpload/Transport.mjs';
import Xhr            from '../../../../../src/form/field/fileUpload/Xhr.mjs';

class TestTransport extends Transport {
    static config = {
        className: 'Test.form.field.fileUpload.Transport'
    }

    aborted = false
    deletedDocumentIds = []
    pendingReject = null
    statusDocumentIds = []
    uploadCalls = []

    upload({file, onProgress}) {
        this.uploadCalls.push(file);
        onProgress({loaded: 5, total: 10});

        if (file.pending) {
            return new Promise((resolve, reject) => {
                this.pendingReject = reject
            })
        }

        return Promise.resolve({success: true, documentId: 17})
    }

    abort() {
        this.aborted = true;

        if (this.pendingReject) {
            const error = new Error('Test upload aborted.');

            error.name = 'AbortError';
            this.pendingReject(error);
            this.pendingReject = null
        }
    }

    async deleteDocument(documentId) {
        this.deletedDocumentIds.push(documentId);

        return {status: 200, statusText: 'OK'}
    }

    async checkDocumentStatus(documentId) {
        this.statusDocumentIds.push(documentId);

        return {
            status    : 200,
            statusText: 'OK',
            json      : async () => ({status: 'AVAILABLE'})
        }
    }
}

Neo.setupClass(TestTransport);

class FakeEventTarget {
    listeners = {}

    addEventListener(name, listener) {
        (this.listeners[name] || (this.listeners[name] = [])).push(listener)
    }

    emit(name, event) {
        this.listeners[name]?.forEach(listener => listener(event))
    }
}

class FakeXMLHttpRequest extends FakeEventTarget {
    static autoComplete = true
    static emitNetworkError = false
    static instances = []
    static response = {success: true, documentId: 42}
    static status = 200

    headers = {}
    response = ''
    status = 0
    upload = new FakeEventTarget()

    constructor() {
        super();
        FakeXMLHttpRequest.instances.push(this)
    }

    abort() {
        this.aborted = true;
        this.upload.emit('abort', {});
        this.emit('loadend', {loaded: 0, target: this})
    }

    open(method, url, async) {
        this.openArgs = {method, url, async}
    }

    send(body) {
        this.body = body;

        if (FakeXMLHttpRequest.autoComplete) {
            queueMicrotask(() => {
                if (FakeXMLHttpRequest.emitNetworkError) {
                    this.upload.emit('error', {});
                    this.emit('loadend', {loaded: 0, target: this});
                    return
                }

                this.upload.emit('progress', {loaded: 5, total: 10});
                this.status = FakeXMLHttpRequest.status;
                this.response = JSON.stringify(FakeXMLHttpRequest.response);
                this.emit('loadend', {loaded: 10, target: this})
            })
        }
    }

    setRequestHeader(name, value) {
        this.headers[name] = value
    }
}

test.describe('FileUpload documented-optional URL configs', () => {
    test('null URL configs pass through the beforeGet hooks without throwing', () => {
        let instance = Neo.create(FileUpload, {
            appName  : 'TestApp',
            uploadUrl: '/upload'
        });

        expect(instance.documentStatusUrl).toBeNull();
        expect(instance.documentDeleteUrl).toBeNull();
        expect(instance.downloadUrl).toBeNull();

        instance.destroy()
    });

    test('createUrl passes nullish patterns through unchanged', () => {
        let instance = Neo.create(FileUpload, {
            appName  : 'TestApp',
            uploadUrl: '/upload'
        });

        expect(instance.createUrl(null, {documentId: 1})).toBeNull();
        expect(instance.createUrl(undefined, {documentId: 1})).toBeUndefined();
        expect(instance.createUrl('/documents/{documentId}', {documentId: 42})).toBe('/documents/42');

        instance.destroy()
    });

    test('createUrl fails fast only when a present token has a nullish value', () => {
        let instance = Neo.create(FileUpload, {
            appName  : 'TestApp',
            uploadUrl: '/upload'
        });

        expect(() => instance.createUrl('/documents/{documentId}', {documentId: null}))
            .toThrow('Cannot substitute nullish URL parameter: documentId');
        expect(() => instance.createUrl('/documents/{documentId}', {documentId: undefined}))
            .toThrow('Cannot substitute nullish URL parameter: documentId');

        expect(instance.createUrl('/documents/static', {documentId: null})).toBe('/documents/static');
        expect(instance.createUrl('/documents/{otherId}', {documentId: undefined})).toBe('/documents/{otherId}');
        expect(instance.createUrl('/documents/{documentId}', {documentId: 0})).toBe('/documents/0');
        expect(instance.createUrl('/documents/{documentId}', {documentId: false})).toBe('/documents/false');
        expect(instance.createUrl('/documents/{documentId}', {documentId: ''})).toBe('/documents/');

        instance.destroy()
    });

    test('an upload-only field reaches downloadable on success without throwing', () => {
        let instance = Neo.create(FileUpload, {
            appName  : 'TestApp',
            uploadUrl: '/upload'
        });

        expect(() => instance.onUploadDone({success: true, documentId: 42})).not.toThrow();

        expect(instance.documentId).toBe(42);
        expect(instance.state).toBe('downloadable');

        instance.destroy()
    });

    test('configured URLs inherit fail-fast substitution while token-free and function forms remain valid', () => {
        let instance = Neo.create(FileUpload, {
            appName          : 'TestApp',
            documentDeleteUrl: '/documents/{documentId}',
            documentStatusUrl: '/status/{documentId}',
            downloadUrl      : '/download/{documentId}',
            uploadUrl        : '/upload'
        });

        instance.documentId = 7;

        expect(instance.documentDeleteUrl).toBe('/documents/7');
        expect(instance.documentStatusUrl).toBe('/status/7');
        expect(instance.downloadUrl).toBe('/download/7');

        instance.documentId = null;

        expect(() => instance.documentDeleteUrl).toThrow('Cannot substitute nullish URL parameter: documentId');
        expect(() => instance.documentStatusUrl).toThrow('Cannot substitute nullish URL parameter: documentId');
        expect(() => instance.downloadUrl).toThrow('Cannot substitute nullish URL parameter: documentId');

        instance.destroy();

        instance = Neo.create(FileUpload, {
            appName          : 'TestApp',
            documentDeleteUrl: '/documents/static',
            documentStatusUrl: () => '/status/fn',
            downloadUrl      : '/download/static',
            uploadUrl        : '/upload'
        });

        expect(instance.documentDeleteUrl).toBe('/documents/static');
        expect(instance.documentStatusUrl).toBe('/status/fn');
        expect(instance.downloadUrl).toBe('/download/static');

        instance.destroy()
    });
});

test.describe('FileUpload transport seam', () => {
    test('class transports are field-owned while passed instances remain caller-owned', () => {
        const
            ownedField     = Neo.create(FileUpload, {
                appName        : 'TestApp',
                uploadTransport: TestTransport,
                uploadUrl      : '/unused'
            }),
            ownedTransport = ownedField.uploadTransport;

        expect(ownedTransport).toBeInstanceOf(TestTransport);
        expect(ownedTransport.field).toBe(ownedField);

        ownedField.destroy();

        expect(ownedTransport.isDestroyed).toBe(true);

        const
            externalTransport = Neo.create(TestTransport),
            externalField     = Neo.create(FileUpload, {
                appName        : 'TestApp',
                uploadTransport: externalTransport,
                uploadUrl      : '/unused'
            });

        externalField.destroy();

        expect(externalTransport.isDestroyed).not.toBe(true);
        expect(externalTransport.field).toBeNull();

        externalTransport.destroy()
    });

    test('reactive transport replacement aborts the old host and preserves ownership provenance', () => {
        const
            field             = Neo.create(FileUpload, {
                appName        : 'TestApp',
                uploadTransport: TestTransport,
                uploadUrl      : '/unused'
            }),
            ownedTransport    = field.uploadTransport,
            externalTransport = Neo.create(TestTransport);

        field.uploadTransport = externalTransport;

        expect(ownedTransport.isDestroyed).toBe(true);
        expect(externalTransport.field).toBe(field);

        field.uploadTransport = TestTransport;

        expect(externalTransport.aborted).toBe(true);
        expect(externalTransport.isDestroyed).not.toBe(true);
        expect(externalTransport.field).toBeNull();
        expect(field.uploadTransport).toBeInstanceOf(TestTransport);

        const replacementTransport = field.uploadTransport;

        field.destroy();

        expect(replacementTransport.isDestroyed).toBe(true);

        externalTransport.destroy()
    });

    test('a non-XHR transport drives progress, completion, abort, delete, and status', async () => {
        const field = Neo.create(FileUpload, {
            appName        : 'TestApp',
            uploadTransport: TestTransport,
            uploadUrl      : '/unused'
        });

        field.timeout = () => Promise.resolve();

        await field.upload({name: 'complete.txt', size: 10});

        const {uploadTransport} = field;

        expect(uploadTransport.uploadCalls).toHaveLength(1);
        expect(field.progress).toBe(0.5);
        expect(field.uploadSize).toBe(5);
        expect(field.documentId).toBe(17);
        expect(field.state).toBe('downloadable');

        field.documentStatusUrl = '/status/{documentId}';
        field.state = 'processing';
        await field.checkDocumentStatus();

        expect(uploadTransport.statusDocumentIds).toEqual([17]);
        expect(field.state).toBe('not-downloadable');

        await field.deleteDocument();

        expect(uploadTransport.deletedDocumentIds).toEqual([17]);
        expect(field.state).toBe('ready');

        const pendingUpload = field.upload({name: 'pending.txt', pending: true, size: 10});

        await expect.poll(() => Boolean(uploadTransport.pendingReject)).toBe(true);
        field.abortUpload();
        await pendingUpload;

        expect(uploadTransport.aborted).toBe(true);
        expect(field.state).toBe('ready');

        field.destroy()
    });
});

test.describe('FileUpload default XHR transport', () => {
    let originalFetch, originalFormData, originalXMLHttpRequest;

    test.beforeEach(() => {
        originalFetch = globalThis.fetch;
        originalFormData = globalThis.FormData;
        originalXMLHttpRequest = globalThis.XMLHttpRequest;

        FakeXMLHttpRequest.autoComplete = true;
        FakeXMLHttpRequest.emitNetworkError = false;
        FakeXMLHttpRequest.instances = [];
        FakeXMLHttpRequest.response = {success: true, documentId: 42};
        FakeXMLHttpRequest.status = 200;
        globalThis.XMLHttpRequest = FakeXMLHttpRequest
    });

    test.afterEach(() => {
        globalThis.fetch = originalFetch;
        globalThis.FormData = originalFormData;
        globalThis.XMLHttpRequest = originalXMLHttpRequest
    });

    test('preserves upload, header injection, progress, status, and delete behavior', async () => {
        const fetchCalls = [];

        globalThis.fetch = async (url, options) => {
            fetchCalls.push({url, options});

            return url.startsWith('/status/')
                ? {status: 200, statusText: 'OK', json: async () => ({status: 'AVAILABLE'})}
                : {status: 200, statusText: 'OK'}
        };

        const field = Neo.create(FileUpload, {
            appName          : 'TestApp',
            documentDeleteUrl: '/delete/{documentId}',
            documentStatusUrl: '/status/{documentId}',
            headers          : {'X-Base': 'base'},
            uploadUrl        : '/upload'
        });

        field.timeout = () => Promise.resolve();
        field.on('beforeRequest', ({headers}) => {
            headers['X-Injected'] = 'yes'
        });

        const file = new Blob(['x']);

        Object.defineProperty(file, 'name', {value: 'xhr.txt'});

        await field.upload(file);
        await expect.poll(() => field.state).toBe('not-downloadable');

        const xhr = FakeXMLHttpRequest.instances[0];

        expect(field.uploadTransport).toBeInstanceOf(Xhr);
        expect(xhr.openArgs).toEqual({method: 'POST', url: '/upload', async: true});
        expect(xhr.headers).toEqual({'X-Base': 'base', 'X-Injected': 'yes'});
        expect(field.progress).toBe(0.5);
        expect(field.documentId).toBe(42);
        expect(fetchCalls[0]).toEqual({
            url    : '/status/42',
            options: {headers: {'X-Base': 'base', 'X-Injected': 'yes'}}
        });

        await field.deleteDocument();

        expect(fetchCalls[1]).toEqual({
            url    : '/delete/42',
            options: {
                method : 'DELETE',
                headers: {'X-Base': 'base', 'X-Injected': 'yes'}
            }
        });
        expect(field.state).toBe('ready');

        field.destroy()
    });

    test('delegates abort to the active XMLHttpRequest', async () => {
        FakeXMLHttpRequest.autoComplete = false;

        const field = Neo.create(FileUpload, {
            appName  : 'TestApp',
            uploadUrl: '/upload'
        });

        field.timeout = () => Promise.resolve();

        const file = new Blob(['x']);

        Object.defineProperty(file, 'name', {value: 'abort.txt'});

        const uploadPromise = field.upload(file);

        await expect.poll(() => FakeXMLHttpRequest.instances.length).toBe(1);
        field.abortUpload();
        await uploadPromise;

        expect(FakeXMLHttpRequest.instances[0].aborted).toBe(true);
        expect(field.state).toBe('ready');

        field.destroy()
    });

    test('preserves server-declared and network upload failure states', async () => {
        FakeXMLHttpRequest.status = 400;
        FakeXMLHttpRequest.response = {success: false, message: 'Rejected by service'};

        let field = Neo.create(FileUpload, {
            appName  : 'TestApp',
            uploadUrl: '/upload'
        });

        field.timeout = () => Promise.resolve();

        let file = new Blob(['x']);

        Object.defineProperty(file, 'name', {value: 'rejected.txt'});

        await field.upload(file);

        expect(field.state).toBe('upload-failed');
        expect(field.error).toBe('Rejected by service');

        field.destroy();

        FakeXMLHttpRequest.emitNetworkError = true;

        field = Neo.create(FileUpload, {
            appName  : 'TestApp',
            uploadUrl: '/upload'
        });
        field.timeout = () => Promise.resolve();
        file = new Blob(['x']);

        Object.defineProperty(file, 'name', {value: 'network.txt'});

        await field.upload(file);

        expect(field.state).toBe('upload-failed');
        expect(field.error).toBe(field.uploadError);

        field.destroy()
    });

    test('preserves non-success delete and status mappings', async () => {
        globalThis.fetch = async () => ({
            status    : 503,
            statusText: 'Unavailable'
        });

        const field = Neo.create(FileUpload, {
            appName          : 'TestApp',
            documentDeleteUrl: '/delete/{documentId}',
            documentStatusUrl: '/status/{documentId}',
            uploadUrl        : '/upload'
        });

        field.documentId = 42;
        field.state = 'processing';
        await field.checkDocumentStatus();

        expect(field.state).toBe('deleted');
        expect(field.error).toBe(`${field.documentStatusError}: Unavailable`);

        field.state = 'not-downloadable';
        await field.deleteDocument();

        expect(field.state).toBe('not-downloadable');
        expect(field.error).toBe(`${field.documentDeleteError}: Unavailable`);

        field.destroy()
    });
});
