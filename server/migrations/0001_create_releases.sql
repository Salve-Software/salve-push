CREATE TABLE IF NOT EXISTS releases (
    id                  UUID PRIMARY KEY,
    version             TEXT NOT NULL,
    platform            TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
    channel             TEXT NOT NULL,
    runtime_version     TEXT NOT NULL,
    bundle_hash         TEXT NOT NULL,
    signature           TEXT NOT NULL,
    bundle_size         BIGINT NOT NULL,
    bundle_storage_key  TEXT NOT NULL,
    rollout_percentage  INTEGER NOT NULL DEFAULT 0 CHECK (rollout_percentage BETWEEN 0 AND 100),
    published_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_releases_lookup
    ON releases (channel, platform, runtime_version)
    WHERE published_at IS NOT NULL;
