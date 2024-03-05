When a Neo.mjs application starts, the framework spawns three web-workers, in addition
to the main browser thread, resulting in:

1. The <b>main</b> browser thread, where DOM updates are applied
2. An <b>application</b> web-worker where normal application logic is run
3. A <b>data</b> web-worker were HTTP and socket calls are run
4. A <b>view</b> web-worker that manages delta updates

The benefits of using web workers is that each runs in parallel its own thread. In a typical framework
all code is run in the main thread, so processes compete for CPU cycles.

Neo.mjs also allows you to easily spawn additional threads in order to have processor-intensive
tasks to be run separately.
