-- Suivre un joueur en mode Compte.
--
-- Comme dans la démo : un bouton « Suivre » / « Suivi » sur chaque profil. La liste est tenue par le serveur (table
-- public.user_following, déjà lue par api_state), avec le compteur d'abonnés du joueur suivi, visible sur sa fiche.
-- Borne technique : 500 joueurs suivis au plus.

create or replace function wm.follow(p_user uuid, p_on boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := wm.uid(); v_n integer;
begin
  if p_user is null or p_user = v_uid or not exists (select 1 from public.users u where u.id = p_user) then perform wm.fail('joueur_inconnu'); end if;
  if coalesce(p_on, true) then
    if (select count(*) from public.user_following f where f.follower_id = v_uid) >= 500 then perform wm.fail('trop_de_suivis'); end if;
    insert into public.user_following (follower_id, followed_id) values (v_uid, p_user) on conflict do nothing;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      update public.user_stats set followers_count = coalesce(followers_count, 0) + 1 where user_id = p_user;
      update public.user_stats set following_count = coalesce(following_count, 0) + 1 where user_id = v_uid;
      perform wm.badges_check(p_user);                                          -- badge « Suivi par 25 »
    end if;
  else
    delete from public.user_following f where f.follower_id = v_uid and f.followed_id = p_user;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      update public.user_stats set followers_count = greatest(0, coalesce(followers_count, 0) - 1) where user_id = p_user;
      update public.user_stats set following_count = greatest(0, coalesce(following_count, 0) - 1) where user_id = v_uid;
    end if;
  end if;
  return wm.reponse(v_uid, jsonb_build_object(
    'following', coalesce((select jsonb_agg(f.followed_id order by f.created_at) from public.user_following f where f.follower_id = v_uid), '[]'::jsonb),
    'users', jsonb_build_object(p_user::text, wm.fiche(p_user))));
end $$;

create or replace function public.api_follow(p_user uuid, p_on boolean) returns jsonb language sql security invoker set search_path = '' as $$ select wm.follow(p_user, p_on) $$;

select wm.droits();
