Custom drag&drop implementation.

Deeply inspired by the Shopify implementation:
https://github.com/Shopify/draggable

We cannot use this one for neo.mjs, since our apps => event handlers live inside the App Worker,
and the lib is not using correct import statements (including file name extensions).