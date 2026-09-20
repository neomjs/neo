import Viewport  from '../../../../../src/container/Viewport.mjs';
import Container from '../../../../../src/container/Base.mjs';
import Component from '../../../../../src/component/Base.mjs';
// Registers the `layout-cube` ntype. The import is the registration: Cube.mjs
// runs Neo.setupClass at module scope, and a container resolves its layout by
// ntype through that registry, so the module has to be evaluated before the
// container is constructed.
import CubeLayout from '../../../../../src/layout/Cube.mjs';

/**
 * @summary Component-test fixture for Neo.layout.Cube.
 *
 * The cube's six faces are addressable by id so a spec can read the rendered
 * result instead of the config it just wrote. `applyChildAttributes` maps child
 * index to face name, so the declared order here is part of the contract the
 * spec relies on.
 *
 * @class Neo.LayoutCubeTestApp.MainContainer
 * @extends Neo.container.Base
 */
class MainContainer extends Container {
    static config = {
        className: 'Neo.LayoutCubeTestApp.MainContainer',
        cls      : ['layout-cube-test-maincontainer'],
        /**
         * Fixed side length, so the expected transform of each face is a value
         * the spec derives rather than one it reads back off the instance.
         */
        height: 300,
        layout: {ntype: 'cube', perspective: 600},
        width : 300
    }
}

MainContainer = Neo.setupClass(MainContainer);

/**
 * @summary Drives the cube from inside the app scope.
 *
 * `Neo.get` resolves instances in the app worker, so a spec cannot call it from
 * `page.evaluate`, which runs on the main thread. The dock fixtures solve this
 * the same way: the app exposes the handle and the spec calls through it.
 * @param {String} face
 */
export const setActiveFace = (face) => {
    const container = Neo.get('layout-cube-under-test');
    container.layout.activeFace = face;
    return container.layout.activeIndex;
};

export const onStart = () => Neo.app({
    mainView: {
        module : Viewport,
        items  : [{
            id    : 'layout-cube-under-test',
            module: MainContainer,
            items : ['front', 'back', 'left', 'right', 'top', 'bottom'].map(name => ({
                module     : Component,
                cls        : ['cube-face-content'],
                html       : name,
                id         : `cube-face-${name}`,
                'data-face': name,
                style      : {fontSize: '24px', padding: '8px'}
            }))
        }]
    },
    name: 'LayoutCubeTestApp'
});
