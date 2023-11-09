import Base from '../../../../src/component/Base.mjs';

/**
 * @class LearnNeo.view.home.ContentView
 * @extends Neo.component.Base
 */
class ContentComponent extends Base {
    static config = {
        /**
         * @member {String} className='LearnNeo.view.home.ContentView'
         * @protected
         */
        className: 'LearnNeo.view.home.ContentView',
        /**
         * @member {String[]} baseCls=['learn-content']
         * @protected
         */
        baseCls: ['learn-content']
    }

    onConstructed() {
        super.onConstructed();
        this.getModel()
        this.addDomListeners({
            click: this.onClick,
            scope: this
        });
    }

    onClick(data) {
        if (data.altKey && data.shiftKey && !data.metaKey) this.fire('edit', {component: this, record: this.record});
        if (!data.altKey && data.shiftKey && data.metaKey) this.fire('refresh', {component: this, record: this.record}); // Command/windows shift click = refresh
    }

}

Neo.applyClassConfig(ContentComponent);

export default ContentComponent;
