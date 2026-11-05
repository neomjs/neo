/**
 * @module test/playwright/util/menuLevelReads
 * @summary Reads that tell a menu close which took every level down together from one that left ancestors behind.
 *
 * A close of several levels happens in the one App Worker task that handles its gesture, but each level sends its
 * own `removeNode`, and a busy main thread may apply those in different frames. DOM batches therefore cannot witness
 * the close. These helpers read the App Worker instead. The component tier (`component/menu/List.spec.mjs`)
 * and the Neural Link tier (`e2e/rendering/ContextMenuNL.spec.mjs`) share them.
 */

/**
 * @summary Asks the App Worker whether each level is mounted, in the same main-thread task as the next `type` event.
 *
 * A close of several levels happens in the one App Worker task that handles its gesture: every level's `unmount()`
 * clears `mounted` at once, then sends its own `removeNode`, which a busy main thread may apply in different frames.
 * So the DOM cannot tell a close that took every level down together from one that left the ancestors to a later
 * focus round trip, and neither can a settled assertion, which polls until that round trip has swept them up. A
 * read sent after the gesture resolves can land behind those focus events too. A `window` listener runs after the
 * engine forwarded the event, in the same task, so this read reaches the App Worker right behind the gesture.
 * @param {Object} page
 * @param {String} type The event the gesture ends with: `click` or `keydown`
 * @param {String[]} ids The level ids, outermost first
 * @returns {Promise<void>}
 */
export function readMountedWithNext(page, type, ids) {
    return page.evaluate(({ids, type}) => {
        window.addEventListener(type, () => {
            window.__mountedWithGesture = Promise.all(ids.map(id => Neo.worker.App.getConfigs({id, keys: ['mounted']}).then(([mounted]) => mounted)))
        }, {once: true})
    }, {ids, type})
}

/**
 * @summary Resolves the reads `readMountedWithNext()` sent: one `mounted` per level, outermost first.
 * @param {Object} page
 * @returns {Promise<Boolean[]>}
 */
export function mountedWithGesture(page) {
    return page.evaluate(() => window.__mountedWithGesture)
}

/**
 * @summary The id of the menu level that shows an item.
 * @param {Object} page
 * @param {String} text The item's text
 * @returns {Promise<String>}
 */
export function levelOf(page, text) {
    return page.locator('.neo-menu-list', {has: page.getByText(text, {exact: true})}).getAttribute('id')
}
