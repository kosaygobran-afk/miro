"""Run migrations and access-control tests in disposable local PostgreSQL.

Requires PostgreSQL server binaries on PATH or Homebrew PostgreSQL 17.
Never connects to the linked Supabase project.
"""
import pathlib
import shutil
import socket
import subprocess
import tempfile

root = pathlib.Path(__file__).resolve().parents[1]
initdb = shutil.which("initdb") or "/opt/homebrew/opt/postgresql@17/bin/initdb"
bin_dir = pathlib.Path(initdb).parent
if not pathlib.Path(initdb).exists():
    raise SystemExit("Install PostgreSQL and put initdb/pg_ctl/psql on PATH.")


def run(args, **kwargs):
    result = subprocess.run(args, capture_output=True, text=True, **kwargs)
    if result.returncode:
        raise RuntimeError(result.stderr or result.stdout)
    return result.stdout


with tempfile.TemporaryDirectory(prefix="miro-db-tests-") as directory:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    data = str(pathlib.Path(directory) / "data")
    run([initdb, "-D", data, "-A", "trust", "--no-locale"])
    run([str(bin_dir / "pg_ctl"), "-D", data, "-l", directory + "/postgres.log", "-o", f"-p {port} -h 127.0.0.1", "start"])
    sql = [str(bin_dir / "psql"), "-h", "127.0.0.1", "-p", str(port), "-d", "postgres", "-v", "ON_ERROR_STOP=1"]
    try:
        run(sql, input="""
          create role anon;
          create role authenticated;
          create role service_role bypassrls;
          create schema auth;
          create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}'::jsonb);
          create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
          grant usage on schema auth, public to anon, authenticated, service_role;
          grant execute on function auth.uid() to anon, authenticated, service_role;
        """)
        for migration in sorted((root / "supabase/migrations").glob("*.sql")):
            run(sql + ["-f", str(migration)])
            print("PASS migration", migration.name)
        for test in sorted((root / "supabase/tests").glob("*.sql")):
            run(sql + ["-f", str(test)])
            print("PASS test", test.name)
    finally:
        run([str(bin_dir / "pg_ctl"), "-D", data, "-m", "fast", "stop"])
