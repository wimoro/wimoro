-- Parrainage : le versement du bonus n'attend jamais le parrain.
--
-- Le bonus du parrain part pendant le premier pari de son filleul, alors que ce pari tient déjà le marché. Si le parrain
-- pariait sur le même marché au même instant, les deux opérations pouvaient s'attendre l'une l'autre et l'une des deux
-- était refusée par la base. Désormais, si le parrain est occupé, on ne l'attend pas : son bonus est versé à son prochain
-- chargement (wm.state appelle wm.ref_regler), comme tout bonus manqué.

create or replace function wm.ref_regler(p_parrain uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; v_bonus numeric := wm.ref_bonus(); v_solde numeric; n integer := 0;
begin
  if not exists (select 1 from wm.parrainages p where p.parrain = p_parrain and p.paye_at is null) then return 0; end if;   -- cas courant : rien à verser
  perform 1 from public.user_stats where user_id = p_parrain for update skip locked;
  if not found then return 0; end if;                                          -- parrain occupé ou absent : au prochain chargement
  for r in select p.filleul, u.username from wm.parrainages p
             join public.user_stats s on s.user_id = p.filleul join public.users u on u.id = p.filleul
           where p.parrain = p_parrain and p.paye_at is null and coalesce(s.bets_placed, 0) > 0
           order by p.cree_at for update of p skip locked loop
    update public.user_stats set balance = balance + v_bonus where user_id = p_parrain returning balance into v_solde;
    exit when not found;
    update wm.parrainages set paye_at = now(), bonus_parrain = v_bonus where filleul = r.filleul;
    insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (p_parrain, v_bonus, v_solde, 'parrainage', r.filleul::text);
    perform wm.notify(p_parrain, 'gift', 'parrain_paye', jsonb_build_object('n', r.username, 'gain', v_bonus), '#parrainage');
    n := n + 1;
  end loop;
  return n;
end $$;

select wm.droits();
