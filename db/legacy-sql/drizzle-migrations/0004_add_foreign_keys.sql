-- 0004_add_foreign_keys.sql
-- Add foreign key constraints to all tables

-- swimmer_profiles.user_id → users.id
DO $$ BEGIN
  ALTER TABLE swimmer_profiles ADD CONSTRAINT fk_swimmer_profiles_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- swimming_activities.user_id → users.id
DO $$ BEGIN
  ALTER TABLE swimming_activities ADD CONSTRAINT fk_swimming_activities_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- user_badges.user_id → users.id
DO $$ BEGIN
  ALTER TABLE user_badges ADD CONSTRAINT fk_user_badges_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- user_badges.badge_id → badge_definitions.id
DO $$ BEGIN
  ALTER TABLE user_badges ADD CONSTRAINT fk_user_badges_badge_id FOREIGN KEY (badge_id) REFERENCES badge_definitions(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- user_badges.activity_id → swimming_activities.id (ON DELETE SET NULL)
DO $$ BEGIN
  ALTER TABLE user_badges ADD CONSTRAINT fk_user_badges_activity_id FOREIGN KEY (activity_id) REFERENCES swimming_activities(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- social_posts.user_id → users.id
DO $$ BEGIN
  ALTER TABLE social_posts ADD CONSTRAINT fk_social_posts_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- social_posts.activity_id → swimming_activities.id (ON DELETE SET NULL)
DO $$ BEGIN
  ALTER TABLE social_posts ADD CONSTRAINT fk_social_posts_activity_id FOREIGN KEY (activity_id) REFERENCES swimming_activities(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- social_posts.club_id → community_clubs.id (ON DELETE SET NULL)
DO $$ BEGIN
  ALTER TABLE social_posts ADD CONSTRAINT fk_social_posts_club_id FOREIGN KEY (club_id) REFERENCES community_clubs(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- social_splashes.post_id → social_posts.id
DO $$ BEGIN
  ALTER TABLE social_splashes ADD CONSTRAINT fk_social_splashes_post_id FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- social_splashes.user_id → users.id
DO $$ BEGIN
  ALTER TABLE social_splashes ADD CONSTRAINT fk_social_splashes_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- social_comments.post_id → social_posts.id
DO $$ BEGIN
  ALTER TABLE social_comments ADD CONSTRAINT fk_social_comments_post_id FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- social_comments.user_id → users.id
DO $$ BEGIN
  ALTER TABLE social_comments ADD CONSTRAINT fk_social_comments_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- social_follows.follower_id → users.id
DO $$ BEGIN
  ALTER TABLE social_follows ADD CONSTRAINT fk_social_follows_follower_id FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- social_follows.following_id → users.id
DO $$ BEGIN
  ALTER TABLE social_follows ADD CONSTRAINT fk_social_follows_following_id FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- community_club_members.club_id → community_clubs.id
DO $$ BEGIN
  ALTER TABLE community_club_members ADD CONSTRAINT fk_community_club_members_club_id FOREIGN KEY (club_id) REFERENCES community_clubs(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- community_club_members.user_id → users.id
DO $$ BEGIN
  ALTER TABLE community_club_members ADD CONSTRAINT fk_community_club_members_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- community_club_invites.club_id → community_clubs.id
DO $$ BEGIN
  ALTER TABLE community_club_invites ADD CONSTRAINT fk_community_club_invites_club_id FOREIGN KEY (club_id) REFERENCES community_clubs(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- community_club_invites.inviter_id → users.id
DO $$ BEGIN
  ALTER TABLE community_club_invites ADD CONSTRAINT fk_community_club_invites_inviter_id FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- club_events.club_id → community_clubs.id
DO $$ BEGIN
  ALTER TABLE club_events ADD CONSTRAINT fk_club_events_club_id FOREIGN KEY (club_id) REFERENCES community_clubs(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- club_events.creator_id → users.id
DO $$ BEGIN
  ALTER TABLE club_events ADD CONSTRAINT fk_club_events_creator_id FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- event_attendees.event_id → club_events.id
DO $$ BEGIN
  ALTER TABLE event_attendees ADD CONSTRAINT fk_event_attendees_event_id FOREIGN KEY (event_id) REFERENCES club_events(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- event_attendees.user_id → users.id
DO $$ BEGIN
  ALTER TABLE event_attendees ADD CONSTRAINT fk_event_attendees_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- direct_messages.sender_id → users.id
DO $$ BEGIN
  ALTER TABLE direct_messages ADD CONSTRAINT fk_direct_messages_sender_id FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- direct_messages.receiver_id → users.id
DO $$ BEGIN
  ALTER TABLE direct_messages ADD CONSTRAINT fk_direct_messages_receiver_id FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- user_notifications.user_id → users.id
DO $$ BEGIN
  ALTER TABLE user_notifications ADD CONSTRAINT fk_user_notifications_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- club_announcements.club_id → community_clubs.id
DO $$ BEGIN
  ALTER TABLE club_announcements ADD CONSTRAINT fk_club_announcements_club_id FOREIGN KEY (club_id) REFERENCES community_clubs(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- club_announcements.author_id → users.id
DO $$ BEGIN
  ALTER TABLE club_announcements ADD CONSTRAINT fk_club_announcements_author_id FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- club_media.club_id → community_clubs.id
DO $$ BEGIN
  ALTER TABLE club_media ADD CONSTRAINT fk_club_media_club_id FOREIGN KEY (club_id) REFERENCES community_clubs(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- club_media.uploader_id → users.id
DO $$ BEGIN
  ALTER TABLE club_media ADD CONSTRAINT fk_club_media_uploader_id FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- club_media.event_id → club_events.id (ON DELETE SET NULL)
DO $$ BEGIN
  ALTER TABLE club_media ADD CONSTRAINT fk_club_media_event_id FOREIGN KEY (event_id) REFERENCES club_events(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- post_reactions.post_id → social_posts.id
DO $$ BEGIN
  ALTER TABLE post_reactions ADD CONSTRAINT fk_post_reactions_post_id FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- post_reactions.user_id → users.id
DO $$ BEGIN
  ALTER TABLE post_reactions ADD CONSTRAINT fk_post_reactions_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- user_achievement_badges.user_id → users.id
DO $$ BEGIN
  ALTER TABLE user_achievement_badges ADD CONSTRAINT fk_user_achievement_badges_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- user_achievement_badges.badge_id → achievement_badge_definitions.id
DO $$ BEGIN
  ALTER TABLE user_achievement_badges ADD CONSTRAINT fk_user_achievement_badges_badge_id FOREIGN KEY (badge_id) REFERENCES achievement_badge_definitions(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- xp_transactions.user_id → users.id
DO $$ BEGIN
  ALTER TABLE xp_transactions ADD CONSTRAINT fk_xp_transactions_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- personal_records.user_id → users.id
DO $$ BEGIN
  ALTER TABLE personal_records ADD CONSTRAINT fk_personal_records_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- personal_records.activity_id → swimming_activities.id (ON DELETE SET NULL)
DO $$ BEGIN
  ALTER TABLE personal_records ADD CONSTRAINT fk_personal_records_activity_id FOREIGN KEY (activity_id) REFERENCES swimming_activities(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- garmin_tokens.user_id → users.id
DO $$ BEGIN
  ALTER TABLE garmin_tokens ADD CONSTRAINT fk_garmin_tokens_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- strava_tokens.user_id → users.id
DO $$ BEGIN
  ALTER TABLE strava_tokens ADD CONSTRAINT fk_strava_tokens_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ai_insights_cache.user_id → users.id
DO $$ BEGIN
  ALTER TABLE ai_insights_cache ADD CONSTRAINT fk_ai_insights_cache_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- activity_ai_insights.user_id → users.id
DO $$ BEGIN
  ALTER TABLE activity_ai_insights ADD CONSTRAINT fk_activity_ai_insights_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- activity_ai_insights.activity_id → swimming_activities.id
DO $$ BEGIN
  ALTER TABLE activity_ai_insights ADD CONSTRAINT fk_activity_ai_insights_activity_id FOREIGN KEY (activity_id) REFERENCES swimming_activities(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ai_coach_workouts.user_id → users.id
DO $$ BEGIN
  ALTER TABLE ai_coach_workouts ADD CONSTRAINT fk_ai_coach_workouts_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- weekly_stats.user_id → users.id
DO $$ BEGIN
  ALTER TABLE weekly_stats ADD CONSTRAINT fk_weekly_stats_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ghost_challenges.club_id → community_clubs.id (ON DELETE SET NULL)
DO $$ BEGIN
  ALTER TABLE ghost_challenges ADD CONSTRAINT fk_ghost_challenges_club_id FOREIGN KEY (club_id) REFERENCES community_clubs(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ghost_challenges.challenger_user_id → users.id
DO $$ BEGIN
  ALTER TABLE ghost_challenges ADD CONSTRAINT fk_ghost_challenges_challenger_user_id FOREIGN KEY (challenger_user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ghost_challenges.opponent_user_id → users.id
DO $$ BEGIN
  ALTER TABLE ghost_challenges ADD CONSTRAINT fk_ghost_challenges_opponent_user_id FOREIGN KEY (opponent_user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ghost_challenges.challenger_activity_id → swimming_activities.id
DO $$ BEGIN
  ALTER TABLE ghost_challenges ADD CONSTRAINT fk_ghost_challenges_challenger_activity_id FOREIGN KEY (challenger_activity_id) REFERENCES swimming_activities(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ghost_challenges.opponent_activity_id → swimming_activities.id
DO $$ BEGIN
  ALTER TABLE ghost_challenges ADD CONSTRAINT fk_ghost_challenges_opponent_activity_id FOREIGN KEY (opponent_activity_id) REFERENCES swimming_activities(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- challenges.creator_id → users.id
DO $$ BEGIN
  ALTER TABLE challenges ADD CONSTRAINT fk_challenges_creator_id FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- challenge_participants.challenge_id → challenges.id
DO $$ BEGIN
  ALTER TABLE challenge_participants ADD CONSTRAINT fk_challenge_participants_challenge_id FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- challenge_participants.user_id → users.id
DO $$ BEGIN
  ALTER TABLE challenge_participants ADD CONSTRAINT fk_challenge_participants_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- challenge_badges.challenge_id → challenges.id
DO $$ BEGIN
  ALTER TABLE challenge_badges ADD CONSTRAINT fk_challenge_badges_challenge_id FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- challenge_activity_log.challenge_id → challenges.id
DO $$ BEGIN
  ALTER TABLE challenge_activity_log ADD CONSTRAINT fk_challenge_activity_log_challenge_id FOREIGN KEY (challenge_id) REFERENCES challenges(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- challenge_activity_log.user_id → users.id
DO $$ BEGIN
  ALTER TABLE challenge_activity_log ADD CONSTRAINT fk_challenge_activity_log_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- challenge_activity_log.activity_id → swimming_activities.id
DO $$ BEGIN
  ALTER TABLE challenge_activity_log ADD CONSTRAINT fk_challenge_activity_log_activity_id FOREIGN KEY (activity_id) REFERENCES swimming_activities(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
