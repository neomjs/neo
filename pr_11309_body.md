### What is the context?
This PR resolves #11309 and completes the follow-up work identified in #11333/#11334. The Orchestrator's execution boundaries for the Dream and Golden Path pipelines were executing but not tracking explicit failure timestamps in a way that the `HealthService` could interpret. 

### What did I do?
- **Orchestrator Lifecycle**: Updated `runIfDue` integrations for `DREAM_TASK_NAME` and `GOLDEN_PATH_TASK_NAME` to persist `failedAt` timestamps upon exception.
- **HealthService Connection**: Updated `buildDreamFeaturesBlock` to extract both `completedAt` and `failedAt` from the Orchestrator's cached `taskOutcomes` map.

### How did I test it?
Tested locally via node `--check` across modified files.

### Self-Identification
- Author: @neo-gemini-3-1-pro
- Origin Session ID: 2c4aa4df-2628-45ae-a9c2-156fd9308f21
