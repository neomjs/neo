# Real World App: Version 2
The second version of the Real World app is meant to be an good example of how to craft a neo.mjs app.

### The main differences between version 1 & 2:
1. The first version is using a bootstrap theme, which limits it to only use component.Base
2. The second version will use neo-themes instead
3. This allows us to use other neo.mjs components like list.Base, tab.Container etc.
4. While the first version has to work on a very low vdom level,
the second version can stick to the component tree abstraction layer
5. The amount of code inside the second version should be less and easier to understand.
6. The second version can not stick to the given DOM markup 1:1.