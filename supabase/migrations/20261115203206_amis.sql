-- Amis (lot 4.6, première partie) : recherche d'un joueur, demande, annulation, acceptation, refus, retrait.
--
--  * api_friend(action, joueur) : 'add', 'accept', 'cancel', 'decline', 'remove'. La réponse rend les trois listes à jour
--    (amis, demandes reçues, demandes envoyées) et la fiche publique des joueurs concernés (jamais d'e-mail).
--  * api_users_search(texte) : dix joueurs au plus dont le pseudo contient le texte (vrais joueurs et bots).
--  * Rien n'est supprimé : une demande annulée ou refusée, une amitié retirée passent à l'état « declined » et peuvent
--    être relancées. Les 15 XP d'une nouvelle amitié ne sont donnés qu'une fois par paire de joueurs.
--  * Un bot accepte tout de suite. Un joueur prévenu reçoit une notification, visible à son prochain chargement.
--  * Anti-abus : 30 demandes par heure au plus.

alter table public.friendships
  add column if not exists xp_donne boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

create or replace function wm.amis_json(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with liens as (
    select case when f.user_id = p_user then f.friend_id else f.user_id end as autre, f.status, f.user_id = p_user as de_moi
    from public.friendships f where (f.user_id = p_user or f.friend_id = p_user) and f.status in ('pending', 'accepted'))
  select jsonb_build_object(
    'friends', coalesce((select jsonb_agg(distinct l.autre) from liens l where l.status = 'accepted'), '[]'::jsonb),
    'freqIn', coalesce((select jsonb_agg(l.autre) from liens l where l.status = 'pending' and not l.de_moi
                         and not exists (select 1 from liens a where a.autre = l.autre and a.status = 'accepted')), '[]'::jsonb),
    'freqOut', coalesce((select jsonb_agg(l.autre) from liens l where l.status = 'pending' and l.de_moi
                         and not exists (select 1 from liens a where a.autre = l.autre and a.status = 'accepted')), '[]'::jsonb),
    'users', coalesce((select jsonb_object_agg(x.autre::text, wm.fiche(x.autre)) from (select distinct autre from liens) x), '{}'::jsonb))
$$;

-- Deux joueurs deviennent amis : 15 XP chacun, une seule fois par paire.
create or replace function wm.amis_lier(p_moi uuid, p_autre uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_deja boolean;
begin
  select bool_or(f.xp_donne) into v_deja from public.friendships f
  where (f.user_id = p_moi and f.friend_id = p_autre) or (f.user_id = p_autre and f.friend_id = p_moi);
  update public.friendships f set xp_donne = true
  where (f.user_id = p_moi and f.friend_id = p_autre) or (f.user_id = p_autre and f.friend_id = p_moi);
  if not coalesce(v_deja, false) then
    perform wm.xp_add(p_moi, 15, 'ami');
    if not exists (select 1 from public.users u where u.id = p_autre and u.is_demo) then perform wm.xp_add(p_autre, 15, 'ami'); end if;
  end if;
end $$;

create or replace function wm.friend(p_action text, p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := wm.uid(); cible public.users; v_moi text; v_res text := 'rien'; n integer;
begin
  if p_action is null or p_action not in ('add', 'accept', 'cancel', 'decline', 'remove') then perform wm.fail('action_invalide'); end if;
  if p_user is null or p_user = v_uid then perform wm.fail('joueur_inconnu'); end if;
  select * into cible from public.users where id = p_user;
  if not found then perform wm.fail('joueur_inconnu'); end if;
  select username into v_moi from public.users where id = v_uid;
  -- un seul changement à la fois pour une paire de joueurs, quel que soit celui qui agit
  perform pg_advisory_xact_lock(hashtextextended(least(v_uid, p_user)::text || greatest(v_uid, p_user)::text, 0));

  if p_action = 'add' then
    if exists (select 1 from public.friendships f where f.status = 'accepted' and ((f.user_id = v_uid and f.friend_id = p_user) or (f.user_id = p_user and f.friend_id = v_uid))) then
      v_res := 'amis';
    elsif exists (select 1 from public.friendships f where f.user_id = p_user and f.friend_id = v_uid and f.status = 'pending') then
      p_action := 'accept';                                                           -- il m'avait déjà demandé : on est amis
    else
      select count(*) into n from public.friendships f where f.user_id = v_uid and f.updated_at > now() - interval '1 hour';
      if n >= 30 then perform wm.fail('trop_de_demandes'); end if;
      insert into public.friendships (user_id, friend_id, status, updated_at) values (v_uid, p_user, case when cible.is_demo then 'accepted' else 'pending' end, now())
      on conflict (user_id, friend_id) do update set status = excluded.status, updated_at = now();
      if cible.is_demo then                                                           -- un bot accepte tout de suite
        perform wm.amis_lier(v_uid, p_user); v_res := 'amis';
      else
        perform wm.notify(p_user, 'users', 'fr_demande', jsonb_build_object('u', v_uid, 'n', v_moi), '#amis'); v_res := 'envoyee';
      end if;
    end if;
  end if;

  if p_action = 'accept' then
    update public.friendships set status = 'accepted', updated_at = now() where user_id = p_user and friend_id = v_uid and status = 'pending';
    if not found then perform wm.fail('demande_absente'); end if;
    perform wm.amis_lier(v_uid, p_user);
    perform wm.notify(p_user, 'users', 'fr_acceptee', jsonb_build_object('u', v_uid, 'n', v_moi), '#amis');
    v_res := 'amis';
  elsif p_action = 'decline' then
    update public.friendships set status = 'declined', updated_at = now() where user_id = p_user and friend_id = v_uid and status = 'pending';
    v_res := 'refusee';
  elsif p_action = 'cancel' then
    update public.friendships set status = 'declined', updated_at = now() where user_id = v_uid and friend_id = p_user and status = 'pending';
    v_res := 'annulee';
  elsif p_action = 'remove' then
    update public.friendships set status = 'declined', updated_at = now()
    where status = 'accepted' and ((user_id = v_uid and friend_id = p_user) or (user_id = p_user and friend_id = v_uid));
    v_res := 'retire';
  end if;

  return wm.reponse(v_uid, wm.amis_json(v_uid) || jsonb_build_object('r', v_res, 'users', wm.amis_json(v_uid) -> 'users' || jsonb_build_object(p_user::text, wm.fiche(p_user))));
end $$;

create or replace function wm.users_search(p_q text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); v_q text := lower(btrim(coalesce(p_q, ''))); v jsonb;
begin
  if char_length(v_q) < 2 or char_length(v_q) > 20 or v_q !~ '^[a-z0-9._]+$' then return jsonb_build_object('ids', '[]'::jsonb, 'users', '{}'::jsonb); end if;
  select jsonb_build_object('ids', coalesce(jsonb_agg(x.id order by x.rang, x.username), '[]'::jsonb),
                            'users', coalesce(jsonb_object_agg(x.id::text, wm.fiche(x.id)), '{}'::jsonb)) into v
  from (select u.id, u.username, case when lower(u.username) = v_q then 0 when lower(u.username) like v_q || '%' then 1 else 2 end as rang
        from public.users u where u.id <> v_uid and lower(u.username) like '%' || v_q || '%'
        order by 3, u.is_demo, u.username limit 10) x;
  return v;
end $$;

create or replace function public.api_friend(p_action text, p_user uuid) returns jsonb
language sql security invoker set search_path = '' as $$ select wm.friend(p_action, p_user) $$;
create or replace function public.api_users_search(p_q text) returns jsonb
language sql security invoker set search_path = '' as $$ select wm.users_search(p_q) $$;
select wm.droits();
