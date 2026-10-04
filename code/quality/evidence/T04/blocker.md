# T04 external service blocker
Initial and retry CLI invocations both exited1 with eligibility UNAVAILABLE503. Mandatory model Gemini3.6FlashHigh retained; no model fallback. No database source/migration/tests changed. T03 remains PASS and prerequisite gate for T04 passed. T05 NOT_STARTED.
Commands: agy --model "Gemini 3.6 Flash (High)" --dangerously-skip-permissions --print <saved prompt> --print-timeout20m (two independent failed submissions; actual raw outputs retained).
Next action: retry T04 when provider service recovers. No credentials needed from user for this error. No feature implementation or verification claimed.
