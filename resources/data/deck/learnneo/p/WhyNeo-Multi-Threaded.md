When a Neo.mjs application starts, the framework spawns three web-workers, in addition
to the main browser thread, resulting in:

1. The <b>main</b> browser thread, where DOM updates are applied
1. An <b>application</b> web-worker where normal application logic is run
1. A <b>data</b> web-worker were HTTP and socket calls are run
1. A <b>view</b> web-worker that manages delta updates

