# Session wait probe fixture correction

The first independent run failed its prerequisite assertion that the synthetic session had expired. Better Auth refreshed the artificially shortened session during HTTP authentication. The room API's post-lock authorization result was not exercised in that run.

The revised fixture expires the session only after observing the actual PostgreSQL room-row lock wait, then verifies expiry before releasing that lock. Required behavior assertions remain unchanged: HTTP401 LOGIN_REQUIRED and unchanged original ownership. The failed original execution evidence remains preserved.
