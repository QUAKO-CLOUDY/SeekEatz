ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS billing_provider TEXT NULL
  CHECK (billing_provider IN ('app_store'));

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS app_store_product_id TEXT NULL;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS app_store_original_transaction_id TEXT NULL;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS app_store_environment TEXT NULL
  CHECK (app_store_environment IN ('sandbox', 'production'));

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS app_store_last_verified_at TIMESTAMPTZ NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_app_store_original_transaction_id_key
  ON profiles(app_store_original_transaction_id)
  WHERE app_store_original_transaction_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS app_store_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_transaction_id TEXT NOT NULL UNIQUE,
  latest_transaction_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  environment TEXT NOT NULL
    CHECK (environment IN ('sandbox', 'production')),
  status TEXT NOT NULL
    CHECK (status IN ('inactive', 'trialing', 'active', 'canceled', 'past_due')),
  auto_renew_status BOOLEAN NULL,
  expires_at TIMESTAMPTZ NULL,
  last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_payload JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS app_store_subscriptions_user_id_idx
  ON app_store_subscriptions(user_id);

CREATE INDEX IF NOT EXISTS app_store_subscriptions_status_idx
  ON app_store_subscriptions(status);

CREATE INDEX IF NOT EXISTS app_store_subscriptions_expires_at_idx
  ON app_store_subscriptions(expires_at);
