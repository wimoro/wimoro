-- Panneau d'administration, lot 5 (19 nov. 2026) : ce que le serveur diffuse en temps réel quand l'équipe agit.
--
-- Côté serveur seulement : l'écran s'y abonnera au lot de l'interface. Rien de ce qui existe ne change : des déclencheurs
-- s'ajoutent sur les tables des lots 1 et 2 (wm.reglages, wm.blocages, wm.deconnexions), et un sur public.markets
-- (sauvegardée au lot 0) qui ne fait qu'envoyer un message quand le titre d'un marché change.
--   * sujet public « site » (comme « marches », sans règle de lecture) :
--       « cfg »      un réglage public a changé : {cle, v, rev} ;
--       « annonce »  l'annonce publiée ou retirée : {annonce (ou null), rev} ;
--       « maint »    la maintenance : {actif, message, rev} ;
--       « marche »   le titre d'un marché corrigé : {id, q, short}.
--     Les réglages partent à la fin de la transaction, une fois chacun, avec leur valeur finale (la maintenance écrit deux
--     réglages : un seul « maint ») ; rev est la révision que donne aussi api_site().
--   * le salon concerné, par wm.chat_diffuser (privé pour le VIP et les clans, comme leurs messages) :
--       « regle »    ses règles : {salon, lent, ferme}.
--   * sujet privé « joueur:<id> » (la règle wm_joueur_lit_son_sujet n'en ouvre la lecture qu'à lui) :
--       « bloc »     un blocage posé : {id, acces, salon, fin} (fin en millisecondes, -1 : sans fin), comme api_mes_blocages ;
--       « debloc »   un blocage levé : {id, acces, salon} ;
--       « deco »     une déconnexion forcée : {at}. Le serveur refuse déjà la session d'avant ; l'écran n'a plus qu'à se fermer.
--     Un blocage qui arrive à sa fin n'envoie rien : l'écran connaît « fin ».
-- realtime.send n'interrompt jamais l'action (Supabase attrape ses erreurs) et un message n'est publié que si la transaction
-- aboutit (il est écrit dans realtime.messages).

-- ══ 1. Réglages → « site », et le salon dont les règles changent ══
create or replace function wm.reglages_diffuser() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_deja text := coalesce(current_setting('wm.diffuses', true), '');   -- ce que cette transaction a déjà diffusé
  v_rev bigint := coalesce((select r.rev from wm.revisions r where r.nom = 'reglages'), 0);
  v_salons jsonb; v_salon text;
begin
  if new.cle = 'site.annonce' then
    if position('|annonce|' in v_deja) = 0 then
      perform realtime.send(jsonb_build_object('annonce', wm.site() -> 'annonce', 'rev', v_rev), 'annonce', 'site', false);
      v_deja := v_deja || '|annonce|';
    end if;
  elsif new.cle in ('site.maintenance', 'site.maintenance_message') then
    if position('|maint|' in v_deja) = 0 then
      perform realtime.send((wm.site() -> 'maintenance') || jsonb_build_object('rev', v_rev), 'maint', 'site', false);
      v_deja := v_deja || '|maint|';
    end if;
  elsif position('|cfg:' || new.cle || '|' in v_deja) = 0 then
    perform realtime.send(jsonb_build_object('cle', new.cle, 'v', (select r.valeur from wm.reglages r where r.cle = new.cle), 'rev', v_rev),
      'cfg', 'site', false);
    v_deja := v_deja || '|cfg:' || new.cle || '|';
  end if;

  if new.cle = 'chat.salons' then
    v_salons := (select r.valeur from wm.reglages r where r.cle = 'chat.salons');
    if jsonb_typeof(v_salons) is distinct from 'object' then v_salons := '{}'::jsonb; end if;
    for v_salon in
      select x.k from (
        select jsonb_object_keys(case when jsonb_typeof(old.valeur) = 'object' then old.valeur else '{}'::jsonb end) as k
        union
        select jsonb_object_keys(case when jsonb_typeof(new.valeur) = 'object' then new.valeur else '{}'::jsonb end)) x
      where (old.valeur -> x.k) is distinct from (new.valeur -> x.k)
      order by 1
    loop
      if position('|regle:' || v_salon || '|' in v_deja) = 0 then
        perform wm.chat_diffuser(v_salon, 'regle', jsonb_build_object('salon', v_salon,
          'lent', coalesce(wm.num(v_salons -> v_salon ->> 'lent'), 0), 'ferme', coalesce((v_salons -> v_salon ->> 'ferme')::boolean, false)));
        v_deja := v_deja || '|regle:' || v_salon || '|';
      end if;
    end loop;
  end if;
  perform set_config('wm.diffuses', v_deja, true);
  return null;
end $$;

-- à la fin de la transaction (valeur finale) ; seulement si la valeur d'un réglage public a vraiment changé
create constraint trigger reglages_diffusion after update of valeur on wm.reglages
  deferrable initially deferred for each row
  when (old.valeur is distinct from new.valeur and new.public)
  execute function wm.reglages_diffuser();

-- ══ 2. Blocages et déconnexions → le sujet privé du joueur ══
create or replace function wm.blocages_diffuser() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.leve_at is null and new.debut_at <= now() and (new.fin_at is null or new.fin_at > now()) then
      perform wm.joueur_signal(new.user_id, 'bloc', jsonb_build_object('id', new.id, 'acces', new.acces, 'salon', new.salon,
        'fin', case when new.fin_at is null then -1 else wm.en_ms(new.fin_at) end));
    end if;
  elsif old.leve_at is null and new.leve_at is not null then
    perform wm.joueur_signal(new.user_id, 'debloc', jsonb_build_object('id', new.id, 'acces', new.acces, 'salon', new.salon));
  end if;
  return null;
end $$;

create trigger blocages_diffusion after insert or update of leve_at on wm.blocages
  for each row execute function wm.blocages_diffuser();

create or replace function wm.deconnexions_diffuser() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform wm.joueur_signal(new.user_id, 'deco', jsonb_build_object('at', wm.en_ms(new.at)));
  return null;
end $$;

create trigger deconnexions_diffusion after insert on wm.deconnexions
  for each row execute function wm.deconnexions_diffuser();

-- ══ 3. Titre d'un marché corrigé → « site » ══
create or replace function wm.marche_titre_diffuser() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(jsonb_build_object('id', new.id, 'q', new.question, 'short', coalesce(new.short_question, left(new.question, 40))),
    'marche', 'site', false);
  return null;
end $$;

create trigger marches_titre_diffusion after update of question, short_question on public.markets
  for each row
  when (old.question is distinct from new.question or old.short_question is distinct from new.short_question)
  execute function wm.marche_titre_diffuser();

select wm.droits();
