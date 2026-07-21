import {setup} from '../../../setup.mjs';

setup({appConfig: {appName: 'TestApp'}});

import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import {test, expect} from '@playwright/test';
import FileUpload     from '../../../../../src/form/field/FileUpload.mjs';

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

    test('an upload-only field reaches downloadable on success without throwing', () => {
        let instance = Neo.create(FileUpload, {
            appName  : 'TestApp',
            uploadUrl: '/upload'
        });

        expect(() => instance.onUploadDone({
            loaded: 100,
            target: {
                status  : 200,
                response: JSON.stringify({success: true, documentId: 42})
            }
        })).not.toThrow();

        expect(instance.documentId).toBe(42);
        expect(instance.state).toBe('downloadable');

        instance.destroy()
    });

    test('configured URLs keep token substitution and the function form', () => {
        let calls    = [],
            instance = Neo.create(FileUpload, {
                appName          : 'TestApp',
                documentDeleteUrl: '/documents/{documentId}',
                documentStatusUrl: () => '/status/fn',
                uploadUrl        : '/upload'
            });

        instance.documentId = 7;

        expect(instance.documentDeleteUrl).toBe('/documents/7');
        expect(instance.documentStatusUrl).toBe('/status/fn');

        instance.documentId = null;
        expect(instance.documentDeleteUrl).toBe('/documents/null');

        instance.destroy()
    });
});
