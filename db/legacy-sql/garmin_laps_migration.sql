create table if not exists public.garmin_activity_laps (
  id serial primary key,
  activity_id integer not null references public.swimming_activities(id) on delete cascade,
  lap_index integer not null,
  distance_meters integer,
  duration_seconds double precision,
  moving_duration_seconds double precision,
  elapsed_duration_seconds double precision,
  average_speed_mps double precision,
  max_speed_mps double precision,
  average_moving_speed_mps double precision,
  average_swolf integer,
  average_strokes double precision,
  total_number_of_strokes integer,
  average_swim_cadence integer,
  calories integer,
  avg_heart_rate integer,
  max_heart_rate integer,
  number_of_active_lengths integer,
  stroke_type text,
  start_time_gmt timestamp without time zone,
  created_at timestamp without time zone not null default now()
);

create unique index if not exists garmin_activity_laps_activity_lap_idx
  on public.garmin_activity_laps(activity_id, lap_index);

create index if not exists garmin_activity_laps_activity_id_idx
  on public.garmin_activity_laps(activity_id);

create table if not exists public.garmin_activity_lengths (
  id serial primary key,
  activity_id integer not null references public.swimming_activities(id) on delete cascade,
  lap_id integer not null references public.garmin_activity_laps(id) on delete cascade,
  length_index integer not null,
  distance_meters integer,
  duration_seconds double precision,
  average_speed_mps double precision,
  max_speed_mps double precision,
  average_swolf integer,
  total_number_of_strokes integer,
  avg_heart_rate integer,
  max_heart_rate integer,
  stroke_type text,
  start_time_gmt timestamp without time zone,
  created_at timestamp without time zone not null default now()
);

create unique index if not exists garmin_activity_lengths_lap_length_idx
  on public.garmin_activity_lengths(lap_id, length_index);

create index if not exists garmin_activity_lengths_activity_id_idx
  on public.garmin_activity_lengths(activity_id);
