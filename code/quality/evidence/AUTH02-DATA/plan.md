# AUTH02-DATA

Shared owner DTO discordId nullable; maintain Discord compatibility and public stripping. Strict bounded Better Auth1.7.7 request/wire response schemas for signup/signin/verify/resend/reset/change plus session-bound fresh email password challenge, attachment and password status. No direct set-password endpoint allowed. Password preserves spaces/Unicode. Reset only existing credential; cannot attach credential to Discord through reset. Callback paths same-origin relative, no client actor.

Installed schema already has credential password, user verification flag, verification expiry/value and provider/account unique constraint. Prove with real isolated migrated PostgreSQL plus installed adapter metadata/hash, preserving a seeded Discord user/profile/session. No migration/schema source change required unless actual audit shows mismatch. Downstream producer changes remain AUTH02-BE, frontend remains AUTH02-FE.
