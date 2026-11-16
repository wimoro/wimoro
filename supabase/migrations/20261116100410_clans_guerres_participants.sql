-- Guerres de clans : une guerre terminée est réglée au passage de n'importe lequel de ses participants.
--
-- Jusqu'ici, seul le passage d'un membre actuel du clan réglait une guerre arrivée à son terme. Un participant qui avait
-- payé son buy-in puis quitté le clan (ou en avait été exclu) devait donc attendre qu'un membre revienne ; si plus aucun
-- vrai membre ne revenait, son buy-in restait bloqué dans la cagnotte. Désormais son propre passage suffit : la guerre est
-- réglée pour tous ses participants, lui compris. Ses points valent zéro s'il n'est plus dans le clan, mais sa part de la
-- cagnotte lui revient si le clan gagne, et son buy-in lui est rendu à égalité.
-- Les règles (48 heures, dix meilleurs, cagnotte moins 4 %, 50 XP) ne changent pas. Rien n'est supprimé.

create index if not exists clan_guerre_joueurs_user on wm.clan_guerre_joueurs (user_id);

create or replace function wm.clan_guerres_avancer(p_user uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare g wm.clan_guerres; v jsonb; v_a integer; v_b integer; v_n integer; v_pot numeric; v_part numeric; j record; v_solde numeric; v_etat text; v_regles integer := 0;
begin
  for g in
    select x.* from wm.clan_guerres x
    where x.etat = 'live' and x.fin <= now()
      and (x.clan_id in (select m.clan_id from wm.clan_membres m where m.user_id = p_user and m.parti_at is null)
        or x.id in (select jj.guerre_id from wm.clan_guerre_joueurs jj where jj.user_id = p_user and jj.gain is null))
    order by x.id for update of x skip locked
  loop
    v := wm.guerre_json(g);
    select coalesce(sum(p), 0) into v_a from (select (e ->> 'pts')::integer as p from jsonb_array_elements(v -> 'mine') e order by 1 desc limit 10) s;
    select coalesce(sum(p), 0) into v_b from (select (e ->> 'pts')::integer as p from jsonb_array_elements(v -> 'theirs') e order by 1 desc limit 10) s;
    v_n := g.bots + (select count(*) from wm.clan_guerre_joueurs x where x.guerre_id = g.id);
    v_pot := g.buyin * (10 + v_n);
    v_etat := case when v_a > v_b then 'won' when v_a < v_b then 'lost' else 'draw' end;
    v_part := case when v_etat = 'won' and v_n > 0 then round(v_pot * 0.96 / v_n, 2) else 0 end;
    update wm.clan_guerres set etat = v_etat, score_nous = v_a, score_eux = v_b, cagnotte = v_pot, regle_at = now() where id = g.id;
    for j in select x.user_id, x.paye, (select (e ->> 'pts')::integer from jsonb_array_elements(v -> 'mine') e where e ->> 'u' = x.user_id::text limit 1) as pts
             from wm.clan_guerre_joueurs x where x.guerre_id = g.id order by x.user_id loop
      update wm.clan_guerre_joueurs set points = j.pts, gain = case v_etat when 'won' then v_part when 'draw' then j.paye else 0 end where guerre_id = g.id and user_id = j.user_id;
      if v_etat = 'won' then
        update public.user_stats set balance = balance + v_part, profit_realized = coalesce(profit_realized, 0) + v_part - j.paye where user_id = j.user_id returning balance into v_solde;
        insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (j.user_id, v_part, v_solde, 'guerre_gain', g.id::text);
        perform wm.xp_add(j.user_id, 50, 'guerre');
        perform wm.rank_refresh(j.user_id); perform wm.badges_check(j.user_id);
      elsif v_etat = 'draw' then
        update public.user_stats set balance = balance + j.paye where user_id = j.user_id returning balance into v_solde;
        insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (j.user_id, j.paye, v_solde, 'guerre_rendu', g.id::text);
      else
        update public.user_stats set profit_realized = coalesce(profit_realized, 0) - j.paye where user_id = j.user_id;
      end if;
      if j.user_id = p_user then
        perform wm.notify(j.user_id, 'shield', 'guerre_' || v_etat, jsonb_build_object('id', g.clan_id, 'foe', g.ennemi, 'gain', v_part - j.paye, 'pot', v_pot, 'a', v_a, 'b', v_b), '#clan-' || g.clan_id);
      else
        perform wm.notify_direct(j.user_id, 'shield', 'guerre_' || v_etat, jsonb_build_object('id', g.clan_id, 'foe', g.ennemi, 'gain', v_part - j.paye, 'pot', v_pot, 'a', v_a, 'b', v_b), '#clan-' || g.clan_id);
      end if;
    end loop;
    v_regles := v_regles + 1;
  end loop;
  return v_regles;
end $$;

select wm.droits();
