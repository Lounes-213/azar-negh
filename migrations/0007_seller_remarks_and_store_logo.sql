-- 0007_seller_remarks_and_store_logo.sql
-- Allow sellers to send a remark/contestation when a listing is rejected, and allow dedicated store logo.

ALTER TABLE listings ADD COLUMN seller_remark TEXT;
ALTER TABLE seller_profiles ADD COLUMN logo_url TEXT;
