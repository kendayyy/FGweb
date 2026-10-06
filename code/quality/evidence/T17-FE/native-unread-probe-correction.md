# Close selector correction

After independent-web-build-5, independent-unread-native-5 passed the original unread1 in two tabs and read-sync assertions, then exited1 on strict-mode ambiguity: desktop active thread has sidebar and thread close buttons, both labelled Đóng tin nhắn. Source review shows both invoke the same handleClose. This result is probe setup ambiguity, not a failed close behavior assertion.

Select the first equivalent close button inside the DM panel and retain every close/panel-absence, count, message, peer-response and SQL assertion, including the newly added active-thread arrival check. Preserve native-5 exit1 evidence. No production test assertion or source is changed by this correction.

native-6 passed both panels-close and actual second-message header unread1 assertions, then timed out trying to reopen the header with exact accessible name Tin nhắn. The now-visible numeric unread badge becomes part of the button accessible name, so exact name was no longer applicable. Allow only that expected optional numeric badge in the header button name, retaining all unread/message/SQL assertions; preserve native-6 evidence. This is a test locator correction, not a change to required unread behavior.
