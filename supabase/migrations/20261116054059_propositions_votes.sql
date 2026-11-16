-- Propositions : les votes des joueurs se comptent dans la table des votes, plus dans un compteur.
--
-- Avec un compteur, le vote d'un compte supprimé restait compté pour toujours (les comptes de test en laissaient un à
-- chaque passage sur le contenu de démonstration). Compté depuis wm.propositions_votes, il disparaît avec le compte.
-- Les colonnes pour / contre de wm.propositions ne servent plus ; elles restent en place, à zéro.

create or replace function wm.prop_votes(p wm.propositions, out pour integer, out contre integer)
language plpgsql stable set search_path = '' as $$
declare
  v_ticks integer := greatest(0, floor(extract(epoch from clock_timestamp() - p.cree_at) / 1.5))::integer;
  v_pour integer; v_contre integer;
begin
  select count(*) filter (where x.vote = 'for'), count(*) filter (where x.vote = 'against') into v_pour, v_contre
  from wm.propositions_votes x where x.proposition = p.id;
  if p.etat = 'live' then pour := p.besoin; contre := p.base_contre + v_contre;
  elsif p.code is not null then pour := least(p.besoin - 1, p.base_pour + v_pour); contre := p.base_contre + v_contre;     -- démonstration : jamais validée
  else
    v_ticks := least(v_ticks, greatest(0, p.besoin - p.base_pour - v_pour));     -- la communauté s'arrête quand le compte y est
    pour := least(p.besoin, p.base_pour + v_pour + v_ticks);
    contre := p.base_contre + v_contre + floor(v_ticks * 0.18)::integer;
  end if;
end $$;

create or replace function wm.prop_promouvoir(p_id bigint) returns text
language plpgsql security definer set search_path = '' as $$
declare p wm.propositions; v record; v_id text; v_court text;
begin
  select * into p from wm.propositions x where x.id = p_id and x.etat = 'vote' and x.code is null for update skip locked;
  if not found then return null; end if;
  select * into v from wm.prop_votes(p);
  if v.pour < p.besoin then return null; end if;
  v_id := 'perso-' || coalesce(nullif(wm.slug(p.q), ''), 'pari') || '-' || p.id;
  v_court := wm.titre_court(p.q);
  insert into public.markets (id, category, question, short_question, creator_user_id, current_probability, initial_probability, anchor_probability,
                              heat_level, close_date, close_time, resolution_source, resolution_rules, status)
  values (v_id, p.cat, p.q, v_court, p.user_id, p.p0, p.p0, p.p0, 1.6, p.date_fin, p.heure, p.src, p.regles || ' Source : ' || p.src || '.', 'open');
  insert into public.market_live_state (market_id, current_probability, anchor_probability, volume_total, participants_count, liquidity_depth, d0)
  values (v_id, p.p0, p.p0, 250, 12, 400, p.p0);
  insert into public.chat_rooms (id, name, kind, market_id) values ('m:' || v_id, '#' || v_id, 'market', v_id) on conflict (id) do nothing;
  update wm.propositions set etat = 'live', market_id = v_id, fin_at = now(),                    -- les votes « contre » de la communauté sont figés
    base_contre = v.contre - (select count(*) from wm.propositions_votes x where x.proposition = p.id and x.vote = 'against')
  where id = p.id;
  perform wm.xp_add(p.user_id, 50, 'proposition');
  perform wm.notify(p.user_id, 'check', 'prop_live', jsonb_build_object('id', p.id, 'q', v_court, 'm', v_id), '#marche-' || v_id);
  perform realtime.send(jsonb_build_object('id', v_id, 'st', 'open'), 'etat', 'marches', false);
  return v_id;
end $$;

create or replace function wm.props_avancer() returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0;
begin
  for r in select x.id from wm.propositions x where x.etat = 'vote' and x.code is null
             and x.base_pour + (select count(*) from wm.propositions_votes v where v.proposition = x.id and v.vote = 'for')
                 + floor(extract(epoch from clock_timestamp() - x.cree_at) / 1.5) >= x.besoin order by x.id loop
    if wm.prop_promouvoir(r.id) is not null then n := n + 1; end if;
  end loop;
  return n;
end $$;

create or replace function wm.proposal_vote(p_id bigint, p_vote text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); x wm.propositions;
begin
  if p_vote is null or p_vote not in ('for', 'against') then perform wm.fail('vote_invalide'); end if;
  perform 1 from public.user_stats where user_id = v_uid for update;
  select * into x from wm.propositions y where y.id = p_id and y.etat = 'vote' for update;
  if not found or x.user_id = v_uid then perform wm.fail('proposition_indisponible'); end if;
  insert into wm.propositions_votes (proposition, user_id, vote) values (p_id, v_uid, p_vote) on conflict do nothing;
  if not found then perform wm.fail('deja_vote'); end if;
  perform wm.xp_add(v_uid, 2, 'vote');
  perform wm.props_avancer();
  return wm.reponse(v_uid, jsonb_build_object('props', wm.props_etat(v_uid)));
end $$;

select wm.droits();
