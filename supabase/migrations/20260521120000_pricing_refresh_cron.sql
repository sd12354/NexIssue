-- Weekly GoCollect pricing refresh for in_inventory comics (PRD §5.3).
-- Invokes the pricing-refresh edge function with the service role JWT.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'pricing-refresh-weekly'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end $$;

-- Store the service role key in Supabase Vault as `service_role_key` so the
-- cron job can authenticate. Dashboard → Project Settings → Vault.
select cron.schedule(
  'pricing-refresh-weekly',
  '0 6 * * 0',
  $$
  select net.http_post(
    url := 'https://kwanmxeicyxohxxuwcjr.supabase.co/functions/v1/pricing-refresh',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(
        (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'service_role_key'
          limit 1
        ),
        ''
      )
    ),
    body := '{"scheduled":true}'::jsonb
  ) as request_id;
  $$
);
