import {setup} from '../../setup.mjs';

const appName = 'ToastTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import Toast          from '../../../../src/component/Toast.mjs';
import ToastManager   from '../../../../src/manager/Toast.mjs';

let originalUpdateItemsInPosition;

/**
 * Helper to fully tear down a Toast instance in unit-test mode where browser CSS `animationend` does not fire.
 * @param {Neo.component.Toast} toast
 */
function cleanupToast(toast) {
    ToastManager.removeToast(toast.id);
    ToastManager.unregister(toast);
    if (!toast.isDestroyed) {
        Component.prototype.destroy.call(toast);
    }
}

test.describe('Neo.component.Toast', () => {
    test.beforeAll(() => {
        originalUpdateItemsInPosition = ToastManager.updateItemsInPosition;
        // Avoid main-thread DOM rect IPC from ToastManager's 50ms post-showToast timer in unit tests
        ToastManager.updateItemsInPosition = async () => {};
    });

    test.afterAll(() => {
        ToastManager.updateItemsInPosition = originalUpdateItemsInPosition;
    });
    test('closable: true and removeDelay > 0 renders close button and auto-dismisses after timeout (#4514)', async () => {
        const toast = Neo.create(Toast, {
            appName,
            closable   : true,
            msg        : 'Closable and auto-vanishing toast',
            removeDelay: 25
        });

        // Close button is rendered in VDOM when closable is true
        expect(toast.getVdomInner().cn[2].removeDom).toBe(false);
        expect(toast.cls.includes('neo-toast-fade-out')).toBe(false);

        toast.mounted = true;

        await toast.timeout(60);

        expect(toast.isDestroying).toBe(true);
        expect(toast.cls.includes('neo-toast-fade-out')).toBe(true);

        const animationEndListeners = toast.domListeners.filter(listener => Boolean(listener.animationend));
        expect(animationEndListeners.length).toBe(1);

        cleanupToast(toast);
    });

    test('closable: true with removeDelay: 0 remains sticky and does not auto-dismiss', async () => {
        const toast = Neo.create(Toast, {
            appName,
            closable   : true,
            msg        : 'Sticky closable toast',
            removeDelay: 0
        });

        expect(toast.getVdomInner().cn[2].removeDom).toBe(false);

        toast.mounted = true;

        await toast.timeout(50);

        expect(toast.isDestroying).toBe(false);
        expect(toast.cls.includes('neo-toast-fade-out')).toBe(false);

        cleanupToast(toast);
    });

    test('manual destroy before removeDelay expires is idempotent and prevents duplicate fade-out', async () => {
        const toast = Neo.create(Toast, {
            appName,
            closable   : true,
            msg        : 'Manually dismissed before timeout',
            removeDelay: 40
        });

        toast.mounted = true;

        // Manually dismiss before removeDelay expires
        await toast.destroy(true);
        expect(toast.cls.includes('neo-toast-fade-out')).toBe(true);

        const listenerCountAfterManualClose = toast.domListeners.filter(listener => Boolean(listener.animationend)).length;
        expect(listenerCountAfterManualClose).toBe(1);

        // Calling destroy again directly or letting removeDelay expire should be a no-op
        await toast.destroy(true);
        await toast.timeout(65);

        const listenerCountAfterTimeout = toast.domListeners.filter(listener => Boolean(listener.animationend)).length;
        expect(listenerCountAfterTimeout).toBe(1);

        cleanupToast(toast);
    });
});
