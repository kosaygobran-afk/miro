"""Exercise real UI components in an isolated app; no linked service or owner writes."""
import os
import pathlib
import shutil
import subprocess
import tempfile
import time
import urllib.request

root = pathlib.Path(__file__).resolve().parents[1]
port = int(os.getenv('VARIANT_QA_PORT', '3224'))
with tempfile.TemporaryDirectory(prefix='miro-variant-ui-') as directory:
    app = pathlib.Path(directory)
    for entry in ('src', 'public', 'assets', 'package.json', 'tsconfig.json', 'next-env.d.ts', 'postcss.config.mjs', 'next.config.ts'):
        source = root / entry
        if source.is_dir(): shutil.copytree(source, app / entry)
        elif source.exists(): shutil.copy2(source, app / entry)
    (app / 'node_modules').symlink_to(root / 'node_modules', target_is_directory=True)
    (app / 'src/proxy.ts').unlink(missing_ok=True)
    fixture = app / 'src/app/catalog-preview/variants'
    fixture.mkdir(parents=True)
    shutil.copy2(root / 'scripts/variant-experience-fixture.tsx', fixture / 'page.tsx')
    imports = '\n'.join(line for line in ((root / 'src/app/[locale]/layout.tsx').read_text() + (root / 'src/app/[locale]/(protected)/admin/layout.tsx').read_text()).splitlines() if line.startswith('import ') and '.css"' in line)
    original = (app / 'src/app/catalog-preview/layout.tsx').read_text()
    original = imports + '\n' + '\n'.join(line for line in original.splitlines() if not (line.startswith('import ') and '.css"' in line))
    (app / 'src/app/catalog-preview/layout.tsx').write_text(original)
    env = {key: value for key, value in os.environ.items() if key in ('PATH','HOME','TMPDIR','LANG','LC_ALL')}
    env.update({'NEXT_TELEMETRY_DISABLED':'1','NODE_ENV':'development'})
    log_path = pathlib.Path('/tmp/miro-variant-ui-server.log')
    with log_path.open('w') as log:
        server = subprocess.Popen([str(root/'node_modules/.bin/next'),'dev',str(app),'--webpack','--hostname','127.0.0.1','--port',str(port)],cwd=app,env=env,stdout=log,stderr=subprocess.STDOUT)
    try:
        for attempt in range(120):
            if server.poll() is not None: raise RuntimeError(log_path.read_text()[-5000:])
            try:
                with urllib.request.urlopen(f'http://127.0.0.1:{port}/catalog-preview/variants',timeout=2) as response:
                    if response.status == 200: break
            except Exception: time.sleep(.5)
        else: raise RuntimeError('Fixture app did not start; see '+str(log_path))
        subprocess.run(['node',str(root/'scripts/verify-variant-experience.mjs')],cwd=root,env=env|{'VARIANT_QA_BASE':f'http://127.0.0.1:{port}'},check=True)
    finally:
        server.terminate()
        try: server.wait(timeout=8)
        except subprocess.TimeoutExpired: server.kill(); server.wait()
