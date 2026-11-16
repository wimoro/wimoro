-- Duels de stack, en mode Compte.
--
-- Règles du mode Démo (js/duels.js), tenues par le serveur : même buy-in, 1 000 jetons chacun, sept jours sur tous les
-- marchés ; le stack du joueur suit ses résultats réels depuis le départ (1 jeton = 1 $ de résultat : ce qu'il a gagné ou
-- perdu, plus la valeur de ses positions) ; le plus gros stack à la fin remporte la cagnotte (les deux buy-in moins 4 %)
-- et 30 XP ; à égalité, le buy-in est rendu.
-- En mode Compte, l'adversaire est un joueur simulé (un bot) : son stack suit une trajectoire semée par le duel, calculée
-- heure par heure par le serveur (elle finit le plus souvent entre 800 et 1 300 jetons). Défier un vrai joueur demanderait
-- son accord et sa mise ; l'écran n'a pas cette étape : le serveur le refuse clairement (stack_joueur_reel).
-- Le règlement se fait au premier passage du joueur après la fin des sept jours ; son stack est alors lu à ce moment-là.
-- Rien n'est supprimé.

create table if not exists wm.stacks (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  adv uuid not null references public.users(id) on delete cascade,          -- un bot
  buyin numeric(12,2) not null,
  ref numeric(14,2) not null,                                                -- résultat du joueur (réalisé + positions) au départ
  etat text not null default 'active' check (etat in ('active', 'won', 'lost', 'void')),
  mon_stack integer, son_stack integer,                                      -- figés au règlement
  cree_at timestamptz not null default now(),
  fin_at timestamptz not null,
  regle_at timestamptz
);
alter table wm.stacks enable row level security;
revoke all on wm.stacks from public, anon, authenticated;
create index if not exists stacks_joueur on wm.stacks (user_id, id desc);

-- Le résultat d'un joueur à cet instant : ce qu'il a réalisé, plus ce que valent ses positions par rapport à leur prix d'achat.
create or replace function wm.resultat(p_user uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.profit_realized from public.user_stats s where s.user_id = p_user), 0)
       + coalesce((select sum(p.shares * ((case when p.side = 'oui' then l.current_probability else 100 - l.current_probability end) - p.average_price) / 100)
                   from public.positions p join public.market_live_state l on l.market_id = p.market_id where p.user_id = p_user and p.shares > 0), 0)
$$;

-- Le stack de l'adversaire simulé après p_heures heures (168 au plus) : 1 000 jetons, puis une variation semée par heure.
create or replace function wm.stack_adverse(p_id bigint, p_heures integer) returns integer
language sql immutable set search_path = '' as $$
  select greatest(0, round(1000 * exp(coalesce(sum(ln(1 + ((abs(hashtext(p_id::text || ':' || i)::bigint) % 10001) / 10000.0 - 0.49) * 0.04)), 0))))::integer
  from generate_series(1, greatest(0, least(coalesce(p_heures, 0), 168))) i
$$;

create or replace function wm.stack_json(s wm.stacks, p_resultat numeric) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', s.id, 'opp', s.adv, 'buyin', s.buyin, 'st', s.etat,
    'at', (extract(epoch from s.cree_at) * 1000)::bigint, 'endAt', (extract(epoch from s.fin_at) * 1000)::bigint,
    'settleAt', (extract(epoch from s.regle_at) * 1000)::bigint,
    'my', case when s.etat = 'active' then greatest(0, round(1000 + p_resultat - s.ref))::integer else s.mon_stack end,
    'theirs', case when s.etat = 'active' then wm.stack_adverse(s.id, floor(extract(epoch from least(now(), s.fin_at) - s.cree_at) / 3600)::integer) else s.son_stack end)
$$;

-- Les duels de stack du joueur (20 derniers) et les fiches de ses adversaires.
create or replace function wm.stacks_etat(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with l as (select * from wm.stacks s where s.user_id = p_user order by s.id desc limit 20), r as (select wm.resultat(p_user) as v)
  select jsonb_build_object(
    'liste', coalesce((select jsonb_agg(wm.stack_json(l, r.v) order by l.id desc) from l, r), '[]'::jsonb),
    'users', coalesce((select jsonb_object_agg(a.u::text, wm.fiche(a.u)) from (select distinct l.adv as u from l) a), '{}'::jsonb))
$$;

-- Au passage du joueur : les duels arrivés au bout de leurs sept jours sont réglés.
create or replace function wm.stacks_avant(p_user uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare s wm.stacks; v_moi integer; v_lui integer; v_pot numeric; v_solde numeric; v_res numeric; n integer := 0;
begin
  if not exists (select 1 from wm.stacks x where x.user_id = p_user and x.etat = 'active' and x.fin_at <= now()) then return 0; end if;
  perform 1 from public.user_stats where user_id = p_user for update;
  v_res := wm.resultat(p_user);
  for s in select * from wm.stacks x where x.user_id = p_user and x.etat = 'active' and x.fin_at <= now() order by x.id for update loop
    v_moi := greatest(0, round(1000 + v_res - s.ref))::integer; v_lui := wm.stack_adverse(s.id, 168);
    v_pot := round(s.buyin * 2 * 0.96, 2);
    update wm.stacks set etat = case when v_moi > v_lui then 'won' when v_moi < v_lui then 'lost' else 'void' end, mon_stack = v_moi, son_stack = v_lui, regle_at = now() where id = s.id;
    if v_moi > v_lui then
      update public.user_stats set balance = balance + v_pot, profit_realized = coalesce(profit_realized, 0) + v_pot - s.buyin where user_id = p_user returning balance into v_solde;
      insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (p_user, v_pot, v_solde, 'stack_gain', s.id::text);
      perform wm.xp_add(p_user, 30, 'stack');
      perform wm.rank_refresh(p_user); perform wm.badges_check(p_user);
    elsif v_moi = v_lui then
      update public.user_stats set balance = balance + s.buyin where user_id = p_user returning balance into v_solde;
      insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (p_user, s.buyin, v_solde, 'stack_rendu', s.id::text);
    else
      update public.user_stats set profit_realized = coalesce(profit_realized, 0) - s.buyin where user_id = p_user;
    end if;
    perform wm.notify(p_user, 'swords', case when v_moi > v_lui then 'stack_gagne' when v_moi < v_lui then 'stack_perdu' else 'stack_nul' end,
      jsonb_build_object('id', s.id, 'u', s.adv, 'gain', v_pot - s.buyin, 'moi', v_moi, 'lui', v_lui), '#duels');
    n := n + 1;
  end loop;
  return n;
end $$;

-- ── Lancer un duel de stack : p = { buyin, opp, key } ──
create or replace function wm.stack_create(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := wm.uid(); v_buyin numeric := round(wm.num(p ->> 'buyin'), 2); v_key uuid := nullif(p ->> 'key', '')::uuid; v_adv uuid;
  s public.user_stats; v_prev jsonb; v_solde numeric; v_bot boolean; x wm.stacks; v_res jsonb;
begin
  if v_buyin is null or v_buyin < 5 or v_buyin > 1000 then perform wm.fail('montant_invalide'); end if;
  if v_key is null then perform wm.fail('cle_absente'); end if;
  if coalesce(p ->> 'opp', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then perform wm.fail('joueur_inconnu'); end if;
  v_adv := (p ->> 'opp')::uuid;
  select * into s from public.user_stats where user_id = v_uid for update;
  if not found then perform wm.fail('profil_absent'); end if;
  select o.result into v_prev from wm.ops o where o.user_id = v_uid and o.key = v_key;
  if found then return v_prev || jsonb_build_object('rejoue', true); end if;
  perform wm.rg_garde(v_uid);
  select coalesce(u.is_demo, false) into v_bot from public.users u where u.id = v_adv;
  if not found or v_adv = v_uid then perform wm.fail('joueur_inconnu'); end if;
  if not v_bot then perform wm.fail('stack_joueur_reel'); end if;                 -- un vrai joueur devrait donner son accord et sa mise
  if (select count(*) from wm.stacks y where y.user_id = v_uid and y.etat = 'active') >= 5 then perform wm.fail('trop_de_duels'); end if;
  if s.balance < v_buyin then perform wm.fail('solde_insuffisant'); end if;
  v_solde := s.balance - v_buyin;
  update public.user_stats set balance = v_solde where user_id = v_uid;
  insert into wm.stacks (user_id, adv, buyin, ref, fin_at) values (v_uid, v_adv, v_buyin, round(wm.resultat(v_uid), 2), now() + interval '7 days') returning * into x;
  insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (v_uid, -v_buyin, v_solde, 'stack', x.id::text);
  perform wm.notify(v_uid, 'swords', 'stack_lance', jsonb_build_object('id', x.id, 'u', v_adv, 'k', v_buyin), '#duels');
  v_res := wm.reponse(v_uid, jsonb_build_object('stack', x.id, 'stacks', wm.stacks_etat(v_uid)));
  insert into wm.ops (user_id, key, op, result) values (v_uid, v_key, 'stack', v_res);
  return v_res;
end $$;

-- Relire ses duels de stack (les stacks en cours bougent avec les marchés).
create or replace function wm.stacks() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); n integer;
begin
  n := wm.stacks_avant(v_uid);
  return case when n > 0 then wm.reponse(v_uid, jsonb_build_object('stacks', wm.stacks_etat(v_uid))) else jsonb_build_object('stacks', wm.stacks_etat(v_uid)) end;
end $$;

create or replace function public.api_stack_create(p jsonb) returns jsonb language sql security invoker set search_path = '' as $$ select wm.stack_create(p) $$;
create or replace function public.api_stacks() returns jsonb language sql security invoker set search_path = '' as $$ select wm.stacks() $$;

insert into wm.etat_blocs (cle, fonction, ordre, avant) values ('stacks_avancer', 'wm.stacks_avant', 45, true), ('stacks', 'wm.stacks_etat', 95, false)
on conflict (cle) do update set fonction = excluded.fonction, ordre = excluded.ordre, avant = excluded.avant;

select wm.droits();
