"""Version browser asset URLs for an atomically compatible GitHub Pages release.

The initial HTML may remain in a browser cache, so each HTML revision pins
its JS/CSS URL to a commit. The app then pins its imported ES modules and
the wasm-pack JS loader pins the matching WASM blob. No extra server.
"""
import pathlib
import sys

version = sys.argv[1]
assert len(version) == 40 and all(c in "0123456789abcdef" for c in version)

def change(path, before, after):
    file = pathlib.Path(path)
    source = file.read_text()
    assert before in source, f"Missing expected asset: {before} in {path}"
    file.write_text(source.replace(before, after))

for kind, filename in (("href", "style.css"), ("src", "app.js"), ("src", "hud-theme.js")):
    before = kind + '="./' + filename + '"'
    change("web/index.html", before,
           kind + '="./' + filename + '?v=' + version + '"')

for module in ("zoning.js", "census.js", "parcel.js", "grid.js",
               "data-cache.js", "pkg/stratlas_core.js"):
    before = 'from "./' + module + '"'
    change("web/app.js", before,
           'from "./' + module + '?v=' + version + '"')

change("web/pkg/stratlas_core.js",
       "stratlas_core_bg.wasm",
       "stratlas_core_bg.wasm?v=" + version)
