This folder contains entrypoints for the webpack based builds.

There no longer is a separate build for the App Worker & each example,

only combinations of the App Worker AND the code of each example.


Webpack was creating different chunks otherwise, resulting in redundand code for each example & the App Worker.
Even worse, there were colliding classes (e.g. Neo itself, the IdGenerator etc.) and it felt kind of random
which target module Webpack was using.

The downside however is, that builds are no longer able to lazy load apps.

In case there is a way to enforce chunk merges for webpack and solve this better, please create a new ticket.

The ideal scenario would be that the App Worker gets build as a single entrypoint and each example only contains
the bundled modules which are **not** included inside the App worker.

If possible, there should be a base-chunk in case you want to use multiple apps which contains the bundled modules
used by all apps. This would allow us to lazy load apps like it is working without a build.
