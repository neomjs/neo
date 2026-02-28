# User Guide: Navigating the GitHub Meritocracy Index

Welcome to the DevIndex User Guide! DevIndex is an interactive dashboard designed to visualize the GitHub Meritocracy Index—a ranking of open-source contributors based purely on their all-time code and community contributions, independent of repository popularity or follower counts. 

This guide will walk you through the various data columns presented in the grid, the underlying metrics, and the powerful filtering tools available in the application.

---

## 1. The Grid Columns: A Detailed Walkthrough

The main view of DevIndex is a high-performance grid displaying over 50,000 active GitHub contributors. Here is a column-by-column breakdown of what you are seeing, starting from the left:

### Core Identification
*   **# (Rank):** The user's current rank in the index, starting from 1. This updates dynamically based on the active sorting column.
*   **User:** Displays the contributor's GitHub avatar and their username. The username is a clickable link that takes you directly to their GitHub profile.

### The Metrics
*   **Total:** The primary metric for ranking. By default, this shows "Total Contributions" (the sum of commits to default branches, issues opened, PRs opened, and PR reviews). **Crucially, this column updates dynamically based on the "Data Mode" you select in the settings (e.g., changing to "Total Commits").**
*   **Commits %:** The ratio of a user's *public* commit activity compared to their total *public* contributions. (Note: Because the GitHub API does not distinguish the type of activity within private contributions, private activity is excluded from this calculation to prevent artificially skewing the ratio). A very high ratio (e.g., > 90%) can sometimes indicate an automated bot account, though solo developers using external ticketing systems (like Jira) can also exhibit this pattern.
*   **Private %:** By default, GitHub only exposes public activity. However, users can choose to make their private contributions visible on their GitHub profile. If they do, DevIndex tracks these as well. This column shows the percentage of their total contributions that are private.

### Activity & Trends
*   **Impact (Heuristics):** Provides context about the nature of a user's contributions using specialized badges:
    *   **Velocity:** 🔥 Superhuman (>1k/day) or ⚡ High (>100/day).
    *   **Acceleration:** 🚀 Explosive Growth (>10x) or 📈 Rising Star (>2x).
    *   **Consistency:** 🏛️ Community Pillar (>10y) or 🛡️ Veteran (>5y).
    *   **New:** 🌱 Seedling for brand new contributors.
*   **Activity (Sparkline):** A mini-chart showing the user's contribution trend from 2010 up to the present year. This helps you quickly visualize whether a user is ramping up, consistently active, or cooling down. Like the "Total" column, **the data driving this sparkline changes based on your selected Data Mode**.
*   **Top Repo:** A direct link to the repository, where the user contributed to the most. Heuristics based, we can only check a fraction of repos.
*   **Company:** The company the user is associated with on their GitHub profile.
*   **Location:** Displays a flag corresponding to the user's location. This uses our internal location normalizer to map self-reported text (e.g., "Bay Area") to recognized country codes.

### External Links & Badges
*   **Website:** A link to the user's personal or professional website.
*   **LI:** A direct link to the user's LinkedIn profile.
*   **Hireable:** A checkmark icon that maps directly to the user's GitHub job board status, indicating if they have explicitly marked themselves as "Hireable".
*   **X:** A direct link to the user's X/Twitter profile.
*   **Orgs:** Displays the avatars of the GitHub organizations the user belongs to. To keep the grid clean, this is capped to a maximum of 5 organizations.
*   **Followers:** The total number of followers the user has on GitHub.
*   **Sponsors:** A heart icon that provides a direct link to the user's GitHub Sponsors profile, allowing you to easily support their open-source work.
*   **Since:** The year the user first became active on GitHub.

### The Heatmap
*   **Yearly Heatmap Columns (e.g., 2026, 2025, 2024...):** Shows the exact number of contributions for specific years, going back to 2010. The cells use color coding (heatmaps) to instantly visualize contribution volume. Darker/more intense colors indicate higher activity. These columns also react to the selected Data Mode.
*   **Updated:** The date when the user's profile was last refreshed in the DevIndex database.

---

## 2. Using the Filters and Controls

To access the filtering and control panel, click the hamburger menu icon (≡) located at the far right edge of the header toolbar. This will slide in the Controls widget from the right side of the screen, providing powerful tools to slice and dice the 50,000+ rows of data in real-time.

### Search Filters
- **Country:** A dropdown to filter developers by their specific location.
- **Username & Fullname:** Text fields to quickly find specific contributors by name.
- **Bio Search:** Search for keywords within developer biographies (e.g., "React", "Rust", "Neo.mjs").

### Data Mode
Switching the Data Mode recalculates the grid and re-sorts the data instantly. This changes the context of the "Total" column, the "Activity" sparkline, and all the Yearly Heatmap columns:
- **Total Contributions:** (Default) All recognized GitHub activities.
- **Public Contributions:** Only publicly visible activities.
- **Private Contributions:** Only private activities (if the user has chosen to share them).
- **Total Commits:** Ignores issue creation and code reviews. Use this if you want to view the grid strictly by code authorship.

### Specialized Filters
- **Hireable Only:** Check this box to filter the list down to developers who are looking for work. Ideal for recruiters.
- **Hide Commit Ratio > 90%:** This filter can be used to hide accounts that exhibit highly anomalous commit patterns. While an extremely high commit ratio is often a strong indicator of an automated account (a "bot"), there are valid exceptions (such as solo founders using external ticketing systems). **As outlined in our Methodology, we do not censor these automated accounts from the default view because their activity represents valuable data for researchers studying ecosystem automation.** However, if you are sourcing human talent, this filter instantly cleans the list. It is optional and disabled by default.

### Visual Settings
Under the **Settings** tab within the controls, you can manage the application's performance and aesthetics. **All visual settings and the application theme are automatically saved to your browser's Local Storage**, meaning your preferences will persist across future visits.

- **Slow Header Canvas:** Drastically reduces the speed of the background particle animation in the top header. Useful if the animation is visually distracting.
- **Animate Grid Sparklines:** Toggles the "Living Pulse" animation inside the grid's Activity column. If you are on a low-end device, turning this off will significantly reduce CPU usage and battery drain during fast scrolling.
- **Theme Toggle (Header):** Located in the main top header (the moon/sun icon), this instantly switches the entire application between Dark Mode and Light Mode.
