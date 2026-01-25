CREATE TABLE IF NOT EXISTS saved_ports (
  path TEXT PRIMARY KEY,
  last_config_json TEXT
);

CREATE TABLE IF NOT EXISTS snapshot_meta (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  device_names_json TEXT NOT NULL,
  channel_count INTEGER NOT NULL,
  sample_count INTEGER NOT NULL,
  divider INTEGER NOT NULL,
  pre_trig INTEGER NOT NULL,
  channel_map_json TEXT NOT NULL,
  trigger_threshold REAL NOT NULL,
  trigger_channel INTEGER NOT NULL,
  trigger_mode INTEGER NOT NULL,
  rt_values_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS snapshot_data (
  snapshot_id INTEGER PRIMARY KEY,
  data BLOB NOT NULL,
  byte_len INTEGER NOT NULL,
  FOREIGN KEY (snapshot_id) REFERENCES snapshot_meta(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS snapshot_meta_created_at_idx
  ON snapshot_meta(created_at DESC);
