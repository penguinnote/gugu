/**
 * RLS 권한 테스트 하네스.
 *
 * 왜 이렇게 만들었나
 * ------------------
 * 권한 테스트는 **실제 정책 경로를 타야** 의미가 있다. service_role 로 우회해
 * 조회하면 정책이 틀려도 테스트는 통과한다. 그래서 각 사용자로 가장해서
 * RLS 가 적용된 상태로 검증한다.
 *
 * 가장하는 방법은 Supabase 가 프로덕션에서 하는 것과 같다.
 *   1) 역할을 authenticated 로 바꾸고 (set local role)
 *   2) JWT 클레임을 심는다 (request.jwt.claims)
 * 정책 안의 auth.uid() 가 그 클레임을 읽으므로, 실제 로그인과 동일한 경로가 된다.
 *
 * DB 는 PGlite(WASM Postgres)를 쓴다. Docker 없이 어디서나 돌고, 매번 빈
 * 상태에서 마이그레이션과 시드를 새로 적용하므로 결과가 재현된다.
 *
 * 한계 — 이 하네스는 **정책을 검증하지, 배포된 프로젝트를 검증하지 않는다.**
 * 마이그레이션이 원격에 적용됐는지는 별도로 확인해야 한다.
 */

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MIG_DIR = path.join(ROOT, "supabase/migrations");
const SEEDS = ["supabase/seed_accounts.sql", "supabase/seed.sql"].map((f) => path.join(ROOT, f));

/**
 * Supabase 가 프로젝트마다 기본 제공하는 것들. 마이그레이션이 이것들을 전제하므로
 * 테스트 DB 에도 같은 모양으로 만들어둔다. auth.uid() 정의는 Supabase 의 것과
 * 동일하게 맞춘다 — 여기가 어긋나면 테스트가 거짓으로 통과한다.
 */
const SUPABASE_STUBS = `
  create schema if not exists auth;

  create table if not exists auth.users (
    id                 uuid primary key,
    email              text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );

  -- OAuth 제공자별 신원. accept_invite() 가 여기서 provider 를 읽는다 —
  -- 클라이언트의 주장이 아니라 auth 스키마가 출처여야 하기 때문이다.
  create table if not exists auth.identities (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references auth.users (id) on delete cascade,
    provider        text not null,
    provider_id     text not null,
    last_sign_in_at timestamptz default now(),
    unique (provider, provider_id)
  );

  create or replace function auth.uid()
  returns uuid
  language sql
  stable
  as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
  $$;

  create or replace function auth.role()
  returns text
  language sql
  stable
  as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
    )
  $$;

  -- 현재 세션의 JWT 클레임. ensure_user() 가 app_metadata.provider 를 읽는다.
  create or replace function auth.jwt()
  returns jsonb
  language sql
  stable
  as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
  $$;

  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
      create role anon nologin noinherit;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
      create role authenticated nologin noinherit;
    end if;
    -- 서버 전용 키(SUPABASE_SECRET_KEY)의 역할. Supabase 처럼 RLS 를 우회한다 — 웹 푸시 발송(Step 7)이 쓴다.
    if not exists (select 1 from pg_roles where rolname = 'service_role') then
      create role service_role nologin noinherit bypassrls;
    end if;
  end $$;

  grant usage on schema public to anon, authenticated, service_role;
  grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated;
`;

/**
 * 시드 사용자에게 auth 계정을 붙인다.
 *
 * seed.sql 은 auth_user_id 를 null 로 둔다 — 실제 연결은 첫 로그인의
 * ensure_user() 가 한다. 테스트에서는 그 연결만 미리 흉내낸다.
 * 시드 파일 자체를 테스트용으로 오염시키지 않기 위해 여기서 따로 한다.
 */
const LINK_AUTH_USERS = `
  insert into auth.users (id) select id from public.users;
  insert into auth.identities (user_id, provider, provider_id)
  select u.id, coalesce(u.provider::text, 'google'), 'seed-identity-' || u.id
  from public.users u;
  update public.users set auth_user_id = id;
`;

export async function createTestDb() {
  const db = new PGlite();

  await db.exec(SUPABASE_STUBS);

  const files = readdirSync(MIG_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    await db.exec(readFileSync(path.join(MIG_DIR, f), "utf8"));
  }

  // Supabase 는 service_role 에 public 의 모든 테이블 권한을 기본으로 준다(RLS 도 우회). 같게 맞춘다.
  await db.exec(`grant select, insert, update, delete on all tables in schema public to service_role;
                 grant usage, select on all sequences in schema public to service_role;
                 grant execute on all functions in schema public to service_role;`);

  for (const f of SEEDS) await db.exec(readFileSync(f, "utf8"));
  await db.exec(LINK_AUTH_USERS);

  // 이름 → auth.users.id 매핑. 테스트에서 "권다움으로 조회" 처럼 쓴다.
  const { rows } = await db.query(
    `select name, auth_user_id from public.users order by name`,
  );
  const authIdByName = Object.fromEntries(
    rows.map((r) => [r.name, r.auth_user_id]),
  );

  return { db, authIdByName, migrations: files };
}

/**
 * 특정 사용자로 가장해서 쿼리를 실행한다.
 *
 * 트랜잭션으로 감싸고 기본은 롤백한다. 역할 전환과 클레임이 다음 테스트로
 * 새지 않게 하고, 쓰기 테스트가 뒤 테스트의 전제를 바꾸지 않게 하기 위함이다.
 * 결과가 남아야 하는 경우에만 `{ commit: true }` 를 준다.
 */
export async function asUser(ctx, name, fn, opts) {
  const authId = ctx.authIdByName[name];
  if (!authId) throw new Error(`시드에 없는 사용자: ${name}`);
  return runAs(ctx, "authenticated", { sub: authId, role: "authenticated" }, fn, opts);
}

/**
 * 시드에 없는 auth 계정으로 실행한다.
 *
 * "방금 구글 로그인을 마친 낯선 사람" 을 흉내내기 위한 것이다.
 * auth 세션은 있지만 public.users 에 아직 행이 없는 상태다 — ensure_user()
 * 가 그 행을 만들기 전까지는 아무것도 못 한다.
 */
export async function asAuthUser(ctx, authId, fn, opts) {
  return runAs(ctx, "authenticated", { sub: authId, role: "authenticated" }, fn, opts);
}

/** 서버 전용 키(service_role)로 실행한다 — 발송 배치·서버 액션의 관리자 클라이언트. */
export async function asService(ctx, fn, opts) {
  return runAs(ctx, "service_role", { role: "service_role" }, fn, opts);
}

/** 비로그인 사용자로 실행한다. */
export async function asAnon(ctx, fn, opts) {
  return runAs(ctx, "anon", { role: "anon" }, fn, opts);
}

/**
 * OAuth 가입만 끝난 상태를 만든다 — auth.users 와 auth.identities 에는 행이
 * 있지만 앱 계정(public.users)은 아직 없는 상태.
 */
export async function createUnlinkedAuthUser(ctx, provider = "google", name = "낯선사람") {
  const { rows } = await ctx.db.query(
    `insert into auth.users (id, email, raw_user_meta_data)
     values (gen_random_uuid(), $1, jsonb_build_object('full_name', $2::text))
     returning id`,
    [`${provider}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`, name],
  );
  const authId = rows[0].id;
  await ctx.db.query(
    `insert into auth.identities (user_id, provider, provider_id)
     values ($1, $2, $3)`,
    [authId, provider, `oauth-uid-${authId}`],
  );
  return authId;
}

async function runAs(ctx, dbRole, claims, fn, { commit = false } = {}) {
  const { db } = ctx;
  await db.exec("begin");
  let ok = false;
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(claims),
    ]);
    await db.exec(`set local role ${dbRole}`);
    const result = await fn(db);
    ok = true;
    return result;
  } finally {
    // 기본은 롤백이다. 읽기 테스트가 서로의 전제를 바꾸지 않게 하기 위함이고,
    // set local role 과 클레임도 함께 원복된다.
    //
    // 초대 수락처럼 결과가 남아야 하는 테스트만 commit: true 를 쓴다.
    // SET LOCAL 은 커밋에서도 원복되므로 역할이 새지는 않는다.
    await db.exec(ok && commit ? "commit" : "rollback");
  }
}

/**
 * 쿼리가 권한 오류로 거부되는지 확인한다.
 * 거부되면 에러 코드를, 통과하면 null 과 행을 돌려준다.
 */
export async function attempt(db, sql, params = []) {
  try {
    const r = await db.query(sql, params);
    return { error: null, rows: r.rows, affected: r.affectedRows ?? r.rows.length };
  } catch (e) {
    return { error: e.message, code: e.code ?? null, rows: null };
  }
}

/**
 * '이번 주' 를 테스트 안에서 옮긴다(2026-11-04). open_report · submit_report 는 이번 주(kst_current_week)
 * 보다 뒤 주차를 막는데, 마감 전 상태를 보려는 테스트는 시드의 다음 주(미래)를 쓴다.
 * 그런 파일에서만 부른다 — 진짜 오늘 기준의 막기는 report-guard.test.mjs 가 본다.
 */
export async function setCurrentWeek(ctx, weekKey) {
  await ctx.db.query(
    `create or replace function public.kst_current_week() returns date
       language sql stable set search_path = '' as $$ select date '${weekKey}' $$`,
  );
}
