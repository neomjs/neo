import Dialog from '../../../../../src/dialog/Base.mjs';

/**
 * @module test/playwright/component/apps/dialog-modal/driver
 * @summary Opens, hides or destroys the fixture's modal Dialog inside the App Worker, one action per import, named
 * by the module's `action` query parameter. The caller adds a counter to the query, so each call evaluates again.
 */
const {searchParams} = new URL(import.meta.url),
      id             = 'dialog-modal-under-test',
      action         = searchParams.get('action');

switch (action) {
    case 'open':
        // An animateTargetId makes init() show the dialog through its animated mount flight. A retained dialog
        // (closeAction 'hide') ends its hide in unmount(), the path a hide during that flight lands on.
        Neo.create(Dialog, {
            animateTargetId: 'dialog-modal-target',
            closeAction    : 'hide',
            height         : 200,
            id,
            modal          : true,
            title          : 'Probe',
            width          : 300
        });
        break;
    case 'hide':
        Neo.getComponent(id).hide();
        break;
    case 'destroy':
        Neo.getComponent(id)?.destroy();
        break;
    default:
        throw new Error(`Unknown dialog-modal driver action: ${action}`)
}
