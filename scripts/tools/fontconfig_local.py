from __future__ import annotations

import os
import tempfile
from contextlib import contextmanager
from pathlib import Path
from xml.sax.saxutils import escape


ROOT = Path(__file__).resolve().parents[2]
DESIGN_FONTS_DIR = ROOT / 'design' / 'fonts'


def _font_dirs():
    if not DESIGN_FONTS_DIR.exists():
        return []
    dirs = [DESIGN_FONTS_DIR]
    dirs.extend(sorted(path for path in DESIGN_FONTS_DIR.iterdir() if path.is_dir()))
    return dirs


@contextmanager
def local_fontconfig():
    """Expone las fuentes locales de design/fonts a fontconfig/CairoSVG."""
    font_dirs = _font_dirs()
    if not font_dirs:
        yield
        return

    tracked_vars = ('FONTCONFIG_FILE', 'FONTCONFIG_PATH', 'XDG_CACHE_HOME')
    previous_env = {name: os.environ.get(name) for name in tracked_vars}

    with tempfile.TemporaryDirectory(prefix='synthigme-fontconfig-') as tmp_dir:
        tmp_path = Path(tmp_dir)
        cache_dir = tmp_path / 'cache'
        cache_dir.mkdir(parents=True, exist_ok=True)
        config_path = tmp_path / 'fonts.conf'

        dirs_xml = '\n'.join(
            f'  <dir>{escape(str(path))}</dir>'
            for path in font_dirs
        )

        config_path.write_text(
            """<?xml version=\"1.0\"?>
<!DOCTYPE fontconfig SYSTEM \"fonts.dtd\">
<fontconfig>
{dirs_xml}
  <cachedir>{cache_dir}</cachedir>
</fontconfig>
""".format(
                dirs_xml=dirs_xml,
                cache_dir=escape(str(cache_dir)),
            ),
            encoding='utf-8',
        )

        os.environ['FONTCONFIG_FILE'] = str(config_path)
        os.environ['FONTCONFIG_PATH'] = str(tmp_path)
        os.environ['XDG_CACHE_HOME'] = str(cache_dir)

        try:
            yield
        finally:
            for name, value in previous_env.items():
                if value is None:
                    os.environ.pop(name, None)
                else:
                    os.environ[name] = value
