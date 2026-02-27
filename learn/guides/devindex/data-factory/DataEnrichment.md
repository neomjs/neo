# Data Enrichment Utilities

The `Updater` engine relies on two specialized, stateless utility services to normalize and enrich the raw data retrieved from GitHub before it is minified and persisted: **`LocationNormalizer`** and **`Heuristics`**.

While the high-level concepts of these metrics are described in the [Methodology](../Methodology.md) guide, this document explains the specific engineering and mathematical logic used to compute them.

---

## 1. The Heuristics Engine (Anomaly Detection)

The **Heuristics Service** ([`DevIndex.services.Heuristics`](https://github.com/neomjs/neo/blob/dev/apps/devindex/services/Heuristics.mjs)) analyzes a user's multi-year contribution array (`y`) to identify extraordinary patterns. 

GitHub's ecosystem is vast, and a pure sum of contributions (`total_contributions`) masks the *shape* of a developer's career. The engine computes three distinct "Cyborg Metrics" that help researchers distinguish between organic long-term maintainers and highly automated systems or short-term anomalies.

### Consistency (`c`)
**Concept:** "How many years has this developer been actively building?"
*   **Implementation:** The engine filters the array of yearly contributions and counts the years where total contributions strictly exceeded `100`.
*   **Rationale:** The `> 100` threshold deliberately filters out "Hello World" years, account creation years, or long dormant periods, ensuring the metric reflects sustained, meaningful involvement.

### Velocity (`v`)
**Concept:** "At their absolute peak, how fast was this developer moving?"
*   **Implementation:** The engine identifies the absolute maximum value in the yearly contribution array and divides it by `365` (rounding to the nearest whole integer).
*   **Rationale:** `maxYear / 365` yields the average daily commit rate *during their busiest year*. A velocity of `1-10` is typical for a strong senior engineer. A velocity of `>100` almost guarantees heavy automation or a very specialized workflow (like merging hundreds of automated dependency updates per day).

### Acceleration (`a`)
**Concept:** "How much of an outlier was their peak year compared to their normal baseline?"
*   **Implementation:** 
    1.  The engine sorts the array of *active years* (`> 100` contributions).
    2.  It calculates the **Median** value of these active years to establish a robust "Baseline". (Using the median instead of the mean prevents the peak year itself from heavily skewing the baseline).
    3.  It divides the `maxYear` by this `median` baseline.
*   **Rationale:** If a developer consistently pushes 2,000 commits a year, and their peak is 2,500, their acceleration is `~1.25` (steady). If a developer normally pushes 500 commits a year, but suddenly pushes 50,000 in one year, their acceleration is `100.0` (massive anomaly).

```javascript readonly
// Acceleration Calculation (Median Baseline)
activeYears.sort((a, b) => a - b);
const mid = Math.floor(consistency / 2);
const median = consistency % 2 !== 0 ? activeYears[mid] : (activeYears[mid - 1] + activeYears[mid]) / 2;

const acceleration = parseFloat((maxYear / median).toFixed(2));
```

---

## 2. Location Normalizer

The **Location Normalizer Service** ([`DevIndex.services.LocationNormalizer`](https://github.com/neomjs/neo/blob/dev/apps/devindex/services/LocationNormalizer.mjs)) solves a notoriously difficult data hygiene problem: converting free-text, user-inputted GitHub location strings into standardized ISO 3166-1 Alpha-2 country codes.

To do this efficiently and accurately without relying on external (and expensive) geocoding APIs, the service employs a multi-tiered parsing strategy.

### Tier 1: Regex & Boundary Matching
The fastest and most reliable method is directly matching common country names or abbreviations using regular expressions with word boundaries (`\b`). 

```javascript readonly
if (/\b(germany|deutschland)\b/.test(text)) return 'DE';
if (/\b(united states|usa|u\.s\.a|us)\b/.test(text)) return 'US';
```

#### The US State Code Collision Problem
Matching US State abbreviations (like `WA`, `OH`, `IN`) is highly error-prone because they frequently conflict with other words or ISO codes:
*   `IN` = India OR Indiana
*   `CA` = Canada OR California
*   `DE` = Germany OR Delaware
*   `Doha` contains `oh` (Ohio).

To solve this, the normalizer:
1.  **Excludes Major Collisions:** Removes `CA`, `DE`, `IN`, and `ID` entirely from the US State abbreviation list.
2.  **Enforces Boundaries:** Uses `\b` to ensure "Doha" does not trigger "OH".
3.  **Accepts Minor Collisions:** Statistically, "IL" (Illinois/Israel) or "GA" (Georgia/Gabon) appearing in the DevIndex dataset are overwhelmingly more likely to refer to the US State. The service accepts these minor heuristics.

### Tier 2: The City Map
For strings that don't explicitly mention a country or a state, the normalizer falls back to a hardcoded `Map` of major global tech hubs and cities.

```javascript readonly
static cityMap = new Map([
    ['berlin', 'DE'], ['munich', 'DE'], ['münchen', 'DE'],
    ['san francisco', 'US'], ['sf', 'US'], ['bay area', 'US'],
    ['london', 'GB'], ['paris', 'FR'], ['tokyo', 'JP']
    // ...
]);
```
**Curatorial Caveat:** This hardcoded map requires continuous, intentional expansion to avoid Western-centric bias. For example, if massive tech hubs in India (like Hyderabad or Pune) or China (like Hangzhou or Chengdu) are not mapped, their populations will be statistically underrepresented in the final dataset. The project maintainer regularly adds new global hubs to this map as they are discovered in the raw data.

### Tier 3: Trailing Code Extraction
As a final fallback, the parser looks for a two-letter uppercase code at the absolute end of the string, which commonly represents an ISO code or US State (e.g., `"Seattle, WA, US"` or `"Berlin, DE"`).

```javascript readonly
const codeMatch = rawLocation.match(/\b([A-Z]{2})\b$/);
```

If all three tiers fail, the service gracefully returns `null`, and the user's location is left blank in the index rather than risking a false positive.