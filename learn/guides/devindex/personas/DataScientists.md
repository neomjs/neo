# Persona Guide: Data Scientists & Researchers

DevIndex is not just a dashboard; it is a free, high-quality, open-data goldmine for researchers, data scientists, and academics studying the open-source ecosystem. The core of DevIndex is a massive, highly optimized dataset containing the complete historical contribution footprints of the top 50,000+ developers on GitHub.

This guide explains how to access and leverage this dataset for advanced analysis.

## 1. Accessing the Data Goldmine

The entire DevIndex backend is effectively a single, hyper-optimized static file: `users.jsonl`. 

This file uses a Newline Delimited JSON (NDJSON) format, making it trivial to ingest into Python (Pandas, Polars), R, or any big data processing pipeline without loading the entire 20MB+ payload into memory at once. Because DevIndex is an open-source project hosted on GitHub Pages, this dataset is publicly accessible and constantly updated.

### Deciphering the Minified Keys

To minimize file size, the JSON keys are heavily minified. Here is the translation key for the most critical data points:
- `l`: Login (GitHub username)
- `tc`: Total Contributions (All-time sum)
- `fy`: First Year active on GitHub
- `y`: Array of Total Contributions per year (from 2010 to present)
- `cy`: Array of Commits per year
- `py`: Array of Private Contributions per year

## 2. The Multi-Year Contribution Matrices

The true power of the dataset lies in the historical arrays (`y`, `cy`, `py`). These arrays provide a continuous, multi-year matrix of a developer's output. 

For example, an array like `y: [0, 0, 500, 1200, 4500, 6000]` allows you to perform longitudinal studies on developer lifecycles, identifying exact points of onboarding, burnout, or sustained peak performance across thousands of users simultaneously.

## 3. The "Cyborg Metrics" (Heuristics)

To assist with anomaly detection and pattern recognition, the DevIndex engine pre-calculates three "Cyborg Metrics" for every user, available in the `hm` (Heuristics Map) object:

*   **Consistency (`c`):** The number of years where total contributions strictly exceeded `100`. This filters out noise and highlights sustained engagement.
*   **Velocity (`v`):** The absolute maximum contributions in a single year divided by 365. This represents the developer's peak daily average commit rate.
*   **Acceleration (`a`):** The peak year's volume divided by the *median* volume of all their active years (>100 contributions). This robustly identifies massive, sudden spikes in output (e.g., jumping from 500 to 50,000 commits in one year).

These pre-computed heuristics are invaluable for segmenting the dataset. You can instantly filter out highly automated "bot" accounts (Velocity > 100) to study human patterns, or conversely, isolate those exact accounts to study the rise of automation in open source.

## 4. Specific Research Use Cases

The depth and cleanliness of the DevIndex dataset open up numerous avenues for academic and industry research:

*   **The Impact of Generative AI:** By analyzing the `cy` (Commits per year) matrices, researchers can look for inflection points in developer output post-2022 (the mainstream adoption of LLMs). Are top developers pushing significantly more code now than they were in 2021? Does Acceleration (`a`) correlate with the release dates of tools like Copilot?
*   **Open Source Sustainability & The "Bus Factor":** By cross-referencing developers with the `tr` (Top Repo) field, researchers can identify critical infrastructure projects that are disproportionately reliant on a single, high-velocity maintainer, quantifying the fragility of the ecosystem.
*   **Developer Burnout Trajectories:** Using the historical matrices, you can track the lifecycle of "Flash in the pan" developers—those with extreme Velocity and Acceleration but low Consistency—to study burnout rates in high-stress framework or cryptocurrency ecosystems.
*   **Macro-Economic & Geographic Disparities:** By combining the `cc` (Country Code) field with total contribution volumes, researchers can perform stark macro-economic analyses. For example, comparing the massive per-capita open-source output of countries like Germany or the UK against the structural incentive gaps in massive developer populations like India, providing empirical data for policy discussions on FOSS funding.