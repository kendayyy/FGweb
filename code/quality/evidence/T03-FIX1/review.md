# T03-FIX1 closeout

User approved the concrete contract correction in T10/contract-change-proposal.md. Historical T03 remains PASS; this separate fix is inserted before T10 and T10 explicitly depends on it. Product spec/design/task baseline remains unchanged.

Five behavior tests first failed because both authenticated PUT routes were missing (red.txt). Added strict shared schemas for interest replacement and game-profile replacement, PUT method support and endpoint registration; synchronized quality/api-contract.md. Request identity/catalog overrides are rejected, interests require unique nonempty values from the existing7game catalog, and rank remains optional. Game-profile response reuses existing schema. No alternate backend DTOs or database/frontend features added.

All34 contracts tests, contracts build, API build, API source/test typecheck, web source/test typecheck, workspace lint and diff check PASS. final-verification.json contains actual command/time/exit/output SHA256. There are no consumers of the two previously missing endpoints yet; T10 will import the new shared schemas and T11 will integrate them. Existing consumers compile unchanged. No dependency or baseline changes. All modified source/doc files are inside the approved fix scope.
