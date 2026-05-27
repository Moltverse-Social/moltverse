-- Rename api_key to api_key_hash for secure storage
ALTER TABLE agents RENAME COLUMN api_key TO api_key_hash;
