# Ninetynine — 데이터 모델 및 권한 정책

> v0.51 · 2026-11-15
> PRD·IA·지표 정의서에 흩어진 엔티티를 한 곳에 모으고, **목장 격리를 어느 계층에서 강제할지**를 정한다. 스택 결정의 근거가 되는 문서.
>
> 실제 마이그레이션(`supabase/migrations/`)과 1:1로 맞춰져 있다. 문서와 스키마가 어긋나면 스키마가 맞다.
>
> v0.4 — 리더와 청년을 `persons` 하나로 합치고, 역할을 5단계로 늘리고, 초대를 신청·승인으로 바꿨다(§0).
> v0.5 (2026-09-27) — Step 4 보고서 작성. `submit_report` 쓰기 경로, `reports.note`, `skipped_weeks`, `report_presence`, 같은 목장 리더의 동일 열람 (A).
> v0.6 (2026-09-27) — 민감(is_sensitive) 개념 제거. 열람 범위 원칙 한 줄로 대체(§4.3).
> v0.28~v0.34 (2026-10-14 ~ 10-30, 문서 반영 2026-10-31) — 리더 내보내기 · 전체 명단 보기, 월드 함께 걷기 · 집 안 꾸미기 · 탭 배경 사진, 명단 엑셀 칸 · 섬김 부서 · 마을, 출석 v2 · 사각지대 기준 v2, 임원진(officer)과 시작 화면 역할 신청(§0).
> v0.35 (2026-11-07) — 목사님 주간 정리 v2(AI 정리): `pastor_digests` · `pastor_digest_feedback` · `persons.ai_excluded` · `digest_claim` · `digest_save`(§0, §3.12).
> v0.36 (2026-11-08) — AI 정리 허점 고치기: 만든 시각 · 보고서 수 · 다시 만들기(`digest_regen`), 틀린 내용, 소급 빼기 트리거, 운영 카드(`digest_health`)(§0, §3.12).
> v0.52 (2026-11-18) — **DB 는 바뀌지 않았다.** 화면만: 목장 요절 말씀 칸을 뺐다(`group_profiles.verse` 컬럼 · 저장된 값은 그대로 둔다 — 화면이 읽지도 쓰지도 않는다). 휴주 화면 · 저장은 앱에서 운영자만(`skipped_weeks` 정책은 목사님 · 임원진도 허용한 그대로). 화면 말: 돌봄 사각지대 → 챙김이 필요한 양, 컨택 → 개별 연락으로 교제(컬럼 · 함수 이름은 그대로).
> v0.51 (2026-11-15) — v0.49 고침: 보고서에서 숨긴 사람도 **돌봄 사각지대에 남는다**(`care_blind_spots` 에서 `not report_hidden` 을 뺌). 숨긴 동안은 주간기록이 없으므로, 숨긴 사람에 한해 목장이 보고서를 낸 최근 두 주에 기록이 없으면 결석으로 센다. 출석 빈칸 검사에서 빠지는 것은 그대로. 홈 '돌봄' 수 = 사각지대 ∪ 지난 예배 결석 · 온라인(`lib/care-contacts`, DB 변경 없음).
> v0.50 (2026-11-14) — 목장 요절 말씀 `group_profiles.verse`(200자). 목장 페이지 맨 위.
> v0.49 (2026-11-14) — 보고서 명단 편집: `persons.report_hidden` · `report_order`(그 목장 리더 · 목사님 · 운영자가 씀). 숨긴 사람은 보고서 화면 · 처음 제출의 출석 빈칸(`submit_report`) · 돌봄 사각지대(`care_blind_spots`)에서 빠진다. 상태는 그대로.
> v0.48 (2026-11-14) — 휴주(`skipped_weeks`) 쓰기를 운영자 · 목사님 · 임원진으로(`can_manage_weeks()`). 보고서의 '이번 주 목장 모임 없음' 단추는 뺐다(`reports.no_meeting` 칸은 남는다 — 예전 값).
> v0.47 (2026-11-13) — 내 AI 동의: `set_my_ai_consent(p_on)`(명단과 연결된 계정이 본인 행만, gg.staff_rpc 로 persons_staff_only 통과) · `my_ai_consent()`. 첫 접속 동의의 선택 항목 · 내 정보에서 부른다.
> v0.46 (2026-11-13) — AI 는 동의한 사람만(옵트인): `persons.ai_consented_at`(청년 동의서 ⑤ 동의일, 목사님 · 운영자만). `persons_ai_sync`(BEFORE) 가 `ai_excluded = (ai_consented_at is null)` 로 맞추고 `ai_excluded` 의 쓰기 권한은 거뒀다(기본값 true). 리더가 넣는 사람은 동의 전, 동의일을 실어 넣지 못한다. `persons_digest_forget` 는 `ai_consented_at` 이 바뀔 때도 돈다. 바꾸던 날 모두 동의 전 → 지난 AI 정리는 지워졌다.
> v0.45 (2026-11-13) — 첫 접속 동의: `users.terms_version` · `terms_agreed_at`, `agree_terms(p_version)`(본인 · 활성 계정만, 버전은 YYYY-MM-DD), `current_user_context` 에 `terms_version`. 앱은 `lib/terms.ts` 의 TERMS_VERSION 과 다르면 `/terms` 로 보낸다(내 정보 처리 동의 + 비밀 유지 약속). 기록되는 청년의 동의가 아니다(07).
> v0.44 (2026-11-12) — 계정 = 로그인이 붙은 `users` 행. 로그인 초기화가 남긴 옛 행(`auth_user_id` 없음, 지난 기록의 작성자)은 `admin_update_account` 가 어떤 동작도 받지 않고 계정 권한 화면에도 나오지 않는다 — 다시 로그인한 사람이 '잠긴 계정'에 한 번 더 보이던 것.
> v0.43 (2026-11-12) — 구구 챗봇 질문 횟수: `chat_quota_months` · `chat_quota_holds` · `chat_quota_requests`, 예약 → 확정/취소 함수, 추가 신청 · 운영자 처리(§0, §3.13, §7).
> v0.39 (2026-11-10) — 목사님 한마디: `report_reviews.note`(200자) · `note_at`, `set_report_note`(§0).
> v0.38 (2026-11-10) — 집 안 가구 22가지 더함(`world_items` 행만, §0).
> v0.37 (2026-11-08) — AI 정리는 요청할 때만, 마감 전에도: `digest_claim` 의 마감 검사를 이번 주까지로, `digest_health` 는 이번 주부터 4주(§0, §3.12).

---

## 0. 설계 변경 이력

### v0.43 (2026-11-12) — 구구 챗봇 질문 횟수

- 사용자 결정 — 리더는 구구 챗봇을 한 달 20번(사용자 말 한 번 = 1번, 도구를 여러 번 불러도 1번). 목사님은 세지 않는다. 한국 시간 매월 1일 0시에 새로, 남은 것 · 추가분은 넘기지 않는다. 다 쓰면 추가 신청 — 그달 첫 신청은 바로 +5, 두 번째부터 운영자가 +5 · +10 · +20 승인 또는 거절. 운영자 겸 리더는 자기 신청을 처리할 수 없다(운영자만 처리). 받아쓰기 · 흐름 요약 · 목사님 AI 정리는 세지 않는다. 마이그레이션 `20261112010000_chat_quota.sql`(§3.13).
- 세는 법은 **예약 → 확정 / 취소** — 답을 받았을 때만 세면서 동시에 보내도 한도를 넘지 않게. `tests/rls/chat-quota.test.mjs` 17건.

### v0.42 (2026-11-11) — 내 프로필 글(인스타처럼)

- 사용자 요청 — 내 정보를 인스타 프로필처럼(사진 · 숫자 칸 · 소개 · 말씀 · 관심사), '함께하는 사람' 이름을 누르면 그 사람 프로필(/profile/[id]). 마이그레이션 `20261111020000_user_profiles.sql`.
- `user_profiles(user_id pk, bio ≤150, verse ≤100, interests ≤5 · 각 12자)` — 표는 본인 행만.
- `set_my_profile(bio, verse, interests)` — 본인 칸만, 빈 글은 null, 관심사 공백 · 겹침 걷기. `person_profile(id)` — 명단 사람 단위 글 · 사진 시각 · 계정 여부, 승인된 앱 사용자 누구나.
- `tests/rls/user-profiles.test.mjs` 4건.

### v0.41 (2026-11-11) — 프로필 사진

- 사용자 요청 — 각자 '내 정보' 에서 자기 사진을 정하고, 목장 프로필 '함께하는 사람' 동그라미에 들어간다. 마이그레이션 `20261111010000_profile_photos.sql`.
- `profile_photos(user_id pk, image bytea 200B~300KB, updated_at)` — 계정마다 한 장(WebP · JPEG). 표는 본인 행만 읽힌다.
- `set_profile_photo(base64)` · `clear_profile_photo()` — 승인된 앱 사용자 본인 칸만. 형식은 첫 바이트(RIFF…WEBP · FF D8 FF)로 본다.
- `person_photos(ids)` · `person_photo(id)` — 명단 사람 단위로, 승인된 앱 사용자 누구나(목장 프로필은 앱 사용자 모두가 본다). 계정 없는 청년은 사진이 없다(화면은 이름 둘째 글자).
- `tests/rls/profile-photos.test.mjs` 4건.

### v0.40 (2026-11-10) — '기록' 탭: 모든 목장의 연속 · 열매

- 사용자 결정 — 정보 탭을 빼고 '기록' 탭. 목장 간 공개(01 §8 표의 '공개 범위 분리' 를 바꿨다). 마이그레이션 `20261110030000_group_board.sql`.
- `group_board(p_week_key, p_now)` — 앱 사용자 누구나(미승인 · 익명 42501). 활동 중인 목장(특별 자리 빼고)마다 `group_id · number · name · streak · berries`, 번호 순. 숫자 두 개 말고는 주지 않는다. 화면은 연속이 긴 순 → 열매 많은 순 → 번호 순으로 늘어놓는다(2026-11-11 사용자 요청).
- `_group_streak(group, week, now)` — group_streaks 의 한 목장 셈(같은 규칙). 내부용. `group_streaks` 는 그대로(리더는 자기 목장만).
- `tests/rls/group-board.test.mjs` 5건 — 리더도 12목장 · 목사님 group_streaks 와 같은 값 · 열매 = 장부 합계 · 미승인/익명 막힘 · 내부 셈 직접 호출 막힘.

### v0.39 (2026-11-10) — 목사님 한마디

마이그레이션 `20261110020000_review_note.sql`. 확인(자동) · '기도하겠습니다' 도장에 더해, 목사님이 원할 때만 리더에게 짧은 한마디를 남긴다(선택 — Step 5 의 "반응은 비용이 거의 0" 원칙은 그대로).

- **`report_reviews.note`** text(1~200자, 없으면 null) · **`note_at`** timestamptz(마지막으로 쓰거나 지운 시각).
- **`set_report_note(p_report_id, p_note) → text`** — 목사님만(42501), 제출된 보고서만(22023), 앞뒤 칸을 다듬고 빈 글이면 지운다, 200자 넘으면 22023. 읽음 행이 없으면 만든다. 돌려주는 값 = 지금 한마디.
- 읽기 정책은 그대로 — 목사님 · 그 목장 리더만, 운영자는 0행. 보고서와 함께 지워진다(cascade).
- 알림: 처음 남길 때 그 목장 리더에게 한 번(`noted:<report>`), 잠금 화면 문구에 한마디 글은 싣지 않는다.

### v0.38 (2026-11-10) — 집 안 가구 더하기

마이그레이션 `20261110010000_more_furniture.sql`. 스키마는 그대로, `world_items` 에 가구 22가지(바닥 18 · 벽 4)를 넣었다 — 모두 KayKit Furniture Bits(CC0)의 다른 색 · 모양. 값은 처음 제안에서 모두 10씩 내렸다(가장 싼 것 5). 가구는 모두 42가지(바닥 35 · 벽 7). 월드는 DB 에 있는 가구만 상점 · 꾸미기에 내놓는다.

### v0.37 (2026-11-08) — AI 정리는 요청할 때만

마이그레이션 `20261108020000_digest_on_request.sql`. 화면은 목사님이 그 주를 열 때 저절로 만들던 것을 'AI 정리 만들기' 단추로 바꿨다.

- **`digest_claim`** — "마감(그 주 수요일 0시 KST)이 지난 주만" 을 "이번 주까지"(`p_week <= kst_current_week()`)로 풀었다. 제출된 보고서가 있어야 하는 것은 그대로.
- **`digest_health()`** — 마감 지난 주만 보던 것을 이번 주부터 4주로(마감 전에 만든 이번 주 정리도 보이게).

### v0.36 (2026-11-08) — AI 정리 허점 고치기

마이그레이션 `20261108010000_digest_hardening.sql`. §3.12 에 반영.

- **`pastor_digests`** 에 `generated_at` · `report_count` · `group_count` · `regen_count`(0~3).
- **`digest_claim`** — 제출된 보고서가 없는 주는 false(줄을 넣지 않는다 — 빈 정리 없음). 멈춘 줄을 다시 차지해도 내용은 지우지 않는다.
- **`digest_regen(date)`** 새로 — 목사님만. 앞 정리가 있고, 만든 뒤 새로 내거나 고친 제출 보고서가 있고(`reports.updated_at > generated_at`), 3번 안일 때 pending 으로. 만드는 중(5분 안)이면 false.
- **`digest_save`** 에 `p_report_count` · `p_group_count`(인자가 늘어 지우고 다시 만듦). 다시 만들기 성공이면 그 주 피드백을 지운다. 다시 만들다 실패하면 앞의 정리로 `ready` 에 되돌리고 `fail_reason` 만 남긴다.
- **`pastor_digest_feedback.wrong`** 새로 · `helpful` 은 null 가능 — 틀린 내용 신고.
- **트리거 `persons_digest_forget`** — `ai_excluded` 가 켜지거나 `opted_out` 이 되면, 그 사람의 글(기도제목 · 사유 · 메모)이 있는 주 또는 정리에 그 사람 id 가 나오는 주의 정리를 지운다(피드백 cascade).
- **`digest_health()`** 새로 — 운영자만. 최근 4주(마감 지난 주): 휴주 · 상태 · 실패 까닭 · 버린 수 · 보고서 수 · 목장 수 · 만든 때 · 다시 만든 횟수. 정리 내용은 돌려주지 않는다. `rpc-classes.json` readOnly(`digest_regen` 은 write).
- `tests/rls/digest-hardening.test.mjs` 18건.

### v0.35 (2026-11-07) — 목사님 주간 정리 v2 · AI 정리

마이그레이션 `20261107010000_digest_ai.sql`. 자세한 것은 §3.12, 제품 쪽은 01 §9.

- **`persons.ai_excluded`** boolean, 기본 false — AI 정리에 보내지 않는 사람(본인 요청, 07 §0 공지의 'AI 요약에서 빼기'). 컬럼 update 권한은 `authenticated` 에 주고, 트리거 `persons_staff_only` 가 **목사님 · 운영자만** 바꾸게 한다(리더는 42501). 화면은 운영자의 사람 화면(`/admin/people/[id]`).
- **`pastor_digests`** — 주마다 한 줄. **목사님만 읽는다**(`is_pastor()` — 운영자 · 리더 · 임원진은 0행). 쓰기 정책은 없고 함수 둘만 쓴다.
- **`pastor_digest_feedback`** — 항목마다 도움 됨 / 아님. 목사님 본인 것만 읽고 쓴다.
- **`digest_claim(date)` · `digest_save(...)`** — security definer, 목사님만. 마감이 지난 주(일요일 시작)만, 한 번만 만든다.
- **`purge_expired_records()`** 가 `pastor_digests` 도 24개월 기준으로 지운다(§7). 피드백은 cascade.
- `rpc-classes.json` 에서 둘 다 write — 미리보기 쓰기 막기가 막는다.
- `tests/rls/digest-ai.test.mjs` 10건.

### v0.34 (2026-10-30) — 임원진 · 시작 화면에서 역할 고르기

마이그레이션 `20261030020000_officer_role.sql` · `20261030030000_role_requests.sql`. enum 값을 더한 트랜잭션 안에서는 그 값을 쓸 수 없어 두 파일로 나눴다.

- **`user_role` 에 `officer`(임원진)** — 목장 리더가 **아닌** 임원진의 역할. 리더이면서 임원진이면 역할은 `leader` 그대로 두고 **`users.is_officer`** 만 켠다(리더 기능 — 알림 · 열매 · 보고서가 그대로 돈다). `is_officer` 는 본인이 고칠 수 없다(users 의 update 권한은 name 뿐) — 승인 함수만 켠다.
- **`is_officer()`** 헬퍼(승인된 계정의 is_officer). **`is_app_user()`** 가 `officer` 도 승인된 사용자로 센다 — 그래서 임원진은 전체 명단(`persons_public` · `roster_people()` · `needs_check_people()`), 목장 프로필, 섬김 부서 목록, 휴주, 로뎀 월드(구경 · 생김새)를 본다.
- **임원진이 할 수 있는 것** — `persons` 원본 읽기(전체, `persons_select` 에 `is_officer()` 추가 — 전체 명단 엑셀이 이 경로로 읽는다. `person_ministries` 는 persons 를 따라간다), 전체 명단 엑셀(`log_roster_export(null)`). **보고서 · 기도제목은 볼 수 없다** — `weekly_records_visible` 은 목사님 · 그 목장 리더뿐, 바꾸지 않았다. 명단을 고치는 권한도 없다(리더면 자기 목장만, 지금처럼). 목장 리더가 아닌 임원진은 열매를 쓰거나 마을을 꾸미지 않는다(`_world_my_group` 은 role leader·admin).
- **신청은 `applications` 한 표에** — `requested_role user_role not null default 'leader'`, `person_id` · `group_id` 는 nullable. 제약 `applications_role_ck`: leader = 이름 · 목장 필수 · pastor = 둘 다 없음 · officer = 둘이 함께 있거나 함께 없음. 2026-10-30 전 신청은 전부 leader.
- **`request_role(p_role, p_person_id default null)`** — 목사님 · 임원진 신청(리더 신청은 `apply_for_person` 그대로). pending 계정만(아니면 23505), pastor · officer 만(22023), 목사님은 이름 없이. 임원진이 리더도 맡고 있으면 명단상 리더 · 활동 · 아직 연결 안 된 이름을 같이 건다. 대기 신청은 한 건.
- **`approve_application`** (운영자만) — 신청한 역할대로: pastor → `pastor` · 이름 없는 officer → `officer` · 그 밖(리더, 이름 건 임원진) → `leader` + 이름 연결. officer 신청이면 `is_officer = true`. 같은 사람을 노린 다른 대기 건은 자동 거절(이름이 있을 때).
- **`list_pending_applications()`** 에 `requested_role` · `provider`(로그인 방법) — 이름 없는 신청(목사님 · 리더 아닌 임원진)도 나온다(left join). 운영자만. **`current_user_context()`** 에 `pending_role` · `is_officer`.
- `tests/rls/role-requests.test.mjs` 10건.

### v0.33 (2026-10-30) — 출석 분류 v2 · 돌봄 사각지대 기준 v2

마이그레이션 `20261030010000_attendance_v2.sql`.

- **출석 네 칩** — 예배출석 · 목장참석 두 축은 그대로 두고 `weekly_records.worship_online` 한 칸을 더했다.

  | 화면 | worship_attended | worship_online | group_meeting_attended |
  |---|---|---|---|
  | 현장 예배 | O | X | O |
  | 현장 예배 + 목장 모임 불참 (예전 '예배만') | O | X | X |
  | 온라인 예배 | O | O | X |
  | 결석 | X | X | X |

  온라인 예배는 목장 모임 불참을 겸한다 — 제약 **`weekly_records_online_ck`**: `not worship_online or (worship_attended and not group_meeting_attended)`. 예전 기록은 온라인 X 로 그대로 표에 들어가 옮길 데이터가 없다.
- **사유 세 칸** — `online_reason` · `meeting_absent_reason` · `absent_reason`(text, 빈칸은 null). 목사님께 드리는 것이라 읽기 범위는 기도제목과 같다 — 원본 select 권한에 넣지 않고 `weekly_records_visible` 끝에 네 칸을 붙였다(같은 목장 리더 · 목사님).
- **`submit_report`** 허용 필드에 네 칸. 옛 화면은 새 칸을 보내지 않아 기본값(온라인 X, 사유 없음)으로 지금처럼 저장된다.
- **`care_blind_spots` v2** — 사각지대 = **결석 연속 ∪ 목장 공백**.
  - `absent_streak` — 창의 최근 두 주(휴주 제외) 모두 결석(예배 X) 기록. 1대1 접촉이 있었어도 사각지대다.
  - `meeting_gap` — 창 4주 동안 목장 모임 참석 0회. 온라인 예배도 불참으로 센다. 접촉 · 예배와 무관.
  - `contact_gap` 은 값만 남긴다 — **이제 사각지대 기준이 아니다.**
  - 반환에 `absent_streak` · `last_worship_week` 가 붙어 함수를 지우고 다시 만들었다. 창(`care_window`) · 범위(목사님 전체 · 리더 자기 목장) · `collecting`/`new` 는 그대로.
- `tests/rls/report.test.mjs` 22건(출석 v2 두 건 포함) · `tests/rls/blind-spots.test.mjs` 25건.

### v0.32 (2026-10-28 ~ 10-29) — 명단의 나머지 칸 · 섬김 부서 · 명단 엑셀

마이그레이션 `20261028010000_roster_details.sql` · `20261028020000_roster_group_export.sql` · `20261029010000_pastor_add_member.sql`. 목표는 교회 명단 엑셀을 앱에서 고치고, 내보내면 같은 모양의 최신 엑셀이 나오는 것. 실명은 마이그레이션에 없다 — 기존 값은 `npm run roster:details` 가 원본 엑셀에서 옮긴다.

- **`groups.village`** — 마을(엑셀 A열). 1~20자 · 앞뒤 공백 없음(`groups_village_ck`). `set_group_village(group_id, village)` — 그 목장 리더 · 목사님 · 운영자(42501), 운영 중인 목장만(22023), 빈 값은 null. v0.8 의 "마을은 넣지 않는다" 를 뒤집었다.
- **`persons` 의 나머지 칸** — `occupation` 직업(30자) · `affiliation` 소속(40자) · `youth_member` 청년대학부 회원 · `assembly_member` 공동의회 회원(boolean, 기본 false) · `note` 비고(200자). 길이 제약은 모두 1~N자 · 앞뒤 공백 없음. `training_stage` 에도 20자 제약. v0.8 · v0.12 의 "직업·소속·비고 · 회원 개념을 넣지 않는다" 를 뒤집었다 — 회원 칸은 이제 저장하지만 `needs_check` 와는 별개다.
- **컬럼 권한** — `training_stage · birth_year · occupation · affiliation · youth_member · assembly_member · note` 의 update 를 authenticated 에 열었다. 행은 기존 `persons_update`(자기 목장 리더 · 목사님 · 운영자)가 거른다 — 다른 목장으로 옮기지는 못한다.
- **섬김 부서** — `ministries`(부서 목록 13개, `sort` 는 엑셀 오른쪽 표 순서) · `person_ministries(person_id, ministry_id)`(한 사람이 여러 부서). `ministries` 읽기 = 앱 사용자. `person_ministries` 읽기 = 그 사람을 볼 수 있는 사람(정책 안의 persons 조회에 persons RLS 가 그대로 걸린다), 넣기 · 빼기 = 그 사람 목장 리더 · 목사님 · 운영자. anon 전부 회수.
- **새 양 넣기** — `persons_insert` 가 운영자 외에 **그 목장 리더**(10-28)와 **목사님**(10-29, 어느 목장이든)에게도 열렸다. 단 양(`member`) · 계정 없음 · 활동 · 목장장 아님 꼴로만. 리더 · 목장장 · 계정 연결은 지금처럼 운영자. **2026-11-26** — 목사님은 리더(`leader`)로도 넣는다(어느 목장이든, 계정 없음 · 활동 · 목장장 아님은 그대로). 양 → 리더 올리기는 `persons_staff_only` 트리거가 목사님 · 운영자만 허용한다(리더 → 양 내리기와 같은 규칙). 목장을 떠나면 `status = 'left'`.
- **명단 엑셀 로그** — `export_format` 에 `roster`. `log_roster_export(p_group_id default null)`: null = 전체 명단(목사님 · 운영자, v0.34 부터 임원진도) · 목장 하나 = 그 목장 리더 · 목사님 · 운영자, 운영 중인 목장만(22023). `range_start/end` 는 null, `group_ids` 에 그 목장이 남는다. 로그가 먼저다 — 성공해야 파일이 나간다. 읽기는 원래 RLS 그대로(리더는 자기 목장 사람 · 부서만).
- `tests/rls/roster-details.test.mjs` 17건 · `tests/rls/people-register.test.mjs` 14건.

### v0.31 (2026-10-24 ~ 10-25) — 목장 탭 · 정보 탭 배경 사진

마이그레이션 `20261024010000_world_room_shots.sql` · `20261025010000_world_avatar_shots.sql`. 월드가 한 장(1290×1092 WebP)을 찍어 넘기면 앱 껍데기가 서버 액션으로 저장한다.

| 테이블 | 한 행 | 쓰기 | 읽기 |
|---|---|---|---|
| `world_room_shots(group_id, image bytea, updated_at, updated_by)` | 목장 하나 — 우리 목장 집 안 사진. 리더가 집 안 배치를 저장할 때마다, 사진이 없는 목장 리더가 월드에 들어왔을 때 새로 찍는다 | `world_set_room_shot(p_image)` — 목장 리더만(`_world_my_group`) | 앱 사용자 — 목장 탭이 `/api/room-shot/<목장 id>` 로 받는다 |
| `world_avatar_shots(user_id, image bytea, updated_at)` | 사람 하나 — 내 아바타가 풀밭에 선 사진. 생김새를 저장할 때마다, 사진이 없는 사람이 월드에 들어왔을 때 | `world_set_avatar_shot(p_image)` — 승인된 앱 사용자 본인 칸 | 본인 것만(정보 탭은 내 것만 그린다) |

- 두 함수 모두 base64 를 받아 **WebP 만**(`RIFF····WEBP` 머리 검사), **1KB~600KB**(테이블 제약도 같다) — 아니면 22023. 저장 시각을 돌려준다. 표 직접 쓰기 권한은 없다.
- `tests/rls/world-room-shots.test.mjs` 5건 · `tests/rls/world-avatar-shots.test.mjs` 3건.

### v0.30 (2026-10-16) — 로뎀 월드 집 안 꾸미기

마이그레이션 `20261016010000_world_rooms.sql`.

- **가구** — 분류 `furniture`, `world_items.slot` 은 놓는 곳 `floor` · `wall`(제약 `world_items_slot_check`: wear 는 hat·face·neck·back·hand, furniture 는 floor·wall, 다른 분류는 null). 새 물건 20가지(바닥 17 · 벽 3, 10~70 열매). 모델은 CC0. `world_buy` 그대로 — 가구는 여러 개 살 수 있다.
- **`world_villages.rooms`** jsonb(객체) — 마을 자리 번호(0~6, 그 자리에 집이 있을 때) → 집 안 열 칸 배열(바닥 1~8 · 벽 9~10, 빈 칸 null). 집이 여럿이면 집마다 따로.
- **`world_set_room(p_house, p_slots[10])`** — 목장 리더만. 그 자리에 집이 있어야 하고, 칸마다 맞는 가구(바닥 · 벽)여야 하고, **그 마을 모든 집 안을 합쳐** 가진 수만큼. 목장 단위 잠금.
- **`world_set_village`** — 마을 자리에는 house · nature · prop 만(가구 · 소품 · 쿠폰 거부). 집이 없어진 자리의 방은 지운다(가구는 다시 놓을 수 있게).
- **`world_state()`** — 마을마다 `rooms` 를 함께 준다(모든 앱 사용자 — 다른 목장 집도 들어가 구경한다).
- `tests/rls/world-rooms.test.mjs` 10건.

### v0.29 (2026-10-14 ~ 10-15) — 로뎀 월드 함께 걷기 1단계 · 울타리 설명

마이그레이션 `20261014030000_world_live.sql` · `20261015010000_fence_blurb.sql`.

- **실시간 채널 `world:lobby`** — Supabase Realtime 사설 채널 하나. presence(누가 있나 + 생김새 · 목장 자리, 들어올 때와 생김새가 바뀔 때만) · broadcast(자리 · 방향 · 동작, 움직이는 동안 1초에 네 번 남짓). **DB 에 아무것도 저장하지 않는다.**
- 정책 `world_lobby_read`(select) · `world_lobby_write`(insert) on `realtime.messages` — 앱 사용자만, 주제 `world:lobby` 만, extension broadcast · presence 만. 미승인 · 로그인 안 한 사람은 못 들어온다(사설 채널이라 공개 키만으로는 안 된다). realtime 스키마가 없는 PGlite 시험 DB 에서는 건너뛴다.
- 화면 말을 '마을' → '목장' 으로 바꾸며(10-14) DB 에 남은 나무 울타리 `blurb` 하나를 고쳤다.

### v0.28 (2026-10-14) — 리더 내보내기 · 리더도 보는 전체 명단

마이그레이션 `20261014010000_leader_export_needs_check.sql` · `20261014020000_roster_people.sql`.

- **`log_export`** — 리더도 남긴다. 단 **자기 목장 하나만**(`group_ids` 가 정확히 [자기 목장]). 전체(null) · 다른 목장 · 여러 목장은 42501. 목사님은 그대로. 읽기는 원래 RLS(리더는 `weekly_records_visible` · `reports` 에서 자기 목장만), 로그를 보는 사람도 그대로다.
- **`needs_check_people()`** — '확인 필요' 로 표시된 활동 중인 사람을 **전체 목장에서**. persons RLS 가 리더에게 자기 목장만 보이므로 이 목록만 definer 함수로 연다. 이름 · 목장 · 리더/양뿐 — 연락처 · 생년 · 기록 없음. 앱 사용자만(42501), 보기만(표시를 지우는 것은 지금처럼 운영자).
- **`roster_people()`** — 운영자의 명단 화면(A-1)과 같은 꼴을 리더 · 목사님도 본다(사용자 결정). 운영 중인 목장의 사람(떠난 사람 포함 — 화면이 줄을 그어 보인다): id · 이름 · 목장 · 역할 · 목장장 · 상태 · 태그 · 확인 필요 · 계정 있음(참/거짓). 연락처 · 생년 · 계정 id · 기록은 없다. 고치는 길은 그대로.
- `tests/rls/export.test.mjs` 18건 · `tests/rls/needs-check.test.mjs` 8건.

### v0.27 (2026-10-11) — 열매 규칙 '추천안 — 천천히' (World 8)

마이그레이션 `20261011060000_world_rules_slower.sql`. 열매 계산기(26주 학기 · 휴주 2주 · 정시 100/75/45% 세 목장을 500번씩)로 정했다.

- `world_rules` 값: 정시 30 → **20** · 지각 10 → **5** · 연속 보너스 한 칸 5 → **4** · 최대 25 → **12**. 시작 60 · 쿠폰 80 · 학기당 2번 · 보유 2장 · 물건 값은 그대로.
- 결과: 매주 정시 목장 한 학기 ≈ 800(지금 값이면 ≈ 1,300 — 25주 만에 상점 전부 1,297 을 산다), 보통 목장 4주에 ≈ 70(소품 평균 39), 쿠폰 = 연속 최대 주의 2.5주치.
- 이미 적힌 원장은 그대로, 다음 제출부터 새 값.
- `world_state()` 에 `rules`(규칙 표 전체) — 월드의 안내 글("마감 안 +20 · …")이 이 숫자를 쓴다. 값을 바꾸면 글도 따라 바뀐다.

### v0.26 (2026-10-11) — 꾸민 모습이 서로 보이게 (World 7)

마이그레이션 `20261011050000_world_people.sql`. `world_state()` 에 `people` — 다른 사람들의 생김새를 월드를 열 때 한 번 준다(실시간 아님).

- **누가** — `world_avatars` 가 있는 사람 중 명단상 활동 중 목장 리더(활동 목장, 그 목장 id) · 목사님(group_id null → 교회 앞). 부르는 사람 자신은 뺀다. 운영자(명단 밖) · 미승인 · 휴면은 없다.
- **몇 명** — 목장마다 `updated_at` 최근 순 세 사람, 목사님 한 사람.
- **무엇** — 목장 id 와 look 만. 이름 · 사용자 id 는 주지 않는다. 앱 껍데기는 목장 id 를 마을 자리 번호로 바꿔 넘긴다(목사님 -1).
- `world_avatars` 테이블 RLS 는 그대로(본인만). 범위를 넓힌 것은 이 함수뿐이다.

### v0.25 (2026-10-11) — 상점 넓히기 · 캐릭터 꾸미기 소품 (World 6)

마이그레이션 `20261011040000_world_wardrobe.sql`.

- **물건 표에 두 열** — `world_items.slot`(꾸미기 소품이 입는 자리: hat · face · neck · back · hand, 다른 물건은 null — 제약으로 묶음) · `blurb`(상점 카드 설명 한 줄). 분류에 `wear` 추가. `world_state()` 가 물건마다 slot · blurb 를 준다.
- **새 물건 19가지** — 마을: 우체통 12 · 소풍 탁자 28 · 흔들 목마 30 · 시소 40 · 모래놀이터 45 · 그네 55 · 미끄럼틀 65(놀이·소품), 작은 새 10(나무·꽃). 소품: 밀짚모자 40 · 리본 머리띠 30 · 털모자 35 · 꽃관 45(모자) · 동그란 안경 30 · 선글라스 40(얼굴) · 목도리 30 · 나비넥타이 25(목) · 배낭 45 · 날개 70(등) · 풍선 35(손). 값은 표에서 고친다.
- **목장 옷장** — 소품도 목장 것(`world_inventory`). 한 번만 산다(`world_buy`: "이미 가진 꾸미기입니다."). 그 목장 리더 모두가 입는다.
- **입기 검사** — `world_save_look` 이 hat · face · neck · back · hand 값을 본다: 'none' 이거나, 그 자리 소품이고 내 목장이 가진 것. 아니면 "아직 우리 목장 옷장에 없는 꾸미기입니다". 목사님·운영자는 소품 없이(맡은 목장이 없어 살 수 없다).
- 마을 자리에는 집 · 나무·꽃 · 놀이·소품만(`world_set_village` 그대로 — wear 는 거부). `world_summary()` 에 `coupon_max`(쿠폰 보유 한도).

### v0.24 (2026-10-11) — 연속 지키기 쿠폰 · 열매 규칙 표 (World 5)

05 §3.2 의 streak freeze. 마이그레이션 `20261011030000_world_freeze.sql`.

- **열매 규칙 표** `world_rules(key, value, note)` — 시작 60 · 정시 30 · 지각 10 · 연속 보너스 5×(n−1) 최대 25 · 쿠폰 학기당 2 · 쿠폰 보유 2. `_world_ensure` · 제출 트리거가 이 표에서 읽는다. 숫자를 바꿀 때는 값만 고친다(`update public.world_rules set value = … where key = …`) — 다음 적립부터 바뀌고 지난 원장은 그대로. 앱 사용자는 읽기만.
- **쿠폰** `world_items('freeze', '연속 지키기 쿠폰', cat 'ticket', 80)` — 분류 제약에 ticket 추가. `world_buy` 는 보유 한도(freeze_hold_max)를 보고, `world_set_village` 는 집·나무·소품만 놓는다.
- **지킨 주** `world_streak_freezes(group_id, week_key, used_by, used_at)` — 그 목장 리더·목사님·운영자만 읽는다. `group_streaks` · `_world_streak` 가 휴주처럼 건너뛴다(그 목장만). 소급 적립은 없다 — 지킨 다음 주를 정시에 내면 보너스가 이어진다.
- **언제 쓰나** — 놓친 주(마감이 지났는데 정시 제출이 없음 · 휴주 아님 · 아직 안 지킴)를 그 다음 주 마감 전까지. 그래서 지킬 수 있는 주는 언제나 많아야 하나(수요일 0시 KST 부터는 이번 주, 그 전은 지난주). 그 전까지 연속이 0주면 못 쓴다(열매만 버리게 된다). 학기(3~8월 / 9~2월, 지킨 주의 날짜 기준)마다 목장당 2번.
- **함수** — `world_use_freeze(p_week, p_buy)` 쓰기: 쿠폰 1장을 쓰고, 없고 p_buy 면 같은 거래에서 산다(사기만 되고 쓰기가 실패하는 일 없음). 판정은 안쪽 `_world_freeze(group, user, week, buy, now)` 가 하고 테스트는 시각을 넣어 부른다. `world_summary()` stable 읽기 — 홈용: 열매 · 쿠폰 수 · 값 · 지금 지킬 수 있는 주 · 지키면 이어지는 주 수 · 이번 학기 쓴 수/한도. rpc 분류표: world_summary readOnly, world_use_freeze write.

### v0.23 (2026-10-11) — 로뎀 월드 열매·상점·마을 꾸미기·아바타 (World 4)

01 PRD §8 · 05 §3.1 의 Phase 3 보상을 로뎀 월드의 마을로 연다. 마이그레이션 `20261011010000_world_economy.sql` · `20261011020000_world_state_readonly.sql`, 원격 적용 완료.

- **단위는 목장** — 열매(`world_ledger`, 잔액은 합계)·가진 물건(`world_inventory`)은 목장 것. 그 목장 리더 · 목사님 · 운영자만 읽는다. 목장 간 순위는 없다(group_streaks 와 같은 원칙).
- **꾸민 마을은 공개** — `world_villages`(울타리 + 자리 7칸) 는 앱 사용자 모두가 읽는다. 꾸민 것이 남에게 보여야 보상이 된다(05 §3.1).
- **적립은 트리거** — `reports` 의 첫 제출(insert/update of submitted_at)에 `_world_on_report_submitted`: 마감 안 +30 · 마감 후 +10 · 마감 안이고 정시 연속 n주째면 +5×(n−1)(최대 +25). 한 목장·한 주에 한 번(유일 인덱스). 연속 셈은 `_world_streak`(group_streaks 와 같은 규칙, 한 목장만 — group_streaks 는 부르는 사람에 따라 걸러 트리거에 못 쓴다). 소급 적립 없음.
- **시작 상태** — 목장마다 60 열매 + 집 1(번호 순 네 가지) + 나무 1 + 나무 울타리, 마을엔 집과 나무(`_world_ensure`). 지금 목장 12곳은 마이그레이션이, 새 목장은 `groups` insert 트리거가 채운다.
- **쓰기는 함수로만** — 표에는 select 권한만. `world_buy(item)`(목장 단위 잠금 · 잔액 검사 · 울타리는 한 번) · `world_set_village(fence, slots[7])`(가진 수만큼 · 울타리는 가진 것) · `world_save_look(look)`(본인, 1KB 이하 객체). 리더는 명단 기준(`_world_my_group`), 목사님·운영자는 맡은 목장이 없어 사고 꾸미지 않는다. `world_state()` 는 stable 읽기(물건 · 모든 마을 · 내 목장 · 내 생김새) — rpc 분류표 readOnly.
- `world_avatars` 는 지금 본인만 읽는다. 함께 걷기(실시간)를 만들 때 넓힌다.
- `tests/rls/world.test.mjs` 18건.

### v0.22 (2026-10-06) — 사람 이름 규칙 (Step 11)

- **`persons_unique_name_in_group`** — `(group_id, name) where status <> 'left'` 유일. 같은 목장 동명이인은 출생년도가 달라도 거부한다(명단 도입 규칙을 DB 가 이어받음, 2026-10-06 결정). 이탈한 사람과 같은 이름은 다시 등록할 수 있다. 등록과 9b 의 목장 이동 둘 다 걸린다 — 화면은 제약 이름으로 문구를 가른다(`explainDbError`).
- **`persons_name_ck`** — 앞뒤 공백 없이 1~20자. 2026-10-06 원격: 같은 목장 중복 0, 공백 0, 최장 10자.
- 등록은 기존 `persons_insert`(운영자) 정책 그대로 — 새 함수 없음.
- `tests/rls/people-register.test.mjs` 11건.

### v0.21 (2026-10-06) — 내보내기 로그 (Step 10)

- **`log_export(format, start, end, group_ids)`** — 목사님만(42501). 범위 검증(22023): 시작·끝은 주차(일요일), 시작 ≤ 끝, 최대 52주, `group_ids` 는 null(전체 목장을 명시적으로 고름) 또는 운영 중인 목장 1개 이상. 로그 id 를 돌려준다 — Excel·인쇄 경로는 이것이 성공해야 내보낸다.
- **`export_logs` 직접 쓰기 닫음** — `export_logs_insert` 정책을 지우고 insert 권한을 거뒀다. 전에는 아무 로그인 사용자나 자기 이름으로 행을 넣을 수 있었다. 읽기(목사님·운영자)는 그대로, 고치기·지우기는 원래 없다(영구 보존).
- `demo:clear` 가 `export_logs` 를 비우던 것을 뺐다 — 영구 보존 대상이다.
- `tests/rls/export.test.mjs` 15건.

### v0.20 (2026-10-06) — 2년 보관 자동 정리 (Step 9c)

- **`retention_cutoff()`** — 기준 주차 하나: 오늘(KST)로부터 `retention_months` 전 날짜가 속한 주의 **일요일**. 그 주차부터 남고 그 전이 만료. `records_past_retention()` 도 이 기준으로 바꿨다 — 전에는 일요일이 아닌 날짜(2024-10-04 같은)를 썼다. 기준이 최대 6일 앞당겨져 덜 지우는 쪽이다.
- **`purge_expired_records()`** — 만료 주차의 `weekly_records`·`reports` 삭제. 딸린 `report_reviews`·`report_presence`·`comments` 는 cascade, `events`·`export_logs` 의 보고서 참조는 null(행동 로그는 본문이 아니다). 지운 수와 시각을 `app_meta.retention_last_run`·`retention_last_deleted` 에 남긴다. **앱 사용자는 실행하지 못한다**(운영자도 — 실행 권한 회수 + 세션이면 42501).
- **pg_cron** `purge-expired-records` — `0 18 1 * *` (매월 2일 03:00 KST). 확장이 없는 곳(PGlite 테스트)에서는 마이그레이션이 건너뛴다. 2026-10-06 원격 등록 확인, 한 번 수동 실행(0건).
- `tests/rls/retention.test.mjs` 9건 · `tests/rls/preview-guard.test.mjs` 2건(앱의 읽기용 rpc 가 DB 에서 stable/immutable 인지 — 프리뷰 쓰기 차단이 뚫리지 않게).

### v0.19 (2026-10-06) — 명단 관리 9b

이동·역할·목장장·상태는 Step 2~4 의 컬럼 권한과 `persons_update` 정책으로 이미 됐다. 이번에 연 것:

- **`care_status` 컬럼 권한** — 열되 **운영자만** 바꾼다(트리거 `persons_care_status_admin_only`, 아니면 42501). 09 §1.5a "운영자가". 세션 없는 쓰기(시드·스크립트)는 예외.
- **`needs_check` 컬럼 권한** — 리더도 내린다(v0.12 "리더가 내린다"). 행 범위는 정책이 정한다 — 다른 목장은 0행.
- **목장장은 목장당 한 명** — 부분 유일 인덱스 `persons_one_head_per_group (group_id) where is_group_head and status <> 'left'`. 명단에는 목장장 정보가 없어 지금 0명이고 운영자가 화면에서 지정한다. 둘째를 올리면 23505 — 화면은 먼저 내리고 올린다.
- 기록 제외는 `set_person_recording` 로만(기존). 계정 있는 리더 → 청년은 23514(기존 트리거).
- `tests/rls/people-admin.test.mjs` 9건.

> 알려진 것 — 서버 Supabase 클라이언트(`src/lib/supabase/server.ts`)가 `Database` 제네릭 없이 만들어져 쿼리 결과가 `any` 다. 화면마다 생성된 Row 타입을 손으로 붙이고 있다. 별도 작업으로 뗐다.

### v0.18 (2026-10-06) — 운영 화면 9a

- **`push_registration_status()`** — 운영자 전용(아니면 42501 — 운영 함수는 빈 결과로 숨길 이유가 없다). 계정 있는 앱 사용자(leader·pastor·admin, active)별 이름·역할·목장·기기 수·마지막 성공 시각. endpoint·키는 돌려주지 않는다 — 발송 비밀은 운영자에게도 열지 않는다.
- **휴주는 이번 주부터만** — `skipped_weeks_guard` 트리거(insert·delete). 세션 사용자가 `kst_current_week()` 이전 주차를 넣거나 빼면 22023. 세션 없는 쓰기(시드·테스트·서버 키)는 예외 — 이력 적재용. `created_by` 는 세션 사용자로 채운다. `kst_current_week()` 는 `src/lib/week.ts currentWeekKey()` 와 같은 정의다.
- 테스트 하네스: Supabase 처럼 `service_role` 에 public 함수 실행 권한.
- `tests/rls/admin-home.test.mjs` 10건.

### v0.17 (2026-10-05) — 목장 프로필 보호 (Step 8)

테이블·정책은 그대로다(Step 2 의 `group_profiles` · `org_profile`). 들어간 것은 "무엇을 쓸 수 있나" 다.

- **`updated_by` 는 세션 사용자** — 트리거 `profile_stamp_updated_by` 가 `current_user_id()` 로 덮어쓴다. 클라이언트가 남의 id 를 보내도 소용없다(02 §4 책임 추적). 세션 없는 쓰기(시드·서버 키)는 보낸 값을 둔다.
- **블록 꼴 제약** — 소개 100자 · 자유 글 1000자 · `ddays` 10개 `{title 1~40자, date YYYY-MM-DD}` · `theme_songs` 5개 `{title 1~60자, url http(s) 500자}`. 검증 함수 `profile_ddays_valid()` · `profile_theme_songs_valid()`. `org_profile` 에도 같은 제약 — Step 9 의 운영자 편집이 같은 블록을 쓴다. `javascript:` 링크가 리더 41명의 화면에서 열리면 안 된다.
- 화면의 한도(`src/lib/group-profile.ts PROFILE_LIMITS`)는 이 숫자와 같아야 한다 — 어긋나면 "화면은 통과했는데 저장이 안 되는" 일이 생긴다.
- `tests/rls/group-profile.test.mjs` 17건 — 행이 없는 자기 목장에 리더가 insert(프로덕션의 첫 편집) · 다른 목장 insert 42501 · 목사님 수정·운영자 삭제(내리기) · `updated_by` 위조 덮임 · 제약 9종 · 경계값.

### v0.16 (2026-10-03) — 웹 푸시 (Step 7)

- `push_subscriptions` — 기기 하나 = endpoint 하나(유일). 쓰기는 `save_push_subscription` · `remove_push_subscription` 함수로만 — 같은 endpoint 를 다른 사람이 저장하면 그 사람에게 옮긴다(한 기기에서 계정을 바꾼 경우). 읽기는 본인 것만. **`users.push_subscription` · `push_registered_at` 은 지웠다**(값이 없던 한 칸짜리).
- `push_log (dedupe_key, user_id)` 유일 — 같은 알림은 한 번. `claim_push(key, users)` 가 처음 잡은 사람만 돌려준다. authenticated 는 접근 불가.
- 받는 사람: `push_reminder_targets(week)`(그 주 미제출 목장의 리더 전원, 휴주면 없음) · `push_group_targets(report, exclude)`(그 목장 리더, 제출자 제외). **service_role 전용.**
- `tests/rls/push.test.mjs` 15건. 하네스에 Supabase 처럼 `service_role`(RLS 우회 + 기본 테이블 권한)을 추가했다.

### v0.15 (2026-10-03) — 성별 수급 (Step 6)

- `care_gender_balance()` — 목장 × 성별 한 줄: `members`(청년) · `leaders` · `per_leader` · `alert`(`no_leader` · `overload` · null). 명단만 보고 숫자만. 목사님·운영자 전체 · 리더 자기 목장. 규칙은 03 §3.4.
- `tests/rls/gender-balance.test.mjs` 13건.

### v0.14 (2026-10-03) — 관계 밀도 (Step 6)

- `care_density(p_week_key, p_now)` — 목장 한 줄: `targets` · `leaders` · `possible_pairs` · `connected_pairs` · `density`(collecting·분모 0 이면 null). 숫자만, 목사님 전체 · 리더 자기 목장. 규칙은 03 §3.3.
- 판정 창을 `care_window(p_week_key, p_now)` 하나로 모았다 — `care_blind_spots` 도 이걸 쓴다(규칙 변화 없음). 직접 실행 권한은 없다.
- `tests/rls/density.test.mjs` 14건(3목장 7/24 손계산).

### v0.13 (2026-10-03) — 돌봄 사각지대 판정 (Step 6)

- `care_blind_spots(p_week_key, p_now)` — 사람 한 명당 한 줄, **판정 값만** 돌려준다(원문 컬럼 없음). SECURITY DEFINER, 저장하지 않는다. 목사님 전체 · 리더 현재 소속 목장 · 운영자·미승인 0행.
- 창은 **마감이 지난** 최근 4주(휴주는 빼고 더 거슬러 간다). 그 사람의 전체 기록(다른 목장 포함, 보고서 제출 여부 무관)으로 `contact_gap` · `meeting_gap` · `contact_leaders`(=1 이면 단독 연결) · `weeks_recorded` · 마지막 접촉·참석 주.
- 대상은 `status = active ∧ care_status ∈ {active, long_absent}`. `state` 가 `collecting`(창이 가장 이른 주간기록보다 앞섬) · `new`(창 시작 뒤 등록) 면 gap 은 null. `needs_check` 를 그대로 실어 집계 중 기간의 출발점으로 쓴다.
- `tests/rls/blind-spots.test.mjs` 22건. 규칙의 근거는 03 §3.1.4.

### v0.12 (2026-09-30) — 상태 태그와 needs_check (사각지대 사전 작업)

- `persons.care_status` (enum `care_status`, 기본 `active`) — **돌봄 판정 축.** 기존 `status`(활동·휴면·기록 제외·이탈 = 앱에서의 존재 여부)와는 다른 축이라 컬럼을 따로 뒀다. `active` 재적(판정 대상) · `military` 군 복무 · `remote` 원거리·해외 · `weekend_work` 주말 근무(온라인 참여) · `other_church` 타 교회 출석 — 넷은 판정 제외 · `long_absent` 장기 미출석(판정 대상, 별도 표시). **비고 자동 파싱 없음** — `data/roster.config.json`(gitignore) 의 overrides 로 이름을 직접 지정하고, 도입 스크립트가 이름을 (목장, 이름)으로 맞춘다. 저장소·로그·문서에 이름은 나오지 않는다.
- `persons.needs_check` (boolean, **null = 아직 판정 안 함**) — **1회성.** 명단의 '청년대학부 회원'(O/빈칸, 8주 연속 출석의 결과)을 사각지대의 첫 기준점으로 딱 한 번만 쓴다: 도입 시 `care_status ∈ {active, long_absent}` 이고 회원 빈칸이면 true. DB 에 회원 개념은 없다 — `청년대학부 회원`·`공동의회 회원` 둘 다 저장하지 않는다. **재도입은 null 인 행에만 쓴다**(`coalesce(persons.needs_check, excluded.needs_check)`) — 리더가 확인해 false 로 바꾼 값을 되돌리지 않는다. 2026-09-30 도입 결과 24명(새싹 5 · 밸리 4 · 새벽 3 · 마음 2 · 프레쉬 2 · 하품 2 · 빛길 1 · 사랑 1 · 에끌 1 · 기쁨 1 · 다소니 1 · 토브 1). 학기·정산 개념도 넣지 않는다.
- 도입 스크립트의 순수 부분을 `scripts/lib/roster.mjs` 로 빼서 PGlite 위에서 테스트한다(`tests/rls/roster-needs-check.test.mjs` — 재도입이 needs_check 를 리셋하지 않는 것이 핵심).

### v0.11 (2026-09-29) — 연속 제출 (Step 6)

- `group_streaks(p_week_key, p_now)` — 목장별 연속 정시 제출 주 수. **저장하지 않는다.** 마감 후 제출은 끊고, 휴주는 건너뛰어 유지하고, 마감 전 미제출은 '대기'. 목사님 전체 · 리더 자기 목장 · 운영자·미승인 0행. 순위 없음. `tests/rls/streak.test.mjs` 16건(제출 전 N → 후 N+1 포함).

### v0.10 (2026-09-29) — 공지의 두 약속

- `persons.status` 에 `opted_out`(기록 제외). 이유 컬럼은 없다 — 리더 화면에 낙인이 뜨지 않도록. 운영자 전용 `set_person_recording(person_id, recording)`. 기존 정책·함수가 전부 `status = 'active'` 기준이라 값 하나로 작성 명단·완결성·행 저장에서 자동으로 빠진다. 재도입이 되돌리지 않는다.
- `app_meta.retention_months = 24` · `records_past_retention()`. `tests/rls/opt-out.test.mjs`.

### v0.9 (2026-09-28) — 목사님의 읽음과 스탬프 (Step 5)

- `report_reviews` — 보고서(목장×주차)당 한 행. `first_read_at` 고정 · `last_read_at`/`read_count` 갱신 · `stamp`(enum `report_stamp`: 지금은 `pray` 하나 — 세 개였다가 같은 날 하나로 줄이며 타입을 교체해 쓰지 않는 값을 지웠다; 문구는 labels.ts) · `stamped_at`.
- 쓰기는 정의자 함수 두 개로만: `mark_report_read(report_id)`(상세 서버 렌더가 부른다 = 읽음의 정의), `set_report_stamp(report_id, stamp)`(같은 것 다시 = 취소). 테이블 직접 쓰기 권한 없음.
- 읽기: 목사님 전부, 그 목장 리더는 자기 목장 것(`is_leader_of`). 다른 목장 리더·미승인·운영자 0행.
- 왜 `reports` 컬럼이 아닌가 — reports 는 리더가 UPDATE 하는 행이라 정책이 섞이고 리더가 스탬프를 지우는 경로가 열린다. `tests/rls/pastor-review.test.mjs`.

### v0.8 (2026-09-28) — 실명단 도입

- **목장 식별자는 이름이다.** `groups.name` 유일(새싹·마음·빛길·프레쉬·사랑·하품·밸리·에끌·기쁨·다소니·새벽·토브 — 명단 등장 순서). `number` 는 정렬 전용. 화면은 `groupLabel()` 한 곳에서 "새싹 목장" 으로 붙인다. 마을은 넣지 않는다.
- `persons.training_stage`(훈련단계, `-`·빈칸은 null) · `persons.birth_year`(출생년도만 — 명단에 생년월일이 없다) 추가. `gender` 결측 허용. 직업·소속·비고는 넣지 않는다.
- `app_meta` — `roster_source`(seed | real) · `demo_records`. `db:seed` 는 real 위에서 거부, `demo:clear` 는 demo 표시일 때만.
- 명단은 저장소 밖(`data/roster.xlsx`, gitignore). `npm run roster:import` 가 stdin 으로 upsert 한다 — 중간 파일 없음. id 는 `md5('person:'||목장||':'||이름||':'||출생년도)`, (목장, 이름)으로 re-key. 09 §1.4.
- 시드의 가명 목장에도 이름을 붙였다(가온·나래·다솜·라온·마루·바다·샘물·아람·자람·초록·하람·해든). 테스트의 `groupId(3)` 은 시드 번호 조회로 유지.

### v0.7 (2026-09-27) — 앱을 청년에게는 공유하지 않는다

v0.4 의 세 번째 전제("청년도 앱을 쓴다")를 **다시 뒤집었다.** 앱 사용자는 리더·목사님·운영자뿐이다.

| | 남는다 | 없어진다 |
|---|---|---|
| 명단 | `persons` 의 청년 39명, `group_role = 'member'` — 출석·기도제목·1대1 대상 | — |
| 앱 계정 | `pending / leader / pastor / admin` | `users.role = 'member'`, 청년 로그인·신청·화면 |

- `user_role` 에서 `member` 를 **실제로 지웠다**(타입 교체). 값이 남으면 "없앴다" 가 코드 약속에 그친다.
- 청년 person 에는 계정을 붙일 수 없다 — 트리거 `persons_member_has_no_account`. 계정이 붙은 리더를 청년으로 내리려면 먼저 뗀다.
- 신청 대상은 명단상 리더뿐(`list_claimable_persons` · `apply_for_person`). 승인·거절은 **운영자만** — 신청 유형 분기(같은 날 오전에 만든 것)를 걷어냈다. 목사님은 승인하지 않는다. `set_user_role` 삭제 — 리더는 승인으로만 생기고 내리는 건 `unlink_person_account`.
- 신청·승인 가입 자체는 **유지**한다. 근거가 "80명에게 링크를 보내는 병목" 에서 "41명이어도 초대 토큰보다 리더 본인이 고르는 편이 싸다" 로 바뀌었을 뿐이다.
- 원칙 ⑤(존재를 드러내지 않는다)는 청년 은닉이 근거였다. 미승인 계정에게 같은 방식이 단순하고 무해하므로 유지하되 근거를 고쳤다.
- 투명성이 줄었다 — 전에는 청년이 로그인해 앱의 존재를 봤지만 이제는 모른 채 기록된다. 그래서 07 §0 도입 공지를 다시 썼다.

### v0.4 (2026-09-27) — 전제 셋이 틀렸다

조직 구조에 대한 이해가 바뀌었다.

| 초안의 전제 | 실제 | 결과 |
|---|---|---|
| 청년 150명 / 리더 50명 | **전체 약 80명, 그중 리더 40명대.** 앱 사용자는 당분간 최대 100명 | 규모 관련 서술 전부 폐기 |
| 리더는 기록하는 사람, 청년은 기록되는 사람 | **리더도 목장 모임에서 기도제목을 나눈다.** 기록 대상이다 | `members` + `leaders` → **`persons`** 하나 |
| 앱은 리더와 목사님만 쓴다 | **청년도 앱을 쓴다** → v0.7 에서 다시 뒤집음 | 역할 3단계 → 5단계 → **4단계** (§4.1) |

세 번째가 초대 방식을 무너뜨렸다. 초대는 "운영자가 아는 50명에게 링크를 보낸다" 는 전제 위에 서 있었는데, 청년 80명이 각자 들어오는 구조에서는 운영자가 병목이 된다. 그래서 **누구나 로그인하고, 본인이 명단에서 자기 이름을 골라 신청하고, 그 목장 리더가 승인**하는 방식으로 바꿨다(§3.5).

바꾸면서 지킨 것 — 신원 컬럼 잠금(§3.1), `current_user_context()`, 세션 관리, "authenticated ≠ 우리 사용자" 원칙(§4.6).

되돌리기 마이그레이션은 두지 않았다. 시드 외의 데이터가 없고, 되돌릴 일이 생기면 그때 새 마이그레이션을 쓴다.

### v0.6 (2026-09-27) — 민감 구분을 없앴다

`weekly_records.is_sensitive` 를 지웠다. 조사(Step 4 E) 결과 이 플래그가 DB 읽기 계층에서 제한하는 주체가 없었다 — 같은 목장 리더는 (A)로 전부 보고, 다른 목장·운영자·청년은 행 자체가 없고, 목사님은 전부 본다. 남는 것은 원칙 한 줄이고 그것은 RLS 가 이미 강제한다.

> **모든 기도제목과 나눔은 목장 안에서만 다룬다. 목사님은 사역자이므로 전체를 보신다.**

작성 화면은 이 범위를 사실 진술로 한 줄 보여준다. 07 동의서의 청년 대상 문구도 같은 내용으로 바꿨다.

### v0.3 (2026-09-22) — 권한을 구현했다

§4 의 정책을 마이그레이션으로 옮기면서 헬퍼 함수·공개 뷰·컬럼 단위 GRANT 를 추가했다.

### v0.2 (2026-09-22) — 테이블 셋을 없앴다

`Season`(학기) · `MemberAssignment` · `LeaderAssignment` 를 제거했다. 목장 구성이 거의 바뀌지 않아 학기 경계와 배치 이력이 의미를 갖지 못했다. 과거 맥락은 `weekly_records.group_id_at_write` 가 보존한다. 이에 맞춰 PRD §7 은 '청년·리더 개별 등록·이동' 으로, IA 의 A-2(학기 전환 마법사)는 A-1 에 흡수했다.

---

## 1. 설계 원칙

**① 격리는 애플리케이션이 아니라 데이터 계층에서 강제한다.**
쿼리를 잘못 짜면 다른 목장의 기도제목이 새어나간다. 코드 리뷰로 막을 일이 아니라 구조로 막을 일이다.

**② 열람 범위와 집계 범위를 분리한다.**
리더는 자기 목장에서 작성된 기록만 본다. 그러나 돌봄 사각지대 판정은 그 사람의 **전체 기록**으로 계산해야 정확하다(지표 정의서 §3.1.3). 사람이 읽는 것과 시스템이 세는 것의 범위가 다르다.

**③ 기록은 지우지 않는다.**
수정·삭제 대신 상태 전환과 보존기간 만료로 처리한다. 돌봄 기록은 되돌아볼 수 있어야 가치가 있고, 실수로 지운 것을 복구할 수 없으면 신뢰를 잃는다.

**④ 시점을 저장한다.**
사람은 드물게나마 목장을 옮긴다. "지금 어느 목장인가"만 저장하면 과거 기록의 맥락이 사라진다. 주간기록마다 작성 시점의 목장을 스냅샷으로 박아둔다.

**⑤ 존재를 드러내지 않는다.** (v0.4 · v0.7 근거 교체)
미승인 계정에게는 출석·보고서가 **있다는 사실** 자체가 보이면 안 된다. 권한 오류(403)는 "거기 뭔가 있다" 를 알려주는 셈이다. 권한 없는 조회는 오류가 아니라 **빈 결과**로, 권한 없는 화면은 **404** 로 답한다. (원래는 청년 은닉이 근거였다. 청년이 앱을 쓰지 않게 된 뒤에도 한 가지 방식으로만 답하는 편이 단순해 유지한다.)

---

## 2. 엔티티 개요

```
groups (목장 · village 마을) ──┬── persons (명단 · 리더+청년) ── users (앱 계정 · is_officer)
                │        ├── person_ministries ── ministries (섬김 부서)
                │        └── applications (신청 · requested_role)
                ├── group_profiles        [목장당 1행 · 승인된 전원 공개]
                │
                ├── reports (주간 보고서)  [group × week 유일]
                │       │
                │       ├── weekly_records (주간기록)  [report × person 유일]
                │       │        ├── prev_record_id (지난 기도제목 연결)
                │       │        └── group_id_at_write (작성 시점 목장 스냅샷)
                │       │
                │       ├── report_reviews (목사님 읽음·스탬프) · report_presence
                │       └── comments (목사님 코멘트)
                │
                └── 로뎀 월드 (목장 단위)
                        world_ledger (열매 원장) · world_inventory (가진 물건)
                        world_villages (마을 + 집 안 rooms) · world_streak_freezes (지킨 주)
                        world_room_shots (집 안 사진)

org_profile (청년부 프로필 · 단일 행) · skipped_weeks (휴주) · app_meta
events (행동 로그) · export_logs (내보내기 로그)
push_subscriptions · push_log (웹 푸시)
world_items (상점 물건) · world_rules (열매 규칙) · world_avatars · world_avatar_shots (사람 단위)
```

v0.4 에서 `persons` 와 `applications` 가 들어오고 `members` · `leaders` 가 나갔다. 그 뒤로 보고서 보조(v0.5 · v0.9), 푸시(v0.16), 로뎀 월드(v0.23~), 섬김 부서(v0.32)가 붙었다.

| 파일 | 내용 |
|---|---|
| `..._base_tables.sql` | `groups` · `users` (+ 옛 `members` · `leaders`) |
| `..._roster_columns.sql` | `persons.training_stage` · `birth_year`, `groups.name` 유일, `app_meta` (v0.8) |
| `..._report_reviews.sql` | `report_reviews` · `report_stamp` · `mark_report_read` · `set_report_stamp` (v0.9) |
| `..._single_stamp.sql` | `report_stamp` 를 `pray` 하나로 교체 (v0.9) |
| `..._group_streaks.sql` | `group_streaks()` — 연속 제출 계산, 저장 없음 (v0.11) |
| `..._care_status.sql` | `persons.care_status` · `needs_check` (v0.12) |
| `..._opt_out_and_retention.sql` | `person_status.opted_out` · `set_person_recording` · `retention_months` · `records_past_retention` (v0.10) |
| `..._digest_ai.sql` | `persons.ai_excluded` · `pastor_digests` · `pastor_digest_feedback` · `digest_claim` · `digest_save` · 보관 정리에 `pastor_digests` (v0.35) |
| `..._weekly_records.sql` | `reports` · `weekly_records` |
| `..._profiles.sql` | `group_profiles` · `org_profile` |
| `..._group_profile_guards.sql` | `updated_by` 세션 고정 트리거 · 블록 꼴 제약 (v0.17) |
| `..._admin_home.sql` | `push_registration_status()` · `kst_current_week()` · 휴주 소급 금지 트리거 (v0.18) |
| `..._app_meta_admin_read.sql` | `app_meta` 운영자 읽기 (v0.18) |
| `..._people_admin.sql` | `care_status`(운영자만)·`needs_check` 컬럼 권한 · 목장장 한 명 인덱스 (v0.19) |
| `..._retention_purge.sql` | `retention_cutoff()` · `purge_expired_records()` · pg_cron 매월 (v0.20) |
| `..._export_log.sql` | `log_export()` 목사님 전용 · `export_logs` 직접 쓰기 닫음 (v0.21) |
| `..._person_name_rules.sql` | 같은 목장 동명이인 금지 · 이름 1~20자 (v0.22) |
| `..._world_economy.sql` · `..._world_state_readonly.sql` | 로뎀 월드 열매 · 상점 · 마을 · 아바타, `world_state` 읽기 전용 (v0.23) |
| `..._world_freeze.sql` · `..._world_wardrobe.sql` · `..._world_people.sql` · `..._world_rules_slower.sql` | 연속 지키기 쿠폰 · 규칙 표, 꾸미기 소품, 다른 사람 생김새, 규칙 값 (v0.24~v0.27) |
| `..._leader_export_needs_check.sql` · `..._roster_people.sql` | 리더 내보내기(자기 목장) · `needs_check_people()` · `roster_people()` (v0.28) |
| `..._world_live.sql` · `..._fence_blurb.sql` | Realtime `world:lobby` 정책 · 울타리 설명 (v0.29) |
| `..._world_rooms.sql` | 가구 · `world_villages.rooms` · `world_set_room` (v0.30) |
| `..._world_room_shots.sql` · `..._world_avatar_shots.sql` | 목장 탭 · 정보 탭 배경 사진 (v0.31) |
| `..._roster_details.sql` · `..._roster_group_export.sql` · `..._pastor_add_member.sql` | 마을 · 명단 칸 · 섬김 부서 · 리더·목사님 양 추가 · 명단 엑셀 로그 (v0.32) |
| `..._attendance_v2.sql` | 온라인 예배 · 사유 세 칸 · `care_blind_spots` v2 (v0.33) |
| `..._officer_role.sql` · `..._role_requests.sql` | `officer` · `is_officer` · `request_role` · 역할별 승인 (v0.34) |
| `..._auxiliary.sql` | `comments` · `events` · `export_logs` |
| `..._rls_policies.sql` | v0.3 정책 (v0.4 에서 전부 대체됨) |
| `..._invite_auth.sql` | v0.3 초대 (v0.4 에서 제거됨) |
| `..._persons_and_roles.sql` | **v0.4** — `persons` · `applications` · 역할 5단계 · 정책·뷰·RPC 전면 재작성 |
| `..._apply_helpers.sql` | 신청·승인 화면용 보조 RPC |
| `..._report_form.sql` | **Step 4** — `reports.note` · `skipped_weeks` · `report_presence` · `submit_report` 등, 뷰 수정 (A) |

마이그레이션은 전진만 한다. 위 순서로 적용하면 현재 스키마가 된다.

**시드는 두 파일이다.** `seed_accounts.sql`(가짜 계정 — 있으면 건드리지 않음) → `seed.sql`(명단·기록 — 계정은 만들지도 지우지도 않고, 명단은 결정적 id 로 upsert 하며 실제 계정 연결을 보존). `npm run db:seed` 가 적용 뒤 행 수를 읽어 기대값과 비교하고 다르면 실패한다. 시드 끝의 DO 블록도 같은 것을 단언한다 — `db push --include-seed` 가 조용히 안 돈 채 "Finished" 를 찍은 적이 있다.

### 코드와 라벨의 분리

상태값은 DB 에 **영문 소문자 코드**로 저장하고, 한국어 라벨은 `src/lib/labels.ts` 에서만 만든다. 라벨 상수는 생성된 enum 타입을 키로 받으므로, enum 을 바꾸고 라벨을 안 고치면 타입 검사가 실패한다.

| enum 타입 | 쓰이는 곳 | 코드 → 한국어 |
|---|---|---|
| `user_role` | `users.role` · `applications.requested_role` | `pending` 미승인 · `leader` 리더 · `pastor` 목사님 · `admin` 운영자 · `officer` 임원진(목장 리더가 아닌 — v0.34) (v0.7 — `member` 삭제. 청년은 앱을 쓰지 않는다) |
| `group_role` | `persons.group_role` | `leader` 리더 · `member` 청년 |
| `person_status` | `persons.status` | `active` 활동 · `dormant` 휴면 · `opted_out` **기록 제외**(목장에는 오지만 본인 요청으로 앱에 기록하지 않음 — v0.10) · `left` 이탈 |
| `application_status` | `applications.status` | `pending` 승인 대기 · `approved` 승인됨 · `rejected` 거절됨 |
| `auth_provider` | `users.provider` | `kakao` 카카오 · `google` 구글 |
| `user_status` | `users.status` | `active` 활성 · `inactive` 비활성 |
| `group_status` | `groups.status` | `active` 운영 · `disbanded` 해산 |
| `gender` | `persons.gender` | `male` 남 · `female` 여 |
| `dormancy_request_status` | `persons.dormancy_request` | `none` 없음 · `pending` 승인 대기 · `approved` 승인됨 |
| `prayer_status` | `weekly_records.prayer_status` | `new` 새 제목 · `ongoing` 진행 중 · `answered` 응답됨 |
| `event_type` | `events.type` | `report_opened` 보고서 열람 · `report_submitted` 보고서 제출 · `comment_created` 코멘트 작성 |
| `export_format` | `export_logs.format` | `xlsx` Excel · `print` 인쇄 · `roster` 명단 엑셀 (v0.32) |
| `care_status` | `persons.care_status` | `active` 재적 · `military` 군 복무 · `remote` 원거리·해외 · `weekend_work` 주말 근무 · `other_church` 타 교회 · `long_absent` 장기 미출석 (v0.12) |
| `report_stamp` | `report_reviews.stamp` | `pray` (v0.9) |

**`user_role` 과 `group_role` 은 다른 것이다.** 앞의 것은 "앱에서 무엇을 볼 수 있는가", 뒤의 것은 "목장에서 무엇을 하는가". 명단상 리더 신청이 승인되면 곧바로 `leader` 다(v0.7). 임원진은 목장 리더가 아니면 `officer`, 리더이기도 하면 `leader` + `users.is_officer` 다(v0.34).

출석은 enum 이 아니라 boolean 이지만 라벨은 같은 파일에 모아둔다 — `worship_attended` 예배출석 · `group_meeting_attended` 목장참석 · `one_on_one_contacted` 1대1접촉 · `worship_online` 온라인 예배(v0.33). 화면의 네 칩(현장 예배 · 현장 예배 + 목장 불참 · 온라인 예배 · 결석)은 §3.7 의 표대로 이 칸들의 조합이다.

---

## 3. 테이블

### 3.1 users — 앱 계정

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid | |
| auth_user_id | uuid | `auth.users` 연결. 첫 로그인의 `ensure_user()` 가 채운다 |
| name | text | 첫 로그인 때 제공자 프로필에서 가져온다 |
| provider | `auth_provider` | `kakao` / `google` |
| provider_uid | text | 제공자가 발급한 고유 ID |
| email | text | nullable — 카카오는 제공 동의가 선택이라 없을 수 있다 |
| role | `user_role` | 기본값 `pending` |
| **is_officer** | boolean | 임원진(v0.34). 기본 false. 리더이면서 임원진이면 role = leader 에 이것만 켜진다. `approve_application` 으로만 켜진다 |
| status | `user_status` | `active` / `inactive` |

`push_subscription` · `push_registered_at` 은 v0.16 에서 지웠다 — 기기별 구독은 `push_subscriptions` 에 있다.

`provider` 와 `provider_uid` 는 함께 있거나 함께 없어야 한다. `(provider, provider_uid)` 부분 유일 인덱스로 같은 소셜 계정이 두 사용자에 붙는 것을 막는다.

#### 가입은 막지 않는다 — 대신 아무것도 못 보게 한다

Supabase Auth 로는 누구나 OAuth 로 가입할 수 있고, 그것을 막을 설정은 없다. v0.3 은 초대 토큰으로 "앱 계정이 될 수 없게" 막았다. v0.4 는 반대로 **누구나 앱 계정을 갖되 `pending` 으로 시작**하게 한다. `pending` 이 볼 수 있는 것은 청년부 프로필과 신청 화면뿐이므로 무해하다.

```
로그인 (구글·카카오)
    ↓  ensure_user() — users 행 생성, role = pending
청년부 프로필만 보임 · 시작 화면에서 역할 고르기 (v0.34)
    ├ 리더    apply_for_person — 명단상 리더 중 미연결인 내 이름
    ├ 목사님  request_role('pastor') — 이름 없음
    └ 임원진  request_role('officer', [리더도 맡고 있으면 내 이름])
승인 대기
    ↓  운영자가 승인 (approve_application)
         리더 · 이름 건 임원진 → persons.user_id 연결, role = leader (임원진이면 is_officer = true)
         목사님 → role = pastor
         이름 없는 임원진 → role = officer, is_officer = true
```

#### 신원 컬럼 잠금 (v0.3 에서 유지)

`authenticated` 에게 `users` 의 UPDATE 권한을 **`name`** 한 컬럼에만 준다(push 두 칸은 v0.16 에서 컬럼째 지웠다). `role` · `is_officer` · `provider` · `auth_user_id` 는 본인도 고칠 수 없다. 바뀌는 경로는 `ensure_user()` · `approve_application()` · `unlink_person_account()` 뿐이다(`set_user_role` 은 v0.7 에서 지웠다).

#### 계정 분열

같은 사람이 구글과 카카오로 각각 로그인하면 별개의 `users` 행이 생긴다. 두 번째 계정은 `pending` 이고, 신청 목록에는 자기 이름이 **없다**(이미 연결됨). 그것이 "다른 계정으로 이미 승인받았다" 는 신호다. 운영자가 확인하고 정리한다.

이메일로 자동 병합하지 않는 이유는 v0.3 과 같다 — 카카오는 이메일 제공이 선택 동의라 항상 되지 않고, "이 이메일이 등록돼 있는가" 를 묻는 엔드포인트는 멤버십 열거 통로가 된다.

### 3.2 groups — 목장

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid | |
| number | int | 유일. 정렬 전용 (v0.8) |
| name | text | 유일. 목장 식별자 (v0.8) |
| village | text | 마을(명단 엑셀 A열). 1~20자, null 허용. `set_group_village()` — 그 목장 리더 · 목사님 · 운영자(목장 행 직접 수정은 원래대로 운영자만) (v0.32) |
| status | `group_status` | `active` / `disbanded` |

### 3.3 persons — 청년부 명단 (리더 포함) ★

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid | |
| group_id | uuid | 현재 소속 목장 |
| name | text | |
| gender | `gender` | 성별 수급 지표 |
| **group_role** | `group_role` | `leader` / `member` — 목장 안에서의 역할 |
| **is_group_head** | bool | 목장장. 호칭일 뿐 권한과 무관. 리더여야 한다(제약) |
| status | `person_status` | `active` / `dormant` / `opted_out` / `left` |
| dormancy_request | `dormancy_request_status` | 리더 신청 → 목사님 승인 2단계 |
| joined_at | date | 신규 판정(4주) |
| birth_date | date | 생일 알림 + **신청 시 동명이인 구분** |
| phone | text | **지금은 비워둔다.** 컬럼만 남겨 나중에 채울 수 있게 |
| care_status | `care_status` | 돌봄 판정 축 — active·long_absent 판정 대상, 나머지 제외 (v0.12). 설정으로만 지정 |
| needs_check | boolean | 1회성 사각지대 첫 기준점. null = 미판정. 재도입이 되돌리지 않는다 (v0.12) |
| training_stage | text | 훈련단계 — 목자·목동·예비목자반·제자반·새가족반·양. 없음은 null. 1~20자 (v0.8, 제약 v0.32) |
| birth_year | integer | 출생년도. 동명이인 구분용 (v0.8) |
| occupation | text | 직업(엑셀 H열). 1~30자 (v0.32) |
| affiliation | text | 소속 — 학교 · 회사(엑셀 I열). 1~40자 (v0.32) |
| youth_member | boolean | 청년대학부 회원(엑셀 J열). 기본 false. 기준은 교회가 정한다 — `needs_check` 와 별개 (v0.32) |
| assembly_member | boolean | 공동의회 회원(엑셀 K열). 기본 false (v0.32) |
| note | text | 비고(엑셀 L열). 1~200자. 그 목장 리더 · 목사님 · 운영자 · 임원진이 본다(persons 원본 범위) (v0.32) |
| **ai_excluded** | boolean | AI 정리에 보내지 않는다(본인 요청). 기본 false. 목사님 · 운영자만 바꾼다(트리거 `persons_staff_only`) (v0.35) |
| **user_id** | uuid | 앱 계정 연결. 유일(한 계정 → 한 사람). **한 사람 → 한 계정**은 DB 가 세 겹으로 막는다: ① 자리가 하나(스칼라) ② `authenticated` 는 이 컬럼을 직접 못 고친다(컬럼 권한 — `approve_application` 과 `unlink_person_account` 만) ③ 트리거 `persons_user_id_link_once` — 찬 자리를 다른 계정으로 덮는 것은 definer 함수·운영자·시드 **누구든** 못 한다. 연결은 빈 자리에만, 옮기려면 먼저 뗀다 (2026-09-27, `tests/rls/person-link.test.mjs`) |

리더와 청년이 한 테이블에 있는 이유는 **둘 다 기록 대상**이기 때문이다. 리더도 목장 모임에서 기도제목을 나눈다. 리더의 휴직은 `dormant` 로, 사임은 `group_role` 을 `member` 로 내리는 것으로 표현한다.

`user_id` 가 null 이면 아직 앱을 쓰지 않는 사람이다. 신청 목록에는 이 사람들만 뜬다.

텍스트 칸(이름 · 훈련단계 · 직업 · 소속 · 비고)은 모두 앞뒤 공백 없이 1~N자 제약이 걸려 있다 — 빈 값은 null.

#### 누가 무엇을 쓰나 (v0.32 기준)

| 쓰기 | 누가 | 근거 |
|---|---|---|
| 행 추가 | 운영자(아무 꼴) · **목사님**(리더 · 양, 계정 없음 · 활동 · 목장장 아님 꼴, 2026-11-26) · **그 목장 리더**(양 · 계정 없음 · 활동 · 목장장 아님 꼴만) | `persons_insert` (v0.32 · 10-29 · 11-26) |
| 목장 · 이름 · 성별 · 역할 · 목장장 · 상태 · 휴면 · 등록일 · 생년월일 · 연락처 | 그 목장 리더 · 목사님 · 운영자 | 컬럼 권한(v0.4) + `persons_update` |
| 훈련단계 · 출생년도 · 직업 · 소속 · 회원 두 칸 · 비고 | 같음 | 컬럼 권한(v0.32) + `persons_update` |
| `needs_check` | 같음 | v0.19 |
| `care_status` | 운영자만 | 트리거 `persons_care_status_admin_only` (v0.19) |
| `user_id` | `approve_application` · `unlink_person_account` 만 | v0.4 · 트리거 `persons_user_id_link_once` |
| 기록 제외 | `set_person_recording` (운영자) | v0.10 |
| `ai_excluded` (AI 에서 빼기) | 목사님 · 운영자 | 컬럼 권한 + 트리거 `persons_staff_only` (v0.35) |
| 섬김 부서 넣기 · 빼기 | 그 목장 리더 · 목사님 · 운영자 | `person_ministries_insert/delete` (v0.32) |

리더가 다른 목장으로 옮기려 해도 `persons_update` 의 with check(`is_leader_of(group_id)`)가 막는다.

### 3.3a ministries · person_ministries — 섬김 부서 (v0.32)

| 테이블 | 컬럼 | 접근 |
|---|---|---|
| `ministries` | id · name(유일, 1~20자) · sort(엑셀 오른쪽 표 순서, 세 칸씩 한 줄) · active · created_at. 처음 13개 | 읽기 앱 사용자. 쓰기 정책 없음(마이그레이션 · 서버 키) |
| `person_ministries` | (person_id, ministry_id) 기본키 · created_at. 한 사람이 여러 부서. 둘 다 cascade | 읽기 = 그 사람을 볼 수 있는 사람(정책 안의 `persons` 조회에 persons RLS 가 걸린다) · 넣기 · 빼기 = 그 사람 목장 리더 · 목사님 · 운영자 |

명단 엑셀의 섬김(M) · 부서(N) 열과 오른쪽 부서 표가 여기서 나온다.

### 3.4 applications — 신청

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | uuid | |
| user_id | uuid | 신청한 계정 |
| **requested_role** | `user_role` | 신청한 역할 — `leader` · `pastor` · `officer`. 기본 `leader`(2026-10-30 전 신청은 전부 leader) (v0.34) |
| person_id | uuid | 고른 이름. **nullable** (v0.34) |
| group_id | uuid | 그 사람의 목장. 정책이 조인 없이 판정하도록 복제. **nullable** (v0.34) |
| status | `application_status` | `pending` / `approved` / `rejected` |
| requested_at · decided_at · decided_by | | |

제약 `applications_role_ck` — leader 는 이름 · 목장 필수, pastor 는 둘 다 없음, officer 는 둘이 함께 있거나(리더도 맡은 임원진) 함께 없다.

| 신청 | 함수 | 승인 결과 (`approve_application`, 운영자만) |
|---|---|---|
| 리더 | `apply_for_person(person_id)` | 이름 연결 · role = `leader` |
| 목사님 | `request_role('pastor')` | role = `pastor` |
| 임원진(리더 겸) | `request_role('officer', person_id)` — 명단상 리더 · 활동 · 미연결 | 이름 연결 · role = `leader` · `is_officer = true` |
| 임원진 | `request_role('officer')` | role = `officer` · `is_officer = true` |

`request_role` 은 pending 계정만(23505), pastor · officer 만(22023) 받는다. 한 계정은 동시에 한 건만 걸 수 있다(부분 유일 인덱스 + 함수 검사). 같은 사람을 노린 신청이 여럿이면 하나를 승인하는 순간 나머지는 자동으로 거절된다. 거절된 계정은 `pending` 으로 남아 다시 신청할 수 있다.

### 3.5 group_profiles / org_profile — 프로필

구조는 v0.2 와 같다. 바뀐 것은 노출 범위다.

- `group_profiles` — **승인된 전원**이 읽는다(청년은 앱을 쓰지 않으므로 리더·목사님·운영자·임원진). 편집은 자기 목장 리더, 그리고 '내리기' 권한의 목사님·운영자. 자유 글은 목장 소개 용도이고 기도제목이나 개인 사정은 여기 쓰지 않으므로 경고 문구를 두지 않는다. 블록 꼴과 길이는 DB 제약, `updated_by` 는 트리거(v0.17). 프로덕션은 0행에서 시작 — 첫 편집이 insert
- `org_profile` — **로그인한 전원(pending 포함)**이 읽는다. 미승인자에게 보이는 유일한 것이다. 쓰기는 운영자

### 3.6 reports — 주간 보고서

v0.2 와 같다. `(group_id, week_key)` 유일, `week_key` 는 일요일(제약), 제출 시각·제출자는 함께 있거나 함께 없다(제약).

**`note` (v0.5)** — 목장 단위 특이사항. 선택 사항이며 제출 조건이 아니다. `weekly_records.note`(사람 단위)는 남겨두되 화면에서 쓰지 않는다.

`is_late` 는 **첫 제출** 시각이 마감(화요일 23:59 KST)을 넘겼는지로 한 번 정해지고 이후 수정으로 바뀌지 않는다. 마감 후에도 저장은 된다.

### 3.7 weekly_records — 주간기록 ★

| 컬럼 | 타입 | 비고 |
|---|---|---|
| id · report_id | | |
| **person_id** | uuid | 기록 대상. **리더 자신도 대상이다.** (v0.4, 옛 `member_id`) |
| author_id | uuid | 작성자(리더의 `users.id`). 커버리지 지표의 기반 |
| week_key | date | 비정규화 |
| **group_id_at_write** | uuid | 작성 시점 목장. 권한 판정 기준 |
| worship_attended · group_meeting_attended · one_on_one_contacted | bool | 출석 세 축 |
| **worship_online** | bool | 온라인 예배. 기본 false (v0.33) |
| online_reason · meeting_absent_reason · absent_reason | text | 온라인 예배 · 목장 모임 불참 · 결석 사유. 빈칸은 null. 원본 select 권한 없음 — 뷰로만 읽는다(기도제목과 같은 범위) (v0.33) |
| prayer_request · prayer_status · prev_record_id · note | | v0.2 와 같다 |

`(report_id, person_id)` 유일. 목장 전원(리더 포함)에 대해 매주 한 행이 생긴다.

#### 출석 네 칩 (v0.33)

| 화면 | worship_attended | worship_online | group_meeting_attended | 사유 칸 |
|---|---|---|---|---|
| 현장 예배 | O | X | O | — |
| 현장 예배 + 목장 모임 불참 | O | X | X | meeting_absent_reason |
| 온라인 예배 | O | O | X | online_reason |
| 결석 | X | X | X | absent_reason |

제약 **`weekly_records_online_ck`** — `not worship_online or (worship_attended and not group_meeting_attended)`. 온라인 예배는 목장 모임 불참을 겸한다. 예전 기록(출석 · 예배만 · 결석)은 온라인 X 로 그대로 이 표에 들어간다.

#### 쓰기 경로 — submit_report (v0.5)

화면은 원본 테이블에 직접 쓰지 않고 `submit_report(report_id, rows, note, note_dirty)` 를 부른다. 2026-11-04 부터 **`SECURITY DEFINER`** 다 — `reports` · `weekly_records` 의 insert/update/delete 권한을 `authenticated` 에서 거뒀기 때문이다(리더가 API 로 직접 '제때 제출' 행을 지어 열매를 받을 수 있었다). 함수 안에서 `is_leader_of(report.group_id)` 와 `week_key <= kst_current_week()` 를 직접 보고, 다른 목장 보고서는 '찾을 수 없음' 으로 답한다.

| 규칙 | 구현 |
|---|---|
| 허용 필드 | `worship_attended` · `group_meeting_attended` · `one_on_one_contacted` · `prayer_request` · (v0.33) `worship_online` · `online_reason` · `meeting_absent_reason` · `absent_reason`. 그 밖은 22023. 새 행은 예배 · 목장 두 칸이 있어야 만든다 |
| 바뀐 필드만 쓴다 (B) | 행마다 바뀐 필드 목록을 받아 **SET 절을 동적으로** 만든다. 출석만 고치면 `prayer_request` 는 SET 에 들어가지 않는다 — `UPDATE OF prayer_request` 트리거 탐침으로 검증 |
| 덮어쓰지 않는다 | `WHERE updated_at = <불러올 때 값>`. 0행이면 그 사이 남이 고친 것 → 충돌 목록으로 돌려주고 제출은 확정하지 않는다. 충돌 없는 행은 같은 호출에서 저장된다 |
| 완결성 | 전원에 행이 있고, 목장모임 참석자 전원에 기도제목이 있어야 제출 확정. 아니면 예외로 전체 롤백 |
| 작성자 | 그 행을 마지막으로 쓴 리더. 단독 연결 지표가 이 정의를 쓴다 |
| 기도제목 상태 | 기도제목이 바뀔 때 가장 최근 기록을 `prev_record_id` 로 잇고 `new` / `ongoing` 을 정한다 |

`open_report(group_id, week_key)` 가 화면을 열 때 보고서 행을 확보하고(없으면 생성 — 빈 행은 미제출) `report_opened` 이벤트를 남긴다. 휴주면 거부한다.

#### 자기 자신에 대한 1대1 접촉은 무효 (v0.4)

리더가 기록 대상이 되면서 "작성자 = 대상" 인 행이 생긴다. 자기 자신과 1대1 접촉했다는 체크는 지표를 오염시키므로 **저장 시점에 트리거가 `false` 로 바꾼다.** 집계 쿼리마다 예외를 두는 것보다 데이터 자체가 깨끗한 편이 낫다. 다른 리더가 그 리더에 대해 기록한 접촉은 그대로 남는다.

### 3.8 comments · 3.9 events / export_logs

v0.2 와 같다. 단 `export_logs` 는 직접 쓰기가 닫혀 있고(v0.21) 아래 두 함수로만 남는다. 로그가 먼저다 — 성공해야 파일이 나간다. 읽기는 목사님 · 운영자, 영구 보존.

| 함수 | `format` | 누가 | 남는 범위 |
|---|---|---|---|
| `log_export(format, start, end, group_ids)` | `xlsx` · `print` | 목사님(전체 null · 여러 목장) · **자기 목장 리더**(group_ids 가 정확히 [자기 목장], v0.28). 그 밖 42501 | 주차(일요일) 시작 ≤ 끝, 최대 52주, 운영 중인 목장 — 22023 |
| `log_roster_export(group_id default null)` | `roster` | null = 전체 명단: 목사님 · 운영자 · **임원진**(v0.34) · 목장 하나 = 그 목장 리더 · 목사님 · 운영자 (v0.32) | 기간 null · `group_ids` = null 또는 [그 목장]. 운영 중인 목장만 — 22023 |

내보내는 데이터 자체는 원래 RLS 로 읽는다 — 리더는 자기 목장 기록 · 사람 · 부서만, 임원진은 사람 · 부서 전체(기록은 없음).

### 3.10 skipped_weeks · report_presence (v0.5)

| 테이블 | 내용 | 접근 |
|---|---|---|
| `skipped_weeks` | 휴주. `week_key`(일요일) + 사유. 작성 대상이 아니고 제출률 분모에서 빠진다 | 읽기 승인된 전원 · 쓰기 운영자, **이번 주부터만**(트리거, v0.18). 화면은 `/admin/weeks` |
| `report_presence` | "지금 누가 보고 있는가". 60초 하트비트, 2분 안의 신호만 표시 | 테이블 권한 없음. `touch_report_presence()` 로만 |

### 3.11 로뎀 월드 (v0.23 ~ v0.31)

규칙과 결정의 근거는 §0 의 v0.23~v0.31. 여기는 현재 모양만 모은다. **모든 표는 select 만 열려 있고, 쓰기는 definer 함수로만**(트리거 포함). 목장 단위 쓰기는 `pg_advisory_xact_lock('world:'||목장)` 으로 잠근다. "목장 리더" 는 `_world_my_group()` — role leader · admin 이고 명단상 활동 중 리더인 목장. 목사님 · 운영자(명단 밖) · 리더 아닌 임원진은 사고 꾸미지 않는다.

| 테이블 | 단위 · 내용 | 읽기 |
|---|---|---|
| `world_items` | 상점 물건. `cat` house · fence · nature · prop · ticket · wear · furniture, `slot`(wear: hat·face·neck·back·hand / furniture: floor·wall / 그 밖 null), `price` · `sort` · `blurb` | 앱 사용자 |
| `world_rules` | 열매 규칙 `(key, value, note)` — 값만 고치면 다음 적립부터 바뀐다 | 앱 사용자 |
| `world_ledger` | 목장 열매 원장, 잔액 = 합계. reason start · report_on_time · report_late · streak_bonus · purchase. 제출 적립 · 보너스는 목장 × 주마다 한 번, 시작은 한 번(부분 유일 인덱스) | 그 목장 리더 · 목사님 · 운영자 |
| `world_inventory` | 목장이 가진 물건 `(group_id, item_id, qty)` | 그 목장 리더 · 목사님 · 운영자 |
| `world_villages` | 목장 마을: `fence` · `slots[7]` · **`rooms`** jsonb(자리 번호 → 집 안 열 칸, v0.30) | 앱 사용자(꾸민 것이 보여야 보상) |
| `world_streak_freezes` | 연속 지키기 쿠폰으로 지킨 주 | 그 목장 리더 · 목사님 · 운영자 |
| `world_avatars` | 사람 생김새 `look` jsonb(1KB 이하 객체) | 본인만(다른 사람 것은 `world_state().people` 로만) |
| `world_room_shots` | 목장 집 안 사진 WebP 1KB~600KB (v0.31) | 앱 사용자 |
| `world_avatar_shots` | 내 아바타 사진 WebP 1KB~600KB (v0.31) | 본인만 |

| 함수 | 누가 | 하는 일 |
|---|---|---|
| `world_state()` stable | 앱 사용자 | 물건 · 모든 마을(+rooms) · 내 목장(열매 · 가진 것) · 내 생김새 · 규칙 · 다른 사람 생김새(목장마다 최근 셋 · 목사님 하나, 이름 · id 없이) |
| `world_summary()` stable | 앱 사용자 | 홈용 — 열매 · 쿠폰 · 지킬 수 있는 주 · 이번 학기 사용 수 |
| `world_buy(item)` | 목장 리더 | 잔액 검사 · 울타리 · 소품은 한 번 · 쿠폰은 보유 한도 |
| `world_use_freeze(week, buy)` | 목장 리더 | 놓친 주 지키기(없으면 같은 거래에서 사기) |
| `world_set_village(fence, slots[7])` | 목장 리더 | 마을 자리에는 house · nature · prop 만, 가진 수만큼. 집이 없어진 자리의 방은 지운다 |
| `world_set_room(house, slots[10])` | 목장 리더 | 그 자리에 집이 있어야, 바닥 1~8 · 벽 9~10 에 맞는 가구, 모든 집 안 합쳐 가진 수만큼 (v0.30) |
| `world_save_look(look)` | 앱 사용자 본인 | 소품은 내 목장이 가진 것만 |
| `world_set_room_shot(image)` | 목장 리더 | 우리 목장 집 안 사진 (v0.31) |
| `world_set_avatar_shot(image)` | 앱 사용자 본인 | 내 아바타 사진 (v0.31) |

적립은 트리거 `world_on_report_submitted`(보고서 첫 제출), 시작 상태는 `world_on_group_created`(목장 insert). 실시간 함께 걷기는 DB 에 저장하지 않고 Realtime 사설 채널 `world:lobby` 의 `realtime.messages` 정책(앱 사용자만, broadcast · presence 만)으로만 들어온다(v0.29).

### 3.12 pastor_digests · pastor_digest_feedback — AI 주간 정리 (v0.35)

**pastor_digests** — 주마다 한 줄

| 컬럼 | 타입 | 비고 |
|---|---|---|
| week_key | date | PK. 그 주 시작일(일요일) |
| status | text | `pending` 만드는 중 · `ready` · `failed`. `ready` 면 content 가 있어야 한다(제약) |
| content | jsonb | 정리 본문 — 네 칸(highlights · thanks · groups · intercession)과 보낸 수 · 버린 수. **이름 없이** 자리표시 `{{p:<person id>}}` · `{{g:<group id>}}` 로, 근거는 `weekly_records` id · 목장 id. 화면이 목사님 세션(RLS)으로 이름을 붙인다 |
| model | text | 쓴 모델(`claude-sonnet-5-5` 등) |
| input_tokens · output_tokens · ms | integer | 토큰 · 걸린 시간 |
| generated_at | timestamptz | 정리를 만든(저장한) 때. 이 뒤에 내거나 고친 보고서가 다시 만들기 대상 (v0.36) |
| report_count · group_count | integer | 넣은 제출 보고서 수 · 그때 목장 수 — "12개 목장 중 9개 기준" (v0.36) |
| regen_count | integer | 다시 만든 횟수, 0~3 (v0.36) |
| fail_reason | text | 실패 까닭 — 짧은 영문 코드만(`^[a-z_]{1,40}$`). 본문 · 기도제목을 남기지 않는다 |
| created_by | uuid | 만든 목사님 계정(`users`, 지우면 null) |
| created_at · updated_at | timestamptz | |

**pastor_digest_feedback** — 항목마다 도움 됨 / 아님

| 컬럼 | 타입 | 비고 |
|---|---|---|
| week_key | date | `pastor_digests` 참조, cascade |
| item_key | text | 항목 키(`h:0` · `g:<목장 id>` 꼴, `^[a-z]{1,3}:[0-9a-f-]{1,36}$`) |
| user_id | uuid | 기본 `current_user_id()` |
| helpful | boolean | 도움 됨 / 아님. null = 고르지 않음 (v0.36) |
| wrong | boolean | 틀린 내용 신고, 기본 false (v0.36) |
| updated_at | timestamptz | |

PK (week_key, item_key, user_id).

**권한**

| 대상 | 읽기 | 쓰기 |
|---|---|---|
| `pastor_digests` | **목사님만**(`pastor_digests_read` — `is_pastor()`). 운영자 · 리더 · 임원진은 0행 | 정책 없음 — `digest_claim` · `digest_save` 만 |
| `pastor_digest_feedback` | 목사님 본인 것 | 목사님 본인 것 insert · update |
| `persons.ai_excluded` | persons 원본 범위(§4.3a) | 목사님 · 운영자(트리거) |

**함수** (둘 다 security definer · `search_path = ''` · 목사님만, 아니면 42501 · `anon` 실행 권한 없음)

| 함수 | 하는 일 |
|---|---|
| `digest_claim(p_week date) → boolean` | 만들기 차지. 일요일이 아니거나 이번 주보다 뒤면 22023(v0.37 전에는 마감 전이면 22023). 제출된 보고서가 없으면 false(v0.36). 처음이면 `pending` 으로 넣고 true. 이미 있으면 멈춘 `pending`(5분) · `failed`(10분)만 다시 차지하고 true, 아니면 false(누가 만드는 중이거나 이미 있다) |
| `digest_save(p_week, p_ok, p_content, p_model, p_input_tokens, p_output_tokens, p_ms, p_fail_reason, p_report_count, p_group_count)` | 차지한(`pending`) 줄에만 결과를 남긴다. 성공이면 `ready` + content(객체여야 한다) + 만든 때 · 수, 다시 만든 것이면 그 주 피드백을 지운다. 실패면 처음 만들기는 `failed` + 까닭 코드(없으면 `unknown`), 다시 만들기는 앞 정리로 `ready` + 까닭. 차지 안 된 주면 22023 (v0.36) |
| `digest_regen(p_week date) → boolean` | 다시 만들기 차지 — 앞 정리가 있고 그 뒤 새로 내거나 고친 제출 보고서가 있고 3번 안이면 `pending` + 횟수 하나 더, true. 만드는 중이면 false. 아니면 22023 (v0.36) |
| `digest_health()` stable | **운영자만**(그 밖은 0행). 이번 주부터 4주의 상태 · 실패 까닭 · 버린 수 · 보고서 수만 — 내용 없음 (v0.36, 기간 v0.37) |

만드는 서버 코드는 관리자 키를 쓰지 않는다 — 목사님 세션으로 `weekly_records_visible` · `reports` · `persons`(이름 · 목장 · `ai_excluded` · 상태)를 읽고 위 두 함수를 부른다(`src/lib/ai/digest.ts`).

---

### 3.13 chat_quota_* — 구구 챗봇 질문 횟수 (v0.43)

| 표 | 칸 | 읽기(RLS) | 쓰기 |
|---|---|---|---|
| `chat_quota_months` | `user_id` · `month`(그달 1일, 한국 시간) PK, `used`, `bonus`, `updated_at` | 본인 행 | 함수만 |
| `chat_quota_holds` | `id`, `user_id`, `month`, `created_at`, `done_at` — 답을 기다리는 질문의 예약 | 없음 | 함수만 |
| `chat_quota_requests` | `id`, `user_id`, `month`, `status`(`auto` · `pending` · `approved` · `rejected`), `amount`(5 · 10 · 20), `reason`(≤100), `created_at`, `decided_at`, `decided_by` | 본인 행 + 운영자 | 함수만 |

- 한도 = `chat_quota_base()`(20) + `bonus`. 달은 `chat_month_of(ts)` = `date_trunc('month', ts at time zone 'Asia/Seoul')`. 대기 신청은 한 사람 한 달에 하나(부분 고유 색인).
- 세는 대상은 `chat_quota_kind()` — 목사님 `pastor`(세지 않음, 행을 만들지 않는다) · 명단상 리더(운영자 겸임 포함) `leader` · 그 밖 null(챗봇을 못 씀).

| 함수 | 누가 | 하는 일 |
|---|---|---|
| `chat_quota_status()` | 리더 · 목사님 | 이번 달 쓴 횟수 · 한도 · 첫 신청 가능 · 대기 여부 · 마지막 신청 상태(목사님은 unlimited) |
| `chat_quota_reserve()` | 리더 · 목사님 | AI 를 부르기 전 — 행을 잠그고 `used + 살아 있는 예약 < 한도` 일 때만 예약. 다 썼으면 hold 없음(서버는 Anthropic 을 부르지 않는다) |
| `chat_quota_commit(hold)` | 본인 | 답을 받았다 — 예약을 닫고 `used + 1`. 남의 · 닫힌 · 3분 지난 예약이면 아무 일 없음 |
| `chat_quota_release(hold)` | 본인 | 답을 못 받았다(오류 · 거절 · 시간 초과 · 나감) — 예약만 닫는다 |
| `request_chat_quota(reason)` | 리더 | 다 썼을 때만. 그달 첫 신청은 `auto` +5, 아니면 `pending`(사유 선택 · 100자) |
| `list_chat_quota_requests()` · `chat_quota_pending_count()` | 운영자 | 이번 달 대기 목록(이름 · 목장 · 쓴/한도 · 사유 · 시각 · 본인 신청) · 대기 수(승인 배지에 더한다) |
| `decide_chat_quota_request(id, amount)` | 운영자 | 5 · 10 · 20 이면 승인(그 달 `bonus` +), null 이면 거절. 본인 · 지난달 · 처리된 신청은 못 한다. 신청자 id 를 돌려준다(웹 푸시) |

- 예약은 3분(`chat_quota_hold_ttl()`) 지나면 무효 — 서버가 확정도 취소도 못 하고 죽은 경우. 응답 최대 시간 60초.
- 프리뷰 분류(`rpc-classes.json`): status · list · pending_count 는 readOnly, 나머지는 write.

## 4. 권한 정책

### 4.1 역할 5단계와 열람 범위 ★

`pending / leader / pastor / admin / officer` (v0.34 에서 officer 추가). 임원진 표시는 역할 값과 별도로 `users.is_officer` — 리더 겸 임원진은 `leader` + `is_officer`.

| 역할 | 볼 수 있는 것 | 할 수 있는 것 |
|---|---|---|
| **pending** 미승인 | 청년부 프로필 | 신청(리더 `apply_for_person` · 목사님/임원진 `request_role`) |
| **leader** 리더 | + 목장 프로필 전체 · 전체 명단(`persons_public` · `roster_people()` · `needs_check_people()`) · **자기 목장의** 보고서·주간기록(사유 칸 포함)·코멘트 · 자기 목장 명단 원본 · 로뎀 월드 | 주간기록 R/W · 목장 프로필 편집 · 자기 목장 사람 칸 · 섬김 부서 · 마을 고치기 · 자기 목장에 양 넣기 · 자기 목장 내보내기(`log_export` · `log_roster_export(목장)`) · 열매 · 상점 · 마을/집 안 꾸미기 |
| **pastor** 목사님 | 전체 | 코멘트 · 삭제 · 휴면 승인 · 사람 칸 · 섬김 부서 · 마을 고치기 · 어느 목장이든 양 넣기 · 전체 내보내기(보고서 · 명단). 맡은 목장이 없어 열매를 쓰거나 꾸미지 않는다. 계정 승인은 하지 않는다 |
| **admin** 운영자 | 관리 대상 전체. **보고서 본문은 못 본다** — 단, **명단상 리더인 운영자는 자기 목장을 리더로서** 본다(겸임, 아래) | 명단·목장·프로필 관리 · `care_status` · **신청 승인·거절(운영자만)** · 전체 명단 엑셀 · **계정 연결 해제**(`unlink_person_account(person_id, disable)` — 계정은 pending 으로, 리더 권한 해제, 걸린 신청 거절, `events.account_unlinked` 기록; `disable=true` 면 남의 계정이었던 경우로 보고 잠근다) |
| **officer** 임원진 (v0.34) | + 목장 프로필 · **명단 원본 전체**(`persons_select` 의 `is_officer()`) · 섬김 부서 전체 · 로뎀 월드 구경. **보고서 · 주간기록 · 기도제목 · 사유는 못 본다** | 전체 명단 엑셀(`log_roster_export(null)`). 명단을 고치지 않는다 |

리더 겸 임원진(`leader` + `is_officer`)은 리더 권한 전부에 임원진의 전체 명단 읽기 · 전체 명단 엑셀이 더해진다. 그래도 다른 목장 보고서는 못 본다.

**리더는 역할이 아니라 명단에서 온다.** `users.role` 은 값 하나라 admin 이 leader 를 대체하는데, 운영자(당분간 한 명)가 3목장 리더이기도 하다. 그래서 리더 권한은 "role 이 leader 또는 admin" **그리고** "명단에서 그 목장의 리더" 일 때다. 운영자라도 명단에서 리더가 아니면 본문에 손대지 못한다. **앱의 승인은 임명이 아니라 신원 확인**이다 — 명단에 리더로 올라 있는 사람과 로그인한 계정이 같은 사람인지 확인하는 절차. 그래서 신청은 **운영자만** 확인하고, 리더 신청의 결과는 곧바로 leader 다(목사님 · 임원진 신청은 v0.34 — §3.4). 목사님은 승인하지 않는다 — 보고서를 보러 들어오시지 계정을 승인하러 들어오시지 않으므로, 쓰지 않을 권한을 주면 실수 경로만 는다.

**미승인 계정에게 출석·보고서는 존재하지 않는다.** `reports` · `weekly_records` · `comments` 에는 `pending` 을 위한 정책이 하나도 없다. 테이블 권한은 `authenticated` 전체에 주고 행만 정책으로 거르므로, 미승인 계정의 조회는 **오류 없이 0행**이 나온다 — 빈 테이블과 구분되지 않는다(원칙 ⑤). 청년은 계정 자체가 없다(v0.7).

### 4.2 판정 기준은 '작성 시점 목장'

v0.2 와 같다. 리더의 접근은 `weekly_records.group_id_at_write` 가 자기 현재 소속과 일치할 때만 열린다. 사람이 옮기면 새 목장 리더는 이전 시절 기록을 보지 못하고, 이전 목장 리더는 당시 기록을 계속 본다. 이름은 공개 뷰로 계속 조회되므로 누구의 기록인지는 알 수 있다.

### 4.3 열람 범위 원칙 (v0.6)

> **모든 기도제목과 나눔은 목장 안에서만 다룬다. 목사님은 사역자이므로 전체를 보신다.**

이것이 전부이고, 위 §4.1 의 정책이 그대로 강제한다 — `weekly_records` · `reports` · `comments` 의 행은 자기 목장 리더와 목사님에게만 보인다. 행이 보이면 본문도 그대로 보인다. 민감/비민감 같은 항목별 구분은 두지 않는다.

AI 정리(`pastor_digests`, v0.35)는 이보다 좁다 — **목사님만** 읽는다. 리더도 자기 목장 것을 보지 않고, 운영자도 읽지 않는다(§3.12).

`weekly_records_visible` 뷰가 남아 있는 이유는 컬럼 권한이다. 원본은 본문 컬럼(`prayer_request` · `prayer_status` · `note`)과 v0.33 의 출석 칸(`worship_online` · 사유 세 칸)의 select 권한을 주지 않으므로, 이것들을 읽는 유일한 경로가 이 뷰다. 사유는 목사님께 드리는 것이라 기도제목과 같은 범위다. 임원진은 이 뷰에서 0행이다(v0.34 — 바꾸지 않았다).

### 4.3a 노출 범위가 다른 곳 — 공개 뷰 · 보기 전용 함수

| 경로 | 내용 | 접근 |
|---|---|---|
| `persons_public` 뷰 | id · 이름 · 성별 · 소속 · 목장 내 역할 · 목장장 여부. 이탈자 제외 | **승인된 전원** = 리더·목사님·운영자·임원진 (`is_app_user()`) |
| `weekly_records_visible` 뷰 | 주간기록 읽기 경로. §4.3 의 컬럼 가리기 적용, 사유 칸 포함 | 리더(자기 목장)·목사님 |
| `roster_people()` (v0.28) | 운영 중인 목장의 사람(떠난 사람 포함) — id · 이름 · 목장 · 역할 · 목장장 · 상태 · 태그 · 확인 필요 · 계정 있음. 연락처 · 생년 · 계정 id · 기록 없음 | 승인된 전원, 보기만 |
| `needs_check_people()` (v0.28) | '확인 필요' 인 활동 중인 사람 — 이름 · 목장 · 리더/양 | 승인된 전원, 보기만 |

`persons` 원본(생년월일 · 비고 등 v0.32 칸 포함)은 소속 목장 리더·목사님·운영자·**임원진**(v0.34), 그리고 **본인**이 읽는다. 두 함수는 persons RLS 가 리더에게 자기 목장만 보이게 하므로 그 목록만 definer 로 연 것이다(v0.28).

두 뷰 모두 `security_invoker = false` — 소유자 권한으로 돌아 원본의 RLS 를 통과하므로, 필요한 제한은 뷰 정의 안에 직접 쓴다. 판정은 원본 정책과 **같은 헬퍼 함수**를 쓴다.

### 4.3b 헬퍼 함수

전부 `SECURITY DEFINER` + `search_path = ''`. 정책이 `users` · `persons` 를 읽어야 하는데 그 테이블에도 정책이 걸려 재귀가 생기기 때문이다. 반환값은 식별자·불리언뿐이다.

| 함수 | 반환 |
|---|---|
| `current_user_id()` · `current_app_role()` | 본인 계정 · 앱 권한 |
| `current_person_id()` · `current_group_id()` | 연결된 명단상 사람 · 그 사람의 목장 |
| `is_app_user()` | 승인된 사용자인가 — role ∈ (leader, pastor, admin, officer). `pending` 만 거른다 (officer 는 v0.34) |
| `is_officer()` | 임원진인가 — 활성 · 승인된 계정의 `users.is_officer` (v0.34) |
| `is_leader_of(uuid)` | 그 목장에 리더로서 접근할 수 있는가 — **명단이 기준**: `role in (leader, admin)` 이고 연결된 사람이 그 목장의 활동 중 리더. 운영자 겸임은 이 한 줄로 성립하고, 명단에서 리더를 내리면 앱 권한도 그 즉시 끝난다 (2026-09-27, `tests/rls/roster-leader.test.mjs`) |
| `is_pastor()` · `is_admin()` | |

### 4.4 집계는 별도 경로

v0.2 와 같다. 사각지대·관계 밀도는 그 사람의 전체 기록으로 계산하되 결과값만 반환한다. **리더도 판정 대상에 포함된다.** 조회 결과에 `group_role` 을 붙여 역할로 구분할 수 있게 한다.

| 함수 | 판정 | 접근 |
|---|---|---|
| `care_blind_spots(week, now)` **v2** (v0.33) | 사각지대 = `absent_streak`(창의 최근 두 주 모두 결석, 1대1 접촉이 있어도) **∪** `meeting_gap`(창 4주 목장 모임 0회, 온라인 예배도 불참). `contact_gap` · `contact_leaders` 는 값만 남고 **기준이 아니다.** `last_worship_week` 추가 | 목사님 전체 · 리더 자기 목장 |
| `care_density(week, now)` | 관계 밀도 (v0.14) | 같음 |
| `care_gender_balance()` | 목장 × 성별 (v0.15) | 목사님 · 운영자 전체 · 리더 자기 목장 |
| `group_streaks(week, now)` | 연속 정시 제출 (v0.11, 쿠폰으로 지킨 주는 건너뜀 v0.24) | 목사님 전체 · 리더 자기 목장 |

창은 `care_window()` — 마감이 지난 최근 4주, 휴주 제외. 임원진은 리더도 목사님도 아니면 0행이다.

### 4.5 강제 계층

v0.2 와 같다. 애플리케이션이 아니라 RLS 다.

### 4.6 구현 상태

뼈대는 `..._persons_and_roles.sql` 과 `..._apply_helpers.sql` 에 있고, 그 뒤 마이그레이션이 정책을 하나씩 바꿨다(`persons_insert` v0.32 · `persons_select` v0.34 등 — §0).

- public 의 모든 테이블에 `enable row level security` 를 마이그레이션에 명시(새 테이블도 만드는 파일에서 바로)
- `force row level security` 는 걸지 않는다 — 공개 뷰가 소유자 권한으로 돌아야 한다
- `anon` 에는 권한을 전부 회수. 모든 정책은 `to authenticated`
- **`authenticated` ≠ 우리 사용자.** 로그인만 한 사람(`pending`)도 `authenticated` 다. 그래서 "전원 공개" 정책은 `using (true)` 가 아니라 `is_app_user()` 로 쓴다
- `applications` 는 읽기만 직접 하고 쓰기는 RPC 로만 (`apply_for_person` · `request_role` · `approve_application` · `reject_application`)
- 로뎀 월드 표 · 배경 사진 표 · `export_logs` 는 select 만 열고 쓰기는 definer 함수로만(§3.8 · §3.11)
- 보고서 쓰기는 `submit_report` · `open_report` 로만 — 두 표에 직접 쓰는 권한이 없다(2026-11-04). 셋(`touch_report_presence` 포함) 모두 DEFINER 이며 안에서 `is_leader_of` 를 직접 검사하고, 앞의 둘은 이번 주보다 뒤 주차를 막는다. 새 보고서 행 만들기와 처음 제출은 이번 주와 그 앞 3주만 — 그보다 앞 주는 이미 있는 보고서만 열고, 이미 낸 것만 고친다(2026-11-04)

### 4.7 검증

`tests/rls/` 에 33개 파일 450건(2026-10-31, 전부 통과). `npm run test:rls`.

테스트는 실제 정책 경로를 탄다 — `service_role` 우회 없이 역할을 `authenticated` 로 바꾸고 JWT 클레임을 심어 각 사용자로 가장한다. DB 는 PGlite(WASM Postgres)로 매번 빈 상태에서 마이그레이션과 시드를 새로 적용한다.

핵심 케이스 — pending 은 청년부 프로필 외 0행 · 미승인 계정은 주간기록에 **오류 없이 0행** · 목장 리더·목사님은 승인 불가(운영자만) · 신청 목록은 리더뿐, 연결된 리더는 점유 표시 · 청년 person 에 계정 불가 · 한 사람에 계정 둘 불가 · 운영자 겸임 · 자기 접촉은 저장 시 `false`. (`leaders-only` · `person-link` · `roster-leader` · `application` 테스트)

v0.5(Step 4) — 다른 목장 리더는 `submit_report` · `open_report` 에서 막힘 · 같은 목장 리더는 다른 리더가 쓴 본문을 읽음 (A) · 출석만 고치면 `prayer_request` 에 UPDATE 가 나가지 않음 (B, 트리거 탐침) · 행 단위 충돌 · 완결성 실패는 전체 롤백 · 지각은 첫 제출 기준 · 휴주 거부.

**선택 항목이 비어 있을 때** — 예배만·결석의 기도제목 빈칸, 빈칸과 입력이 번갈아 나오는 순서, 1대1 전원 미체크, 특이사항 빈칸·지우기·건드리지 않기, 전원 결석, 기존 기도제목 지우기, 필드 없는 새 행. 브라우저 검증에서 빈 기도제목이 앞 사람의 것을 물려받던 버그(`submit_report` 의 루프 변수 미초기화)가 나온 뒤 이 축을 통째로 덮었다. 수정 전 6건 실패 → 수정 후 전부 통과.

**변이 테스트.** 정책 하나만 깨면 겹친 다른 정책이 대신 막아 테스트가 통과한다 — `SELECT ... FOR UPDATE` 는 UPDATE 정책도 통과해야 하고, UPDATE 의 WHERE 는 SELECT 정책을 거친다. `reports` 의 select+update, `weekly_records` 의 select+update 를 **함께** `using (true)` 로 바꾸면 해당 테스트가 실패한다. 방어가 겹쳐 있다는 뜻이다.

> 이 테스트는 정책을 검증하지, 배포된 프로젝트를 검증하지 않는다. OAuth 왕복과 화면 흐름은 09 문서의 수동 절차로 확인한다.

---

## 5. 인원 변동 처리

| 상황 | 처리 |
|---|---|
| 새 사람 등록 | `persons` 에 행 추가 — 운영자, 또는 양 · 계정 없음 꼴로 그 목장 리더 · 목사님(v0.32) |
| 목장 이동 | `persons.group_id` 변경. 그게 전부다 |
| 리더 임명 | `persons.group_role = leader` (운영자) → 본인이 로그인해 리더 신청 → 운영자 승인 → `leader` |
| 리더 사임 | 계정이 붙어 있으면 먼저 `unlink_person_account` 로 떼고(계정은 pending) `group_role = member` 로 내린다 — 계정 있는 리더를 바로 청년으로 내리면 23514(트리거 `persons_member_has_no_account`, v0.7). `is_leader_of` 가 명단 기준이라 접근이 즉시 끊긴다 |
| 임원진 | 본인이 `request_role('officer', [리더면 내 이름])` → 운영자 승인 (v0.34) |
| 휴직 · 졸업 · 입대 | `persons.status` 를 `dormant` / `left` 로 |
| 기록 제외 | `set_person_recording(person_id, false)` → `opted_out` (운영자, v0.10) |
| 목장 해산 | `groups.status = disbanded`. 행은 지우지 않는다 |

`weekly_records` 는 건드리지 않는다. `group_id_at_write` 가 박혀 있으므로 소속만 바꾸면 접근권은 자동으로 재계산된다.

---

## 6. 인덱스

| 테이블 | 인덱스 | 용도 |
|---|---|---|
| `weekly_records` | (person_id, week_key) · (group_id_at_write, week_key) · (author_id, week_key) · (report_id) · (prev_record_id) 부분 | 사각지대 · 권한 · 참여 리더 · 화면 · 이어보기 |
| `reports` | (group_id, week_key) 유일 | 제출률 |
| `persons` | (group_id) · (status) · (user_id) 부분 · (월, 일) 식 | 명단 · 분모 · 연결 · 생일 |
| `applications` | (user_id) 부분 유일(pending) · (group_id) 부분(pending) · (person_id) | 한 건 제한 · 승인 화면 |
| `users` | (provider, provider_uid) 부분 유일 | 소셜 계정 중복 방지 |
| `comments` · `events` · `export_logs` | v0.2 와 같다 | |
| `person_ministries` | (person_id, ministry_id) 기본키 · (ministry_id) | 사람별 · 부서별 (v0.32) |
| `world_ledger` | (group_id) · 부분 유일 — 제출 적립 (group_id, week_key) · 보너스 (group_id, week_key) · 시작 (group_id) | 잔액 합계 · 주마다 한 번 (v0.23) |

80명 × 52주 = 연간 4천 행 수준. **성능 문제는 없다.** 인덱스는 권한 검사 경로를 단순하게 만들기 위한 것이다.

---

## 7. 보존 및 파기

`weekly_records` · `reports` **24개월 후 삭제** · `events` 12개월 후 삭제 · `export_logs` 영구 보존 · 이탈자는 상태만 전환.

**약속은 DB 에 박혀 있다** (2026-09-29): `app_meta.retention_months = 24`. `records_past_retention()` 이 만료된 기록 수를 돌려주고, **2026-10-06 부터 pg_cron 이 매월 2일 03:00 KST 에 `purge_expired_records()` 로 지운다**(v0.20). 첫 만료는 2028년 10월이라 그 전까지는 매달 0건을 지운다. 운영 홈의 '보관 만료' 카드가 남은 만료 수와 마지막 정리 날짜를 보여준다 — 만료 수가 0 이 아니거나 마지막 정리가 한 달보다 오래면 작업이 멈춘 것이다. 07 §0 공지의 "2년" 은 이 값이다; 바꾸려면 공지도 같이 바꾼다.

출석 사유 세 칸(v0.33)은 `weekly_records` 의 칸이라 같은 기준으로 함께 지워진다.

구구 챗봇 추가 신청의 사유 글(`chat_quota_requests.reason`, v0.43)은 다음 달이 되면 지운다 — 신청 · 처리 함수가 돌 때 지난달 사유를 함께 비운다(`chat_quota_purge_reasons`). 쓴 횟수 · 처리 기록은 사람 내용이 없어 남긴다. 대화 내용은 서버에 없다(폰에만).

AI 정리(`pastor_digests`, v0.35)도 같은 24개월 — `purge_expired_records()` 가 함께 지우고, 피드백은 cascade 로 따라간다. Anthropic 쪽 보관은 06 §4.12.

**기록 제외자(`opted_out`)의 과거 기록은 남긴다** (2026-09-29 결정). `set_person_recording(…, false)` 는 앞으로만 막는다. "기록되기를 원하지 않는다" 가 과거까지인지 우리는 모르고, 삭제는 되돌릴 수 없으므로 기본값이 아니다. 본인이 지난 기록 삭제를 명시적으로 원하면 운영자가 별도 SQL 로 지운다(09 §1.5) — 두 행위는 분리돼 있고 함수로 묶지 않는다.

---

## 8. 열린 질문

- 목장 프로필의 이미지 업로드 — Storage 버킷 설정 선행
- 청년부 프로필의 블록 구성 — 개발하며 구체화
- ~~Streak freeze 쿠폰의 데이터 구조~~ — v0.24 에서 닫음(`world_streak_freezes` · `world_use_freeze`)
- ~~포인트 원장~~ — v0.23 에서 닫음. 원장은 **목장 단위**(`world_ledger`)이고 개인 원장은 없다. 2026-09-27 의 "목사님 포인트는 무한" 안은 쓰지 않았다 — 목사님 · 운영자는 맡은 목장이 없어 사고 꾸미지 않으며, 목장 간 순위도 만들지 않는다
- 승인이 오래 밀리는 신청의 처리 — 리더에게 알림을 보낼지, 일정 기간 후 목사님에게 넘길지
- `events.person_id` — 2026-09-27 에 "누구를" 이 필요한 이벤트(`account_unlinked`)를 위해 추가했다. 다른 이벤트에는 아직 비어 있다

확정된 항목: 로그인은 카카오+구글 · 가입은 열어두고 신청·승인으로 연결(리더 · 목사님 · 임원진, 운영자 승인 — v0.34) · 역할 5단계(officer 추가) · 운영자 역할 · 마감 화요일 23:59 · 연락처는 컬럼만 두고 비움 · 생년월일 저장 · 휴면은 리더 신청 후 목사님 승인
