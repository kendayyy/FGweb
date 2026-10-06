# T20 full API invocation correction

The first full API attempt used npm workspace test without loading .env.local. Nine suites passed; auth-profile-read failed its explicit configuration prerequisite (six cases), before business assertions. The second inherited .env.local but npm workspace execution changed the child's working directory to apps/api; the same legacy fixture resolves packages/database/migrations from code root. Both failures are preserved, and no existing test/source/assertion was edited.

The correct invocation (also used by T18) is:

node --env-file=.env.local --experimental-vm-modules node_modules/jest/bin/jest.js --config apps/api/jest.config.js --runInBand

It runs from E:/FGweb/code. Credential values are not printed. Codex owns these invocation mistakes and will not call them product failures or passing verification. Attempt3 must record exit0 before T20 can PASS.
