"""Create a reproducible source hand-in without caches, secrets or private videos."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'submission'
SKIP = {'.git', '.venv', 'venv', 'node_modules', 'dist', '__pycache__', '.pytest_cache', '.vite', '.cache', 'bin'}
ROOT_FILES = ['README.md', '.gitignore', '.env.example', 'start.bat', 'stop-all.ps1', 'setup.ps1', 'verify.ps1']

def main():
    OUT.mkdir(exist_ok=True)
    archive = OUT / 'VISUALISER-source.zip'
    files = [ROOT / name for name in ROOT_FILES]
    for directory in ['backend-go', 'ml-service', 'web', 'docs', 'scripts']:
        for p in (ROOT / directory).rglob('*'):
            rel = p.relative_to(ROOT)
            if not p.is_file() or any(part in SKIP for part in rel.parts):
                continue
            if p.name.startswith('.env') and p.name != '.env.example':
                continue
            if 'data' in rel.parts and p.name != '.gitkeep':
                continue
            if p.suffix in {'.pyc', '.exe', '.tsbuildinfo', '.pkl'}:
                continue
            files.append(p)
    with ZipFile(archive, 'w', ZIP_DEFLATED) as z:
        for p in sorted(set(files)):
            z.write(p, 'VISUALISER/' + p.relative_to(ROOT).as_posix())
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (OUT / 'SHA256SUMS.txt').write_text(f'{digest}  {archive.name}\n')
    with ZipFile(archive) as z:
        assert z.testzip() is None
        print(f'{archive}: {len(z.namelist())} files; archive integrity verified')
    print('Source-only hand-in: add the trained model and consented dataset separately when available.')

if __name__ == '__main__':
    main()
