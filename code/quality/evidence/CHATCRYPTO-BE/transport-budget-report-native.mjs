// Explicit owned-test ceilings only. No application/production defaults.
process.env.FG_CRYPTO_TRANSPORT_MAX_ROWS_PER_USER='1000000';
process.env.FG_CRYPTO_TRANSPORT_MAX_PAYLOAD_BYTES_PER_USER='1073741824';
await import('./report-native.mjs');
