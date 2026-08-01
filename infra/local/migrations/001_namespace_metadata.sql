CREATE TABLE IF NOT EXISTS sammys_namespace_metadata (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  namespace text NOT NULL,
  migrated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO sammys_namespace_metadata (singleton, namespace)
VALUES (true, :'namespace')
ON CONFLICT (singleton) DO UPDATE
SET namespace = EXCLUDED.namespace, migrated_at = now();
