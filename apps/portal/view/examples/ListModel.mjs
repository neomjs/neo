import BaseListModel from '../../../../src/selection/ListModel.mjs';

/**
 * @summary Click-selection policy for {@link Portal.view.examples.List} cards, preserving `List#getInteractiveItemIndex`.
 *
 * Wide-viewport mouse/keyboard clicks and `<a>` link clicks leave selection untouched; touch/pen taps and compact
 * (`<= 600px`) card clicks toggle single-card `.neo-selected` disclosure.
 * @class Portal.view.examples.ListModel
 * @extends Neo.selection.ListModel
 * @see Portal.view.examples.List
 */
class ListModel extends BaseListModel {
    static config = {
        /** @member {String} className='Portal.view.examples.ListModel' @protected */
        className: 'Portal.view.examples.ListModel',
        /** @member {String} ntype='portal-examples-listmodel' @protected */
        ntype: 'portal-examples-listmodel'
    }

    /**
     * @summary Toggles card selection only on touch/pen taps or `<= 600px` compact clicks outside `<a>` links.
     * @param {Object} data
     */
    onListClick(data) {
        let me              = this,
            {currentTarget} = data,
            {view}          = me;

        if (view.disableSelection || view.tiles || (!view.isCompactViewport(data) && data.pointerType !== 'touch' && data.pointerType !== 'pen')) {
            return
        }

        for (const entry of data.path || []) {
            if (entry.id === currentTarget) {
                break
            }
            if (entry.tagName === 'a') {
                return
            }
        }

        let record = view.store.get(view.getItemRecordId(currentTarget));

        if (!record) return;

        if (me.isSelected(me.getSelectionItemId(record))) {
            me.deselect(record)
        } else {
            me.select(record)
        }
    }
}

export default Neo.setupClass(ListModel);
