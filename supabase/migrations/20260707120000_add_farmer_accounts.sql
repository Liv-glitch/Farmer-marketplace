CREATE TABLE IF NOT EXISTS public.farmer_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  phone_number TEXT,
  password_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.farmer_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all farmer accounts" ON public.farmer_accounts
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update farmer accounts" ON public.farmer_accounts
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_farmer_accounts_updated_at ON public.farmer_accounts;
CREATE TRIGGER update_farmer_accounts_updated_at
  BEFORE UPDATE ON public.farmer_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.farmers
  ADD COLUMN IF NOT EXISTS farmer_account_id UUID REFERENCES public.farmer_accounts(id) ON DELETE SET NULL;

INSERT INTO public.farmer_accounts (email, full_name, phone_number, password_hash, created_at, updated_at)
SELECT DISTINCT ON (lower(trim(email)))
  lower(trim(email)) AS email,
  full_name,
  phone_number,
  password_hash,
  created_at,
  updated_at
FROM public.farmers
WHERE email IS NOT NULL AND trim(email) <> ''
ORDER BY lower(trim(email)), created_at ASC
ON CONFLICT (email) DO NOTHING;

UPDATE public.farmers f
SET farmer_account_id = fa.id,
    email = fa.email
FROM public.farmer_accounts fa
WHERE f.email IS NOT NULL
  AND lower(trim(f.email)) = fa.email
  AND f.farmer_account_id IS NULL;

CREATE INDEX IF NOT EXISTS farmers_farmer_account_id_idx
  ON public.farmers(farmer_account_id);
