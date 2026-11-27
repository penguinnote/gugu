-- 주간 기록 — reports, weekly_records
--
-- 문서 04-schema.md §3.8·3.9, 03-metrics.md §6.1 기준.
-- weekly_records 가 이 제품의 중심 테이블이다. 기존 Attendance 와 CareNote 를 합친 것으로,
-- (양 × 주차) 한 행에 출석 세 축과 텍스트를 모두 담는다.

create type public.prayer_status as enum ('new', 'ongoing', 'answered');

-- ---------------------------------------------------------------------------
-- reports — 주간 보고서
-- ---------------------------------------------------------------------------

create table public.reports (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.groups (id) on delete cascade,

  -- 그 주 일요일 날짜. 주차를 가리키는 키다.
  week_key      date not null,

  -- null 이면 미제출. 제출 인정 조건을 통과해야 기록된다.
  submitted_at  timestamptz,
  submitted_by  uuid references public.users (id) on delete set null,

  -- 마감은 화요일 23:59. 그 이후 제출이면 true.
  is_late       boolean not null default false,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- 목장·주차당 보고서는 하나다.
  constraint reports_group_week_key unique (group_id, week_key),

  -- week_key 는 반드시 일요일이어야 한다. 주차 키가 어긋나면 제출률이 통째로 틀어진다.
  constraint reports_week_key_is_sunday_ck
    check (extract(dow from week_key) = 0),

  -- 미제출인데 제출자만 있는 상태를 막는다.
  constraint reports_submitted_pair_ck
    check ((submitted_at is null) = (submitted_by is null))
);

comment on table public.reports is
  '목장별 주간 보고서. (group_id, week_key) 유일. 제출 후에도 수정 가능하며 잠금은 없다.';
comment on column public.reports.week_key is
  '그 주 일요일 날짜. 일요일이 아니면 제약에 걸린다.';
comment on column public.reports.is_late is
  '화요일 23:59 마감 이후 제출 여부. 정시율 지표에 쓰인다.';

create trigger reports_set_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- weekly_records — 주간기록 ★
-- ---------------------------------------------------------------------------

create table public.weekly_records (
  id                      uuid primary key default gen_random_uuid(),

  report_id               uuid not null references public.reports (id) on delete cascade,
  member_id               uuid not null references public.members (id) on delete restrict,

  -- 누가 썼는가. 커버리지 지표(단독 연결·관계 밀도)의 기반이다.
  author_id               uuid not null references public.users (id) on delete restrict,

  -- reports.week_key 와 같은 값. 조회 편의를 위한 비정규화다.
  week_key                date not null,

  -- 작성 시점의 목장 스냅샷. 양이 나중에 옮겨도 당시 맥락을 잃지 않는다.
  -- 배치 이력 테이블을 없앨 수 있는 근거가 이 컬럼이다.
  -- 리더의 열람 권한도 이 값으로 판정한다(Step 2).
  group_id_at_write       uuid not null references public.groups (id) on delete restrict,

  -- 출석 세 축. 셋은 서로 독립이다.
  worship_attended        boolean not null default false,
  group_meeting_attended  boolean not null default false,
  -- 목장참석과 무관하다. 결석자도 1대1 접촉의 대상이다.
  one_on_one_contacted    boolean not null default false,

  prayer_request          text,
  prayer_status           public.prayer_status,

  -- 지난 기도제목 연결. 같은 제목이 몇 주째 ongoing 인지 추적한다.
  prev_record_id          uuid references public.weekly_records (id) on delete set null,

  note                    text,

  -- 작성자와 목사님만 열람한다. 같은 목장의 다른 리더에게는
  -- 존재 표시조차 하지 않는다(04-schema §4.3). 강제는 Step 2 의 RLS 가 한다.
  is_sensitive            boolean not null default false,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  -- 목장 전원에 대해 매주 한 행이 생성된다.
  constraint weekly_records_report_member_key unique (report_id, member_id),

  -- 자기 자신을 이전 기록으로 가리킬 수 없다.
  constraint weekly_records_prev_not_self_ck
    check (prev_record_id is null or prev_record_id <> id)
);

comment on table public.weekly_records is
  '주간기록. (양 × 주차) 한 행. 출석 세 축과 기도제목·특이사항을 함께 담는다.';
comment on column public.weekly_records.group_id_at_write is
  '작성 시점 목장. 리더의 열람 권한 판정 기준이자, 배치 이력 테이블을 대신하는 컬럼이다.';
comment on column public.weekly_records.one_on_one_contacted is
  '1대1 접촉 여부. 목장참석과 무관하며 접촉 공백·단독 연결·관계 밀도 지표의 기반이다.';
comment on column public.weekly_records.is_sensitive is
  '민감 표시. 작성자와 목사님만 열람한다.';

-- 인덱스 — 03-metrics.md §6.3, 04-schema.md §6
-- 규모가 작아 속도 때문이 아니라 권한 검사 경로를 단순하게 만들기 위한 것이다.
create index weekly_records_member_week_idx
  on public.weekly_records (member_id, week_key);          -- 사각지대·타임라인
create index weekly_records_group_week_idx
  on public.weekly_records (group_id_at_write, week_key);  -- 목장별 조회·권한
create index weekly_records_author_week_idx
  on public.weekly_records (author_id, week_key);          -- 참여 리더 비율
create index weekly_records_report_idx
  on public.weekly_records (report_id);                    -- 보고서 화면 로딩
create index weekly_records_prev_idx
  on public.weekly_records (prev_record_id)
  where prev_record_id is not null;                        -- 기도제목 이어보기

create trigger weekly_records_set_updated_at
  before update on public.weekly_records
  for each row execute function public.set_updated_at();
