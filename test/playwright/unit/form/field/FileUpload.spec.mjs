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
