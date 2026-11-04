-- Requires pg_cron, pg_net and a Vault secret named adsnap_capture_watchdog_token.
-- Apply the state migration and deploy the authenticated route before scheduling.
CREATE OR REPLACE FUNCTION adsnap_private.tick_capture_watchdog()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE service_token text;
BEGIN
    SELECT decrypted_secret INTO service_token FROM vault.decrypted_secrets
      WHERE name = 'adsnap_capture_watchdog_token';
    IF service_token IS NULL THEN RAISE EXCEPTION 'Capture scheduler credential is missing'; END IF;
    RETURN net.http_get(
        url := 'https://adsnap-cloud.vercel.app/api/cron/capture-watchdog',
        headers := jsonb_build_object('Authorization', 'Bearer ' || service_token),
        timeout_milliseconds := 55000
    );
END;
$$;
REVOKE ALL ON FUNCTION adsnap_private.tick_capture_watchdog() FROM PUBLIC, anon, authenticated;
SELECT cron.schedule('adsnap-capture-watchdog', '*/2 * * * *',
    'SELECT adsnap_private.tick_capture_watchdog();');
