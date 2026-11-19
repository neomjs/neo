# Colors Dashboard

The grid and both charts get their data from a WebSocket backend, called through the RPC layer
(`Colors.backend.ColorService.read()`, see `remotes-api.json`). We are using a version where
Max Rahder deployed the backend to:
https://still-castle-38841.herokuapp.com/

When the backend does not answer within two seconds, the app generates the same data itself
(`service/ColorService.mjs`), and the header says which source is live.

To see the full app including the backend code (using the Neo.mjs core),
please take a look at:
https://github.com/neomjs/multiwindowcolors
