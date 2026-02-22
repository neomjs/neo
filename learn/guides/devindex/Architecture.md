# DevIndex Architecture

DevIndex is built on the **Neo.mjs** platform, leveraging its multi-threaded architecture for high-performance data visualization.

## Frontend
-   **Grid**: A `Neo.grid.Container` capable of rendering 50k+ rows with 60fps scrolling.
-   **Workers**: Data processing (sorting, filtering) happens in the **Data Worker**, keeping the UI responsive.
-   **Sparklines**: Rendered via **OffscreenCanvas** in a separate thread.

## Backend Services
-   **Spider**: Node.js service for graph discovery.
-   **Updater**: Scheduled task for fetching latest contribution data.
-   **API**: Serves the pre-computed JSON index to the frontend.
