"""Run real Next commerce routes against migrations in a disposable local PostgreSQL database.

The HTTP fixture exposes only auth/profile role lookups, management RPCs, and the
rate-limit RPC. It uses synthetic keys and actors; it never loads repository env
files or contacts linked Supabase/storage services.
"""
import json
import os
import pathlib
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
INITDB = shutil.which("initdb") or "/opt/homebrew/opt/postgresql@17/bin/initdb"
if not pathlib.Path(INITDB).exists():
    raise SystemExit("Install PostgreSQL and put initdb/pg_ctl/psql on PATH.")
BIN = pathlib.Path(INITDB).parent
PSQL = str(BIN / "psql")

def run(args, **kwargs):
    result = subprocess.run(args, capture_output=True, text=True, **kwargs)
    if result.returncode:
        raise RuntimeError(result.stderr or result.stdout)
    return result.stdout

def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]

def wait_http(url, process, log_path, timeout=90):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if process.poll() is not None:
            tail = log_path.read_text(errors='replace')[-6000:] if pathlib.Path(log_path).exists() else ''
            raise RuntimeError(f"service exited early; see {log_path}\n{tail}")
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status == 200:
                    return
        except urllib.error.HTTPError as response:
            if response.code < 500:
                return
            time.sleep(0.3)
        except Exception:
            time.sleep(0.3)
    raise RuntimeError(f"service readiness timed out; see {log_path}")

# Keep the temporary app inside the ignored workspace so Turbopack can resolve
# the real dependency tree without broad filesystem roots or repository env files.
qa_parent = ROOT / "test-results"
qa_parent.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix="miro-commerce-integration-", dir=qa_parent) as temp:
    temp = pathlib.Path(temp)
    pg_port, fixture_port, next_port = free_port(), free_port(), free_port()
    data = temp / "pgdata"
    run([INITDB, "-D", str(data), "-A", "trust", "--no-locale"])
    run([str(BIN / "pg_ctl"), "-D", str(data), "-l", str(temp / "postgres.log"), "-o", f"-p {pg_port} -h 127.0.0.1", "start"])
    psql = [PSQL, "-h", "127.0.0.1", "-p", str(pg_port), "-d", "postgres", "-v", "ON_ERROR_STOP=1"]
    fixture = next_server = None
    fixture_log = temp / "fixture.log"
    next_log = temp / "next.log"
    try:
        run(psql, input="""
          create role anon;
          create role authenticated;
          create role service_role bypassrls;
          create schema auth;
          create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}'::jsonb);
          create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
          create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role',true),''), nullif(current_setting('role',true),'none')) $$;
          grant usage on schema auth, public to anon, authenticated, service_role;
          grant execute on function auth.uid() to anon, authenticated, service_role;
          grant execute on function auth.role() to anon, authenticated, service_role;
        """)
        for migration in sorted((ROOT / "supabase/migrations").glob("*.sql")):
            run(psql + ["-f", str(migration)])
        actors = {
            "admin": {"id": "00000000-0000-0000-0000-000000009901", "email": "fixture-admin@local.test", "name": "Fixture Admin", "token": "fixture-admin-token"},
            "ceo": {"id": "00000000-0000-0000-0000-000000009902", "email": "fixture-ceo@local.test", "name": "Fixture CEO", "token": "fixture-ceo-token"},
            "inactive": {"id": "00000000-0000-0000-0000-000000009903", "email": "fixture-inactive@local.test", "name": "Fixture Inactive Admin", "token": "fixture-inactive-token"},
        }
        seed = "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values " + ",".join(
            f"('{a['id']}','{a['email']}',now(),'{{\"full_name\":\"{a['name']}\"}}'::jsonb)" for a in actors.values()
        ) + ";"
        seed += " update public.user_roles set role='admin' where user_id='00000000-0000-0000-0000-000000009901'; update public.user_roles set role='ceo' where user_id='00000000-0000-0000-0000-000000009902'; update public.profiles set account_status='active' where id in ('00000000-0000-0000-0000-000000009901','00000000-0000-0000-0000-000000009902'); update public.user_roles set role='admin' where user_id='00000000-0000-0000-0000-000000009903'; update public.profiles set account_status='suspended' where id='00000000-0000-0000-0000-000000009903';"
        run(psql, input=seed)
        if os.getenv("DOCUMENT_PREVIEW_REVIEW"):
            # Synthetic stored draft for preview readback; never linked business records.
            identity = {"legal_name":"Fixture document business", "trade_name":"Fixture documents", "entity_kind":"company", "registration_number":"EXAMPLE-REG", "vat_number":"EXAMPLE-VAT", "address":{"street":"12 Example Street","city":"Example City","postal_code":"0000000","country":"IL"}, "phone":"+972-00-000-0000","email":"fixture@example.invalid","document_language":"he"}
            snapshot = {"items":[{"description":"Stored draft fixture / מסמך בדיקה", "quantity":1,"unit_price_agorot":10000,"discount_agorot":0,"net_agorot":10000,"vat_agorot":1800,"gross_agorot":11800}], "payment_references":[]}
            encode = lambda value: "'" + json.dumps(value, ensure_ascii=False).replace("'", "''") + "'::jsonb"
            run(psql, input="insert into public.fiscal_documents(id,document_type,state,business_snapshot,customer_snapshot,subtotal_agorot,vat_agorot,total_agorot,document_snapshot,idempotency_effect_key,created_by) values ('00000000-0000-4000-8000-000000009941','quote','draft'," + encode(identity) + "," + encode({"name":"Sample customer / לקוח לדוגמה"}) + ",10000,1800,11800," + encode(snapshot) + ",'document-preview-fixture','00000000-0000-0000-0000-000000009902');")
        if os.getenv("POS_REVIEW"):
            run(psql + ["-f", str(ROOT / "scripts/pos-review-fixtures.sql")])
        env = {key: os.environ[key] for key in ("PATH", "HOME", "TMPDIR", "LANG", "LC_ALL") if key in os.environ}
        env.update({
            "COMMERCE_PG_PORT": str(pg_port), "COMMERCE_PSQL": PSQL,
            "COMMERCE_FIXTURE_PORT": str(fixture_port), "COMMERCE_TEST_ACTORS": json.dumps(actors),
            "COMMERCE_FIXTURE_URL": f"http://127.0.0.1:{fixture_port}",
            "COMMERCE_TEST_PUBLISHABLE_KEY": "sb_publishable_commerce_fixture",
            "COMMERCE_TEST_SECRET_KEY": "sb_secret_commerce_fixture",
            "NEXT_PUBLIC_SUPABASE_URL": f"http://127.0.0.1:{fixture_port}",
            "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": "sb_publishable_commerce_fixture",
            "NEXT_PUBLIC_SUPABASE_ANON_KEY": "sb_publishable_commerce_fixture",
            "SUPABASE_SECRET_KEY": "sb_secret_commerce_fixture",
            "NEXT_PUBLIC_SITE_URL": f"http://127.0.0.1:{next_port}",
            "NEXT_TELEMETRY_DISABLED": "1", "NODE_ENV": "development",
        })
        if os.getenv("POS_FAST"):
            env["POS_FAST"] = os.environ["POS_FAST"]
        if os.getenv("POS_ENGINES"):
            env["POS_ENGINES"] = os.environ["POS_ENGINES"]
        if os.getenv("COMMERCE_OUTPUT_DIR"):
            env["COMMERCE_OUTPUT_DIR"] = os.environ["COMMERCE_OUTPUT_DIR"]
        if os.getenv("COMMERCE_RENDERER_FIXTURE_DIR"):
            env["COMMERCE_RENDERER_FIXTURE_DIR"] = os.environ["COMMERCE_RENDERER_FIXTURE_DIR"]
        with fixture_log.open("w") as log:
            fixture = subprocess.Popen(["node", str(ROOT / "scripts/commerce-fixture-server.mjs")], cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)
        wait_http(f"http://127.0.0.1:{fixture_port}/fixture/health", fixture, fixture_log)
        app_dir = temp / "next-app"
        app_dir.mkdir()
        for entry in ("src", "public", "assets", "node_modules", "package.json", "tsconfig.json", "next-env.d.ts", "postcss.config.mjs"):
            source = ROOT / entry
            if source.exists():
                if source.is_dir() and entry != "node_modules":
                    shutil.copytree(source, app_dir / entry)
                elif source.is_dir():
                    (app_dir / entry).symlink_to(source, target_is_directory=True)
                else:
                    shutil.copy2(source, app_dir / entry)
        config = (ROOT / "next.config.ts").read_text()
        config = config.replace("const nextConfig: NextConfig = {", f'const nextConfig: NextConfig = {{ distDir: ".next-ci", turbopack: {{ root: {json.dumps(str(ROOT.resolve()))} }},', 1)
        (app_dir / "next.config.ts").write_text(config)
        production = os.getenv("COMMERCE_PRODUCTION") == "1"
        next_cli = str(ROOT / "node_modules/.bin/next")
        if production:
            env["NODE_ENV"] = "production"
            next_log.write_text(run([next_cli, "build"], cwd=app_dir, env=env, timeout=300))
        with next_log.open("a" if production else "w") as log:
            command = [next_cli, "start"] if production else [next_cli, "dev", str(app_dir)]
            next_server = subprocess.Popen(command + ["--hostname", "127.0.0.1", "--port", str(next_port)], cwd=app_dir, env=env, stdout=log, stderr=subprocess.STDOUT)
        wait_http(f"http://127.0.0.1:{next_port}/api/management/commerce/settings", next_server, next_log, 150)
        node_env = env | {"COMMERCE_NEXT_URL": f"http://127.0.0.1:{next_port}"}
        try:
            script = "verify-document-previews.mjs" if os.getenv("DOCUMENT_PREVIEW_REVIEW") else "verify-pos-workspace.mjs" if os.getenv("POS_REVIEW") else "verify-commerce-workspaces.mjs"
            result = run(["node", str(ROOT / "scripts" / script)], cwd=ROOT, env=node_env, timeout=600)
            print(result)
        except Exception as error:
            fixture_tail = fixture_log.read_text(errors="replace")[-2000:]
            next_tail = next_log.read_text(errors="replace")[-10000:]
            evidence_dir = pathlib.Path(os.getenv("COMMERCE_OUTPUT_DIR", os.getenv("TMPDIR", "/tmp")))
            evidence_dir.mkdir(parents=True, exist_ok=True)
            (evidence_dir / "commerce-last-next.log").write_text(next_tail)
            raise RuntimeError(f"{error}\nfixture log:\n{fixture_tail}\nNext log copied to commerce-last-next.log") from error
        print(f"PASS disposable PostgreSQL → local Supabase HTTP fixture → actual {'production' if production else 'development'} Next commerce routes → browser cookie request")
    finally:
        for process in (next_server, fixture):
            if process and process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    process.kill()
        run([str(BIN / "pg_ctl"), "-D", str(data), "-m", "fast", "stop"])
