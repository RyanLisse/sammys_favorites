CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Application schemas are deliberately not created globally. local-stack.sh
-- creates one per explicit namespace and sets search_path in DATABASE_URL.
