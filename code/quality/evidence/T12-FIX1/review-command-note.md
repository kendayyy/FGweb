# Reviewer command calibration

The root entry point used by T12's verified full regression is:

`node --env-file=.env.local --experimental-vm-modules node_modules/jest/bin/jest.js --config apps/api/jest.config.js --runInBand`

All commands start from E:/FGweb/code. The npm workspace task acceptance command remains valid for dm-block.integration.spec.ts, whose fixtures resolve their migrations using an absolute root. A legacy suite uses relative packages/database/migrations, so full regression requires this root Jest entry point. Preserve failed workspace invocations; do not modify the legacy tests or weaken prerequisites. Reference: quality/evidence/T12/codex-regression-root-entry.json.
