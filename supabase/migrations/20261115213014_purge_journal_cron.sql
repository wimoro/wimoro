-- Purge du journal technique de pg_cron (table cron.job_run_details). Autorisée explicitement par le propriétaire du projet.
--
-- pg_cron écrit une ligne à chaque exécution d'une tâche. Le tick des bots tourne toutes les 3 secondes : environ
-- 30 000 lignes par jour (6 Mo), sans limite. Cette tâche garde les 6 dernières heures et supprime le reste, une fois
-- par heure. Aucune donnée de joueur n'est concernée : ce journal ne sert qu'au diagnostic.
select cron.schedule('wm-purge-cron', '7 * * * *', $$delete from cron.job_run_details where end_time < now() - interval '6 hours'$$);