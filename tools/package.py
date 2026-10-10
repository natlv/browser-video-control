"""Package the runtime and its documentation, plus a complete source archive."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
ROOT = Path(__file__).resolve().parents[1]
output = ROOT / 'dist'
output.mkdir(exist_ok=True)
with ZipFile(output/'tempo-video-speed-1.0.0.zip', 'w', ZIP_DEFLATED) as archive:
    for item in [ROOT/'manifest.json', ROOT/'README.md', *sorted((ROOT/'src').glob('*')), *sorted((ROOT/'icons').glob('*.png')), *sorted((ROOT/'docs').glob('*.md'))]:
        archive.write(item, item.relative_to(ROOT))
print(output/'tempo-video-speed-1.0.0.zip')
with ZipFile(output/'tempo-video-speed-source-1.0.0.zip', 'w', ZIP_DEFLATED) as archive:
    files = [ROOT/'manifest.json', ROOT/'README.md', ROOT/'package.json', ROOT/'.gitignore']
    for folder in ('src', 'icons', 'docs', 'tools', 'tests'):
        files += sorted(item for item in (ROOT/folder).iterdir() if item.is_file())
    for item in files:
        archive.write(item, Path('video-speed-extension')/item.relative_to(ROOT))
print(output/'tempo-video-speed-source-1.0.0.zip')
