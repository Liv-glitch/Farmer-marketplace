ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS quantity_received numeric(12,2);

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_quantity_received_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_quantity_received_check
  CHECK (quantity_received IS NULL OR quantity_received > 0);
