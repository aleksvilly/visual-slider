-- Visual Slider Phase 2: allow analysis before an item is created.

alter table public.analysis_runs
  alter column item_id drop not null,
  add column category_id uuid references public.categories(id) on delete restrict,
  add column source_url text,
  add column runtime_ms integer check (runtime_ms is null or runtime_ms >= 0),
  add constraint analysis_runs_subject_check
    check (item_id is not null or source_url is not null);

create index analysis_runs_category_created_idx
  on public.analysis_runs (category_id, created_at desc);

create index analysis_runs_source_url_idx
  on public.analysis_runs (source_url)
  where source_url is not null;
