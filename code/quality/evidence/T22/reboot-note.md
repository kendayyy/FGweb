# T22 runtime interruption

Windows LastBootUpTime reported2026-10-07 11:04:29 Asia/Bangkok during diagnosis. The in-flight teams-3 run has only a partial raw log and no completion/exit record, so it is not counted as successful. Docker was not running after reboot, causing teams-4 and native-1 ECONNREFUSED. Existing source and completed evidence remain preserved. Docker Desktop is being restarted with the existing local PG/Redis compose configuration. No database reset or fixture-success substitution is used; final checks must run again on the current source.
