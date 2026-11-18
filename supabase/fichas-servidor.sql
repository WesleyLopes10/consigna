begin;
create table if not exists public.avaliatop_fichas (
  id uuid primary key,
  numero bigint generated always as identity unique,
  dados jsonb not null,
  pronta boolean not null default false,
  indisponivel boolean not null default false,
  valor numeric(12,2) check (valor > 0),
  avaliado_em bigint,
  revisao bigint not null default 0,
  criado_em timestamptz not null default now()
);
alter table public.avaliatop_fichas enable row level security;
revoke all on public.avaliatop_fichas from anon, authenticated;
grant all on public.avaliatop_fichas to service_role;
grant usage, select on sequence public.avaliatop_fichas_numero_seq to service_role;
insert into storage.buckets (id,name,public,file_size_limit)
values ('avaliatop-midias','avaliatop-midias',false,104857600)
on conflict (id) do update set public=false,file_size_limit=104857600;
commit;
