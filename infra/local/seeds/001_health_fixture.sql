CREATE TABLE IF NOT EXISTS sammys_health_fixture (
  fixture_key text PRIMARY KEY,
  fixture_value text NOT NULL,
  seeded_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO sammys_health_fixture (fixture_key, fixture_value)
VALUES ('seed', :'namespace')
ON CONFLICT (fixture_key) DO UPDATE
SET fixture_value = EXCLUDED.fixture_value, seeded_at = now();
