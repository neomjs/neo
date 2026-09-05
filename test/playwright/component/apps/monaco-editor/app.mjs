import MonacoEditor from '../../../../../src/component/wrapper/MonacoEditor.mjs';
import Viewport     from '../../../../../src/container/Viewport.mjs';

/**
 * @summary Records real wrapper callbacks in the App Worker; Monaco and its loader are unchanged.
 * @class Test.Playwright.MonacoEditor.Editor
 * @extends Neo.component.wrapper.MonacoEditor
 */
class Editor extends MonacoEditor {
    static config = {
        /** @member {String} className='Test.Playwright.MonacoEditor.Editor' */
        className: 'Test.Playwright.MonacoEditor.Editor',
        /** @member {String} ntype='test-monaco-editor' */
        ntype: 'test-monaco-editor',
        /** @member {String} testGeneration='initial' */
        testGeneration: 'initial'
    }

    /** @member {Number} changeCount=0 */
    changeCount = 0
    /** @member {String|null} lastChangedValue=null */
    lastChangedValue = null

    /**
     * @summary Retains the event received through the native editor-to-worker route.
     * @param {Object} data
     */
    onContentChange(data) {
        this.changeCount++;
        this.lastChangedValue = data.value;
        super.onContentChange(data)
    }

    /** @summary Records which wrapper generation received a successful mount callback. */
    onEditorMounted() {
        Neo.getComponent('monaco-test-viewport').mountReceipts.push(this.testGeneration)
    }
}
Editor = Neo.setupClass(Editor);

/**
 * @summary Owns a real editor and an observable record of completed mount generations.
 * @class Test.Playwright.MonacoEditor.Viewport
 * @extends Neo.container.Viewport
 */
class EditorViewport extends Viewport {
    static config = {
        /** @member {String} className='Test.Playwright.MonacoEditor.Viewport' */
        className: 'Test.Playwright.MonacoEditor.Viewport',
        /** @member {String} id='monaco-test-viewport' */
        id: 'monaco-test-viewport',
        /** @member {String} layout='fit' */
        layout: 'fit',
        /** @member {Object[]} items */
        items: [{
            module           : Editor,
            editorTheme      : 'vs',
            id               : 'monaco-test-editor',
            language         : 'javascript',
            useThemeAwareness: false,
            value            : 'const boot = 1;'
        }]
    }

    /** @member {String[]} mountReceipts=[] */
    mountReceipts = []
}
EditorViewport = Neo.setupClass(EditorViewport);

/** @summary Starts the dedicated browser fixture with ordinary Neo worker boot. */
export const onStart = () => Neo.app({
    mainView: EditorViewport,
    name    : 'Test.Playwright.MonacoEditor'
});
