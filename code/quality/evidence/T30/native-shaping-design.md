# T30 — test transport shaping plan (execution pending)

Use an owned Node container in the fixture's private Docker network. Its TCP listener forwards opaque bytes to the genuine SFU TURN TCP listener; native TURN credentials, ICE, DTLS and SRTP remain unchanged. Publish only loopback ports. The browser's test-only ICE mapping uses this TURN TCP endpoint and relay policy, as the previous native fixture did for its direct TURN endpoint. This is a fixture transport, not application media relaying.

The shaper paces both TCP directions with bounded 4 KiB chunks and stream backpressure. A loopback control endpoint switches from unlimited baseline to a declared per-connection/per-direction bit rate and per-read delay. Report the actual policy, time window, byte counters, native ICE selected candidate pair, inbound audio/video RTP packet counts/bytes/loss/jitter and video dimensions during both windows. This is TCP rate/delay shaping, not independent UDP packet-loss simulation. HTTP/CDP throttling cannot substitute for these measurements.

No benchmark has run and no quality result is claimed. Keep audio and selected-video assertions during the shaped window. Native real getDisplayMedia and the application flow remain mandatory. Remove the owned shaper container together with the existing fixture containers/network and verify cleanup.
