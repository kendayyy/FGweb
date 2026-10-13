# Isolated local setup profile, not production approval.
disable_mlock = true
ui = false
api_addr = "https://127.0.0.1:8200"
cluster_addr = "https://127.0.0.1:8201"
listener "tcp" {
  address = "0.0.0.0:8200"
  tls_cert_file = "/fg/server.crt"
  tls_key_file = "/fg/server.key"
  tls_min_version = "tls12"
}
storage "raft" {
  path = "/fg/data"
  node_id = "fg-setup"
}
audit "file" "setup" {
  options {
    file_path = "/fg/audit.jsonl"
    log_raw = "false"
  }
}
