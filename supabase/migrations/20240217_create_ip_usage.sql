-- Create a table to track usage by IP address
create table if not exists ip_usage (
  ip text primary key,
  usage_count int default 0,
  updated_at timestamptz default now()
);

-- Enable Row Level Security (RLS)
alter table ip_usage enable row level security;

-- Create a policy that allows anyone to insert/update (for now, or restrict to service role)
-- Since we use the service role key in the backend, we bypass RLS, so this might not be strictly necessary
-- but good practice to have RLS enabled.
-- However, for client-side access (if any), we need policies.
-- For server-side usage with service role, we are fine.

-- Policy for reading: Service role only (implicit bypass)
-- Policy for writing: Service role only (implicit bypass)
