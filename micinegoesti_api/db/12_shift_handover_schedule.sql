-- Run after 11_app_logs.sql.
-- Adds the internal Shift Handover module, local photo metadata,
-- WhatsApp subscribers/notification logs, user shift profiles, and schedules.

begin;

create extension if not exists pgcrypto;

alter table if exists public.users
  add column if not exists password_hash text;

create table if not exists public.shift_templates (
  id text primary key default gen_random_uuid()::text,
  shift_key text not null unique check (shift_key in ('shift_1', 'shift_2')),
  label text not null,
  default_start_time text,
  default_end_time text,
  color text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_shift_profiles (
  id text primary key default gen_random_uuid()::text,
  user_id text not null unique references public.users(id) on delete cascade,
  shift_key text references public.shift_templates(shift_key) on delete set null,
  display_name text,
  whatsapp_number text,
  notifications_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shift_handover_items (
  id text primary key default gen_random_uuid()::text,
  code text not null unique,
  created_by_user_id text references public.users(id) on delete set null,
  source_shift_key text not null references public.shift_templates(shift_key) on delete restrict,
  target_shift_key text references public.shift_templates(shift_key) on delete set null,
  category text not null check (category in ('cleaning', 'stock', 'equipment', 'customer_issue', 'food_quality', 'safety', 'handover', 'staff', 'other')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  location_label text,
  title text not null,
  description text,
  status text not null default 'new' check (status in ('new', 'seen', 'in_progress', 'resolved', 'archived')),
  acknowledged_by_user_id text references public.users(id) on delete set null,
  acknowledged_at timestamptz,
  resolved_by_user_id text references public.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shift_handover_attachments (
  id text primary key default gen_random_uuid()::text,
  handover_item_id text not null references public.shift_handover_items(id) on delete cascade,
  uploaded_by_user_id text references public.users(id) on delete set null,
  original_filename text,
  stored_filename text not null,
  relative_path text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  sha256 text,
  caption text,
  expires_at timestamptz not null,
  deleted_at timestamptz,
  delete_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.shift_handover_comments (
  id text primary key default gen_random_uuid()::text,
  handover_item_id text not null references public.shift_handover_items(id) on delete cascade,
  created_by_user_id text references public.users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.shift_schedules (
  id text primary key default gen_random_uuid()::text,
  schedule_date date not null,
  shift_key text not null references public.shift_templates(shift_key) on delete restrict,
  assigned_user_id text references public.users(id) on delete set null,
  manager_user_id text references public.users(id) on delete set null,
  start_time text,
  end_time text,
  status text not null default 'planned' check (status in ('planned', 'confirmed', 'completed', 'cancelled')),
  notes text,
  created_by_user_id text references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shift_whatsapp_subscribers (
  id text primary key default gen_random_uuid()::text,
  user_id text references public.users(id) on delete set null,
  display_name text not null,
  whatsapp_number text not null,
  shift_filter text not null default 'all' check (shift_filter in ('all', 'shift_1', 'shift_2')),
  priority_filter text not null default 'all' check (priority_filter in ('all', 'high_urgent', 'urgent_only')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shift_whatsapp_notifications (
  id text primary key default gen_random_uuid()::text,
  handover_item_id text references public.shift_handover_items(id) on delete set null,
  subscriber_id text references public.shift_whatsapp_subscribers(id) on delete set null,
  to_number text not null,
  provider text not null,
  status text not null check (status in ('queued', 'sent', 'failed', 'manual_required', 'skipped')),
  message_preview text,
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table if not exists public.shift_audit_logs (
  id text primary key default gen_random_uuid()::text,
  actor_user_id text references public.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata text,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_shift_profiles_shift_key on public.user_shift_profiles(shift_key);
create index if not exists idx_shift_handover_source_created on public.shift_handover_items(source_shift_key, created_at desc);
create index if not exists idx_shift_handover_target_created on public.shift_handover_items(target_shift_key, created_at desc);
create index if not exists idx_shift_handover_priority_status on public.shift_handover_items(priority, status);
create index if not exists idx_shift_handover_status_created on public.shift_handover_items(status, created_at desc);
create index if not exists idx_shift_handover_attachments_item on public.shift_handover_attachments(handover_item_id, created_at);
create index if not exists idx_shift_handover_attachments_expiry on public.shift_handover_attachments(expires_at, deleted_at);
create index if not exists idx_shift_handover_comments_item on public.shift_handover_comments(handover_item_id, created_at);
create index if not exists idx_shift_schedules_date_shift on public.shift_schedules(schedule_date, shift_key);
create index if not exists idx_shift_schedules_assigned_date on public.shift_schedules(assigned_user_id, schedule_date);
create index if not exists idx_shift_whatsapp_subscribers_filters on public.shift_whatsapp_subscribers(enabled, shift_filter, priority_filter);
create index if not exists idx_shift_whatsapp_notifications_item on public.shift_whatsapp_notifications(handover_item_id, created_at);
create index if not exists idx_shift_whatsapp_notifications_status on public.shift_whatsapp_notifications(status, created_at);
create index if not exists idx_shift_audit_actor on public.shift_audit_logs(actor_user_id, created_at);
create index if not exists idx_shift_audit_entity on public.shift_audit_logs(entity_type, entity_id);

drop trigger if exists trg_shift_templates_updated_at on public.shift_templates;
create trigger trg_shift_templates_updated_at
before update on public.shift_templates
for each row execute function public.set_updated_at();

drop trigger if exists trg_user_shift_profiles_updated_at on public.user_shift_profiles;
create trigger trg_user_shift_profiles_updated_at
before update on public.user_shift_profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_shift_handover_items_updated_at on public.shift_handover_items;
create trigger trg_shift_handover_items_updated_at
before update on public.shift_handover_items
for each row execute function public.set_updated_at();

drop trigger if exists trg_shift_schedules_updated_at on public.shift_schedules;
create trigger trg_shift_schedules_updated_at
before update on public.shift_schedules
for each row execute function public.set_updated_at();

drop trigger if exists trg_shift_whatsapp_subscribers_updated_at on public.shift_whatsapp_subscribers;
create trigger trg_shift_whatsapp_subscribers_updated_at
before update on public.shift_whatsapp_subscribers
for each row execute function public.set_updated_at();

insert into public.shift_templates (shift_key, label, default_start_time, default_end_time, color)
values
  ('shift_1', 'Tura 1', '09:00', '17:00', '#ff4d00'),
  ('shift_2', 'Tura 2', '17:00', '21:00', '#ffd446')
on conflict (shift_key) do nothing;

alter table public.shift_templates enable row level security;
alter table public.user_shift_profiles enable row level security;
alter table public.shift_handover_items enable row level security;
alter table public.shift_handover_attachments enable row level security;
alter table public.shift_handover_comments enable row level security;
alter table public.shift_schedules enable row level security;
alter table public.shift_whatsapp_subscribers enable row level security;
alter table public.shift_whatsapp_notifications enable row level security;
alter table public.shift_audit_logs enable row level security;

drop policy if exists "Service role manages shift templates" on public.shift_templates;
create policy "Service role manages shift templates" on public.shift_templates
for all to service_role using (true) with check (true);

drop policy if exists "Service role manages user shift profiles" on public.user_shift_profiles;
create policy "Service role manages user shift profiles" on public.user_shift_profiles
for all to service_role using (true) with check (true);

drop policy if exists "Service role manages shift handover items" on public.shift_handover_items;
create policy "Service role manages shift handover items" on public.shift_handover_items
for all to service_role using (true) with check (true);

drop policy if exists "Service role manages shift handover attachments" on public.shift_handover_attachments;
create policy "Service role manages shift handover attachments" on public.shift_handover_attachments
for all to service_role using (true) with check (true);

drop policy if exists "Service role manages shift handover comments" on public.shift_handover_comments;
create policy "Service role manages shift handover comments" on public.shift_handover_comments
for all to service_role using (true) with check (true);

drop policy if exists "Service role manages shift schedules" on public.shift_schedules;
create policy "Service role manages shift schedules" on public.shift_schedules
for all to service_role using (true) with check (true);

drop policy if exists "Service role manages shift whatsapp subscribers" on public.shift_whatsapp_subscribers;
create policy "Service role manages shift whatsapp subscribers" on public.shift_whatsapp_subscribers
for all to service_role using (true) with check (true);

drop policy if exists "Service role manages shift whatsapp notifications" on public.shift_whatsapp_notifications;
create policy "Service role manages shift whatsapp notifications" on public.shift_whatsapp_notifications
for all to service_role using (true) with check (true);

drop policy if exists "Service role manages shift audit logs" on public.shift_audit_logs;
create policy "Service role manages shift audit logs" on public.shift_audit_logs
for all to service_role using (true) with check (true);

commit;
