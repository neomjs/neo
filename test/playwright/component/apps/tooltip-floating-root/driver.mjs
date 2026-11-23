import Button from '../../../../../src/button/Base.mjs';
import Dialog from '../../../../../src/dialog/Base.mjs';

/**
 * @module test/playwright/component/apps/tooltip-floating-root/driver
 * @summary Opens, hides, shows or destroys a dialog under `document.body` inside the App Worker, one action per
 * import, named by the module's `action` query parameter. `owner=1` gives the dialog the viewport as its
 * `parentComponent`, a logical owner whose DOM it lies outside. The dialog holds a button with a shared tooltip. The
 * caller adds a counter to the query, so each call evaluates again.
 */
const {searchParams} = new URL(import.meta.url),
      owned          = searchParams.get('owner') === '1',
      kind           = owned ? 'owned' : 'unowned',
      id             = `tooltip-floating-root-${kind}`,
      viewport       = Neo.getComponent('tooltip-floating-root-viewport');

switch (searchParams.get('action')) {
    case 'open':
        Neo.create(Dialog, {
            appName        : viewport.appName,
            closeAction    : 'hide',
            height         : 160,
            id,
            parentComponent: owned ? viewport : null,
            style          : {left: owned ? '80px' : '420px', top: '160px'},
            title          : `${kind} dialog`,
            width          : 300,
            windowId       : viewport.windowId,
            items          : [{
                module : Button,
                id     : `${id}-target`,
                text   : 'Edit',
                tooltip: `${kind} tooltip`
            }]
        });
        break;
    case 'hide':
        Neo.getComponent(id).hide(false);
        break;
    case 'show':
        Neo.getComponent(id).show(false);
        break;
    case 'destroy':
        // close() is the dialog's own way out: it removes the dialog's node, and destroys the dialog
        Neo.getComponent(id)?.close(false);
        break;
    default:
        throw new Error(`Unknown tooltip-floating-root driver action: ${searchParams.get('action')}`)
}
