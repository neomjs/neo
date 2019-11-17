1. constructor
2. onConstructed
3. init
4. render
5. mount
6. addDomListeners
7. destroy [optional]

(1) Since constructors of ES6 classes may not use "this" before the parent call, this one does very little,
except registering the new Component to the Component Manager.

(2) onConstructed gets called after the constructor chain is done and basically the replacement for the constructor logic.

(3) init gets called after the onConstructed chain is done and will call render in case the autoRender-config is set to true.

(4) render will call the Vdom worker sending the vdom (markup) and getting a vnode back.
Instances with children (e.g. Container -> items) will delegate the sub-trees (vnodes) downwards.

(5) mount will send the full vnode-tree of your app (containing the outerHTML) to the main thread and create the real DOM.

(6) Since the vdom & vnode should not be aware of any DOM listeners, applying DOM listeners to the real DOM happens after mount.

(7) Destroying a Component will unregister it from the Component Manager & clear the listener references