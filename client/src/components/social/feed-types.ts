export interface FeedTaggedUser {
  user_id: number
  name?: string | null
  username?: string | null
  avatar_url?: string | null
}

export interface FeedPostRecord {
  id: number
  user_id: number
  activity_id?: number | null
  content?: string | null
  media_url?: string | null
  media_urls?: string[] | string | null
  tagged_users?: FeedTaggedUser[] | string | null
  hashtags?: string[] | string | null
  is_following?: boolean
  created_at: string
  activity_distance_meters?: number | null
  activity_duration_seconds?: number | null
  activity_calories?: number | null
  activity_heart_rate?: number | null
  activity_swolf?: number | null
  activity_is_open_water?: boolean | null
  comment_count?: number | string
  user_name?: string | null
  user_email?: string | null
  user_avatar?: string | null
  user_club_name?: string | null
  user_level?: number | null
  user_is_online?: boolean | null
  activity_source?: string | null
}

export interface FeedCommentRecord {
  id: number
  user_name?: string | null
  user_email?: string | null
  user_avatar?: string | null
  content: string
}
