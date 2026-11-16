-- Chat du Blitz, en mode Compte : un salon public de plus (« blitz »), celui des joueurs et des spectateurs.
--
--  * Écrire, relire, réagir y suivent les règles du salon général ; diffusion sur le sujet public « salon:blitz ».
--  * Les bots y parlent quand un joueur regarde le salon, avec les phrases du chat du Blitz de la démo (gabarit « Z »,
--    composé par l'écran dans la langue du lecteur) ; le salon s'ouvre avec six messages récents, comme les autres salons
--    publics.
--  * Le panel d'administration voit et peut masquer ses messages.
-- Rien n'est supprimé.

-- ── Les salons ouverts à l'appelant : le général, le chat du Blitz, ceux des marchés, celui de son clan, et le salon VIP
--    s'il en a le rang ──
create or replace function wm.chat_salon_ok(p_room text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_room = 'general' or p_room = 'blitz'
    or (p_room like 'm:%' and exists (select 1 from public.markets m where m.id = substr(p_room, 3)))
    or (p_room like 'clan:%' and p_room = wm.clan_sujet())
    or (p_room = 'vip' and wm.vip_ok()), false)
$$;

-- La ligne du salon, créée au premier message.
create or replace function wm.chat_salon_creer(p_room text) returns void
language sql security definer set search_path = '' as $$
  insert into public.chat_rooms (id, name, kind, market_id)
  values (p_room, case when p_room like 'm:%' then '#' || substr(p_room, 3) when p_room like 'clan:%' then 'Clan' when p_room = 'vip' then 'VIP'
                       when p_room = 'blitz' then 'Blitz Royale' else 'Général' end,
          case when p_room like 'm:%' then 'market' when p_room like 'clan:%' then 'clan' when p_room = 'vip' then 'vip' else 'global' end,
          case when p_room like 'm:%' then substr(p_room, 3) end)
  on conflict (id) do nothing
$$;

-- Fabrique un message de bot pour ce salon (sans l'enregistrer). p_pas : le bot qui vient de parler, à éviter.
create or replace function wm.chat_bot_msg(p_room text, p_at timestamptz, p_pas uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_bot uuid; v_m text; v_p float8;
begin
  select u.id into v_bot from public.users u where u.is_demo and u.id is distinct from p_pas
  offset floor(random() * greatest(1, (select count(*) from public.users x where x.is_demo) - 1))::int limit 1;
  if p_room = 'blitz' then                                                        -- chat du Blitz : les phrases du Blitz de la démo
    if v_bot is null then return null; end if;
    return jsonb_build_object('id', 'b' || nextval('wm.chat_bot_seq'), 'u', v_bot, 'k', 'msg', 'text', '',
      'at', (extract(epoch from p_at) * 1000)::bigint, 'tpl', jsonb_build_object('g', 'Z', 'i', floor(random() * 10000)::int));
  end if;
  if p_room = 'general' then
    select l.market_id, l.current_probability::float8 into v_m, v_p
    from public.market_live_state l join public.markets m on m.id = l.market_id
    where coalesce(m.status, 'open') = 'open'
    order by -ln(greatest(random(), 1e-12)) / greatest(0.05, coalesce(m.heat_level, 1)::float8) limit 1;
  else
    select l.market_id, l.current_probability::float8 into v_m, v_p from public.market_live_state l where l.market_id = substr(p_room, 3);
  end if;
  if v_bot is null or v_m is null then return null; end if;
  return jsonb_build_object('id', 'b' || nextval('wm.chat_bot_seq'), 'u', v_bot, 'k', 'msg', 'text', '',
    'at', (extract(epoch from p_at) * 1000)::bigint,
    'tpl', jsonb_build_object('g', case when p_room = 'general' then 'G' else 'M' end, 'i', floor(random() * 10000)::int,
                              'm', v_m, 'p', round(v_p::numeric, 1), 's', case when random() < v_p / 100 then 1 else 0 end));
end $$;

-- ── Lire des instantanés d'analyse : le chat du Blitz est un salon public ──
create or replace function wm.ana(p_msgs bigint[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); v_clan text := wm.clan_sujet(); v_vip boolean := wm.vip_ok(); v jsonb;
begin
  if p_msgs is null or cardinality(p_msgs) < 1 or cardinality(p_msgs) > 6 then perform wm.fail('analyse_inconnue'); end if;
  select coalesce(jsonb_object_agg(c.id::text, a.snap || jsonb_build_object('id', 'a' || a.id, 'at', (extract(epoch from a.at) * 1000)::bigint)), '{}'::jsonb) into v
  from public.chat_messages c join wm.analyses a on a.id = (c.bet_ref ->> 'ana')::bigint
  where c.id = any (p_msgs) and c.message_type = 'ana' and c.source = 'joueur'
    and (c.room_id = 'general' or c.room_id = 'blitz' or c.room_id like 'm:%'
      or (c.room_id like 'clan:%' and c.room_id = v_clan)
      or (c.room_id = 'vip' and v_vip)
      or (c.room_id like 'dm:%' and v_uid::text = any (string_to_array(substr(c.room_id, 4), ':'))
          and exists (select 1 from public.friendships f where f.status = 'accepted'
                      and wm.dm_salon(f.user_id, f.friend_id) = c.room_id and v_uid in (f.user_id, f.friend_id))));
  return jsonb_build_object('snaps', v);
end $$;

-- ── Administration : le chat du Blitz se modère comme les autres salons ──
create or replace function wm.adm_chat() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('msgs', coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'room', c.room_id, 'u', c.user_id, 'n', u.username,
    'text', coalesce(c.text_content, ''), 'k', coalesce(c.message_type, 'msg'), 'bet', c.bet_ref,
    'at', (extract(epoch from c.created_at) * 1000)::bigint) order by c.created_at desc, c.id desc), '[]'::jsonb))
  from (select * from public.chat_messages x where x.source = 'joueur' and (x.room_id in ('general', 'vip', 'blitz') or x.room_id like 'm:%' or x.room_id like 'clan:%')
        order by x.created_at desc, x.id desc limit 80) c
  join public.users u on u.id = c.user_id
$$;

create or replace function wm.adm_chat_masquer(p_admin uuid, p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.chat_messages;
begin
  update public.chat_messages c set source = 'masque'
  where c.id = p_id and c.source = 'joueur' and (c.room_id in ('general', 'vip', 'blitz') or c.room_id like 'm:%' or c.room_id like 'clan:%') returning * into m;
  if not found then perform wm.fail('message_inconnu'); end if;
  perform wm.adm_note(p_admin, 'message_masque', m.user_id::text, jsonb_build_object('id', m.id, 'room', m.room_id, 'text', left(coalesce(m.text_content, ''), 280)));
  perform wm.chat_diffuser(m.room_id, 'del', jsonb_build_object('id', m.id));
  return wm.adm_chat();
end $$;

select wm.droits();
