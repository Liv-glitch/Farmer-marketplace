CREATE TABLE IF NOT EXISTS public.buyer_promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  buyer_id uuid NOT NULL REFERENCES public.buyers(id) ON DELETE CASCADE,
  granted_by_admin_id uuid REFERENCES public.admins(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  used_booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT buyer_promo_codes_status_check CHECK (status IN ('active', 'used', 'revoked')),
  CONSTRAINT buyer_promo_codes_used_state_check CHECK (
    (status = 'used' AND used_booking_id IS NOT NULL AND used_at IS NOT NULL)
    OR (status <> 'used' AND used_booking_id IS NULL AND used_at IS NULL)
  ),
  CONSTRAINT buyer_promo_codes_revoked_state_check CHECK (
    (status = 'revoked' AND revoked_at IS NOT NULL)
    OR (status <> 'revoked' AND revoked_at IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS buyer_promo_codes_one_active_per_buyer
  ON public.buyer_promo_codes(buyer_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS buyer_promo_codes_buyer_status_idx
  ON public.buyer_promo_codes(buyer_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS buyer_promo_codes_used_booking_idx
  ON public.buyer_promo_codes(used_booking_id)
  WHERE used_booking_id IS NOT NULL;

ALTER TABLE public.buyer_promo_codes ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_buyer_promo_codes_updated_at ON public.buyer_promo_codes;
CREATE TRIGGER update_buyer_promo_codes_updated_at
  BEFORE UPDATE ON public.buyer_promo_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
