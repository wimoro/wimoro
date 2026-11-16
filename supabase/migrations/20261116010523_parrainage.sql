-- Parrainage en mode Compte.
--
-- Règles du mode Démo, tenues par le serveur : chaque joueur a un code (PSEUDO-XXX) et un lien d'invitation ; l'ami qui crée
-- son compte avec ce code reçoit 10 $ ; le parrain reçoit 10 $ au premier pari de son filleul. Sans limite de filleuls.
-- Le code est lu une seule fois, à la création du compte : il ne peut être ni ajouté ni changé après coup.
-- Une erreur dans le parrainage ne doit jamais empêcher de créer un compte ni de placer un pari : les deux points d'entrée
-- (création du compte, premier pari) sont protégés, et le bonus du parrain se rattrape à son prochain chargement.

create table if not exists wm.ref_codes (
  user_id uuid primary key references public.users(id) on delete cascade,
  code text not null unique
);
create table if not exists wm.parrainages (
  filleul uuid primary key references public.users(id) on delete cascade,
  parrain uuid not null references public.users(id) on delete cascade,
  code text not null,
  bonus_filleul numeric(12,2) not null default 0,
  bonus_parrain numeric(12,2) not null default 0,
  cree_at timestamptz not null default now(),
  paye_at timestamptz                                  -- premier pari du filleul : bonus du parrain versé
);
alter table wm.ref_codes enable row level security;
alter table wm.parrainages enable row level security;
revoke all on wm.ref_codes, wm.parrainages from public, anon, authenticated;
create index if not exists parrainages_parrain on wm.parrainages (parrain, cree_at desc);

create or replace function wm.ref_bonus() returns numeric
language sql immutable set search_path = '' as $$ select 10::numeric $$;

-- Le code d'un joueur : créé à la première demande, stable ensuite (même si le pseudo change).
create or replace function wm.ref_code(p_user uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v text; v_base text; i integer := 0;
begin
  select r.code into v from wm.ref_codes r where r.user_id = p_user;
  if found then return v; end if;
  select upper(left(regexp_replace(u.username, '[^A-Za-z0-9]', '', 'g'), 8)) into v_base from public.users u where u.id = p_user;
  if not found then return null; end if;
  if length(coalesce(v_base, '')) < 2 then v_base := 'WIM'; end if;
  loop
    v := v_base || '-' || upper(substr(md5(p_user::text || ':' || i::text), 1, 3));
    insert into wm.ref_codes (user_id, code) values (p_user, v) on conflict do nothing;
    if found then return v; end if;
    select r.code into v from wm.ref_codes r where r.user_id = p_user;       -- créé entre-temps par une autre requête du même joueur
    if found then return v; end if;
    i := i + 1;                                                              -- code déjà pris par un autre joueur : on en essaie un autre
    if i > 50 then raise exception 'code_parrainage' using errcode = 'P0001'; end if;
  end loop;
end $$;

-- ── À la création du compte : l'ami reçoit son bonus, le parrain est prévenu ──
create or replace function wm.ref_appliquer(p_filleul uuid, p_code text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_code text := upper(trim(coalesce(p_code, ''))); v_parrain uuid; v_bonus numeric := wm.ref_bonus(); v_solde numeric; v_n text;
begin
  if v_code !~ '^[A-Z0-9]{2,10}-[A-Z0-9]{3}$' then return false; end if;
  select r.user_id into v_parrain from wm.ref_codes r where r.code = v_code;
  if v_parrain is null or v_parrain = p_filleul then return false; end if;
  insert into wm.parrainages (filleul, parrain, code, bonus_filleul) values (p_filleul, v_parrain, v_code, v_bonus) on conflict (filleul) do nothing;
  if not found then return false; end if;                                    -- déjà parrainé : jamais deux fois
  update public.user_stats set balance = balance + v_bonus where user_id = p_filleul returning balance into v_solde;
  if not found then raise exception 'profil_absent' using errcode = 'P0001'; end if;
  insert into public.balance_ledger (user_id, amount, balance_after, kind, ref_id) values (p_filleul, v_bonus, v_solde, 'parrainage', v_code);
  insert into public.deposits (user_id, coin, network, coin_amount, usd_equivalent, confirmations_received, confirmations_required, label, status)
  values (p_filleul, 'USDC', 'Wimoro', v_bonus, v_bonus, 12, 12, 'parrainage', 'completed');   -- ligne étiquetée : hors plafonds de dépôt, hors compteur de dépôts
  select u.username into v_n from public.users u where u.id = p_filleul;
  perform wm.notify(p_filleul, 'gift', 'parrain_bonus', jsonb_build_object('gain', v_bonus, 'code', v_code), '#parrainage');
  perform wm.notify(v_parrain, 'users', 'parrain_inscrit', jsonb_build_object('n', v_n, 'gain', v_bonus), '#parrainage');
  return true;
end $$;

-- ── Verse au parrain ce qui lui est dû : son bonus pour chaque filleul qui a placé son premier pari ──
create or replace function wm.ref_regler(p_parrain uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; v_bonus numeric := wm.ref_bonus(); v_solde numeric; n integer := 0;
begin
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

-- Premier pari d'un joueur, quel que soit le jeu (marché, éclair, Série, Blitz, duel, combiné) : son compteur passe de 0 à 1.
create or replace function wm.ref_premier_pari() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_parrain uuid;
begin
  select p.parrain into v_parrain from wm.parrainages p where p.filleul = new.user_id and p.paye_at is null;
  if v_parrain is null then return null; end if;
  begin
    perform wm.ref_regler(v_parrain);
  exception when others then                                                 -- le pari passe quoi qu'il arrive ; rattrapé au prochain chargement du parrain
    raise warning 'parrainage : bonus du parrain reporté pour le filleul % (%)', new.user_id, sqlerrm;
  end;
  return null;
end $$;

create or replace trigger ref_premier_pari after update of bets_placed on public.user_stats
  for each row when (coalesce(old.bets_placed, 0) = 0 and coalesce(new.bets_placed, 0) > 0)
  execute function wm.ref_premier_pari();

-- ── Ce que le joueur voit : son code, le code qui l'a parrainé, ses filleuls ──
create or replace function wm.ref_etat(p_user uuid) returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object('code', wm.ref_code(p_user), 'bonus', wm.ref_bonus(),
    'by', (select p.code from wm.parrainages p where p.filleul = p_user),
    'list', coalesce((select jsonb_agg(jsonb_build_object('n', u.username, 'at', (extract(epoch from p.cree_at) * 1000)::bigint,
        'st', case when p.paye_at is null then 'pending' else 'done' end, 'paid', p.bonus_parrain,
        'doneAt', (extract(epoch from p.paye_at) * 1000)::bigint) order by p.cree_at desc)
      from (select * from wm.parrainages x where x.parrain = p_user order by x.cree_at desc limit 200) p
      join public.users u on u.id = p.filleul), '[]'::jsonb))
$$;

-- ── Création du compte : le code saisi à l'inscription est lu ici, une seule fois ──
create or replace function public.handle_auth_user_created() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_voulu text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'username', '')), '');
  v_base text;
  v_pseudo text;
  v_essai integer := 0;
begin
  if v_voulu is null or v_voulu !~ '^[A-Za-z0-9._]{3,20}$' or wm.pseudo_reserve(v_voulu) then
    v_voulu := null;
  end if;
  v_base := coalesce(v_voulu, 'joueur' || substr(replace(new.id::text, '-', ''), 1, 6));
  v_pseudo := v_base;
  while exists (select 1 from public.users u where lower(u.username) = lower(v_pseudo)) loop
    v_essai := v_essai + 1;
    v_pseudo := left(v_base, 16) || substr(md5(new.id::text || v_essai::text), 1, 4);
  end loop;

  insert into public.users (id, username, email, avatar_color, onboarded, welcomed, is_demo, is_test)
  values (new.id, v_pseudo, coalesce(new.email, new.id::text || '@sans-email.invalid'), '#2448FF', false, false, false,
          coalesce(new.raw_user_meta_data ->> 'test', '') = 'true')
  on conflict (id) do nothing;

  begin
    perform wm.ref_appliquer(new.id, new.raw_user_meta_data ->> 'ref');
  exception when others then                                                 -- le compte est créé quoi qu'il arrive
    raise warning 'parrainage non appliqué pour le compte % (%)', new.id, sqlerrm;
  end;
  return new;
end $$;

-- ── L'état du joueur porte son parrainage ; ce qui se règle au chargement passe avant la lecture ──
-- (duel expiré, bonus de parrainage dû : la réponse elle-même porte le solde et les notifications à jour)
create or replace function wm.state() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); v jsonb;
begin
  perform wm.duels_expirer(v_uid);
  perform wm.ref_regler(v_uid);
  v := wm.state_socle();
  return v || jsonb_build_object('serie', wm.serie_etat(v_uid),
    'blitz', coalesce((select jsonb_agg(j.blitz order by j.blitz) from wm.blitz_joueurs j where j.user_id = v_uid and not j.regle), '[]'::jsonb),
    'duels', wm.duels_etat(v_uid), 'combos', wm.combos_etat(v_uid), 'ref', wm.ref_etat(v_uid));
end $$;

select wm.droits();
