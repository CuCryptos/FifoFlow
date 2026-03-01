-- Supabase RPC functions for FifoFlow transactional inventory operations.
-- Run this in your Supabase SQL editor before using INVENTORY_STORE_DRIVER=supabase.

create or replace function public.inventory_insert_transaction_and_adjust_qty(
  p_item_id bigint,
  p_type text,
  p_quantity numeric,
  p_reason text,
  p_notes text default null
)
returns table (
  transaction_row jsonb,
  item_row jsonb
)
language plpgsql
security definer
as $$
declare
  v_item public.items%rowtype;
  v_delta numeric;
  v_tx public.transactions%rowtype;
  v_updated public.items%rowtype;
begin
  if p_quantity <= 0 then
    raise exception 'Quantity must be positive.';
  end if;

  select * into v_item
  from public.items
  where id = p_item_id
  for update;

  if not found then
    raise exception 'Item not found.';
  end if;

  v_delta := case when p_type = 'in' then p_quantity else -p_quantity end;

  if v_item.current_qty + v_delta < 0 then
    raise exception 'Insufficient quantity. Cannot go below zero.';
  end if;

  insert into public.transactions (item_id, type, quantity, reason, notes)
  values (p_item_id, p_type, p_quantity, p_reason, p_notes)
  returning * into v_tx;

  update public.items
  set current_qty = current_qty + v_delta,
      updated_at = now()
  where id = p_item_id
  returning * into v_updated;

  transaction_row := to_jsonb(v_tx);
  item_row := to_jsonb(v_updated);
  return next;
end;
$$;

create or replace function public.inventory_reconcile()
returns table (
  checked integer,
  mismatches_found integer,
  mismatches jsonb,
  fixed boolean
)
language plpgsql
security definer
as $$
declare
  v_checked integer := 0;
  v_mismatches jsonb := '[]'::jsonb;
begin
  with item_rows as (
    select id, name, current_qty
    from public.items
  ),
  computed as (
    select
      i.id,
      i.name,
      i.current_qty,
      coalesce(sum(case when t.type = 'in' then t.quantity else -t.quantity end), 0) as computed_qty
    from item_rows i
    left join public.transactions t on t.item_id = i.id
    group by i.id, i.name, i.current_qty
  ),
  mismatch_rows as (
    select
      id,
      name,
      current_qty,
      computed_qty,
      current_qty - computed_qty as difference
    from computed
    where abs(current_qty - computed_qty) > 0.001
  ),
  apply_fix as (
    update public.items i
    set current_qty = m.computed_qty,
        updated_at = now()
    from mismatch_rows m
    where i.id = m.id
    returning i.id
  )
  select
    (select count(*) from item_rows),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'item_id', id,
          'item_name', name,
          'cached_qty', current_qty,
          'computed_qty', computed_qty,
          'difference', difference
        )
      ),
      '[]'::jsonb
    )
  into v_checked, v_mismatches
  from mismatch_rows;

  checked := v_checked;
  mismatches_found := jsonb_array_length(v_mismatches);
  mismatches := v_mismatches;
  fixed := mismatches_found > 0;
  return next;
end;
$$;

create or replace function public.inventory_set_item_count_with_adjustment(
  p_item_id bigint,
  p_counted_qty numeric,
  p_notes text default null
)
returns table (
  item_row jsonb,
  transaction_row jsonb,
  delta numeric
)
language plpgsql
security definer
as $$
declare
  v_item public.items%rowtype;
  v_delta numeric;
  v_tx public.transactions%rowtype;
  v_updated public.items%rowtype;
begin
  if p_counted_qty < 0 then
    raise exception 'Counted quantity cannot be negative.';
  end if;

  select * into v_item
  from public.items
  where id = p_item_id
  for update;

  if not found then
    raise exception 'Item not found.';
  end if;

  v_delta := p_counted_qty - v_item.current_qty;

  if abs(v_delta) > 0.000001 then
    insert into public.transactions (item_id, type, quantity, reason, notes)
    values (
      p_item_id,
      case when v_delta > 0 then 'in' else 'out' end,
      abs(v_delta),
      'Adjustment',
      coalesce(p_notes, 'Cycle count adjustment')
    )
    returning * into v_tx;
    transaction_row := to_jsonb(v_tx);
  else
    transaction_row := null;
  end if;

  update public.items
  set current_qty = p_counted_qty,
      updated_at = now()
  where id = p_item_id
  returning * into v_updated;

  item_row := to_jsonb(v_updated);
  delta := v_delta;
  return next;
end;
$$;
