-- Bots dans le chat : un rythme par salon regardé.
--
-- Avant : un seul message par passage, dans un salon tiré au sort parmi ceux regardés. Avec quatre salons regardés, chacun
-- pouvait rester une minute sans rien. Désormais chaque salon regardé (8 au plus, les plus récemment vus) a sa propre
-- chance à chaque passage : environ un message toutes les 15 secondes par salon, quel que soit le nombre de salons.
-- Toujours rien si personne n'est présent, et toujours aucune ligne créée (anneau de 30 messages par salon).
create or replace function wm.bots_chat() returns void
language plpgsql security definer set search_path = '' as $$
declare
  cfg jsonb := coalesce((select c.value from wm.config c where c.key = 'bots'), '{}'::jsonb);
  v_chat float8 := greatest(0::float8, least(3::float8, coalesce((cfg ->> 'chat')::float8, 1)));
  s record; v_msg jsonb;
begin
  if not coalesce((cfg ->> 'actif')::boolean, true) or v_chat <= 0 then return; end if;
  if not coalesce((select c.updated_at > now() - interval '6 minutes' from wm.config c where c.key = 'presence'), false) then return; end if;
  for s in select b.room, b.dernier from wm.chat_bots b where b.vu_at > now() - interval '6 minutes' order by b.vu_at desc limit 8 for update skip locked loop
    continue when random() >= 0.35 * v_chat;
    v_msg := wm.chat_bot_msg(s.room, now(), s.dernier);
    continue when v_msg is null;
    perform wm.chat_bot_poser(s.room, v_msg);
    perform realtime.send(v_msg || jsonb_build_object('f', wm.fiche((v_msg ->> 'u')::uuid)), 'msg', 'salon:' || s.room, false);
  end loop;
end $$;
