#!/usr/bin/env python3
"""
@author: Samah SHAYYA
@date: 27-May-2026

@description:

Documentation orchestrator.

Builds the full dev site:
  1. Doxygen — C++ API reference from core-platform
  2. MkDocs  — Markdown site from read-me/, src/, .agent/

Commands:
  python scripts/generate-docs.py build     Full build (Doxygen + MkDocs)
  python scripts/generate-docs.py serve     Build + MkDocs live-reload server
  python scripts/generate-docs.py watch     Serve + auto-rebuild Doxygen on C++
                                            changes (requires `watchdog`)
"""

import argparse
import os
import shutil
import subprocess
import sys
import time

PROJECT_ROOT: str = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS_DIR: str = os.path.join(PROJECT_ROOT, 'docs')
DOXYFILE: str = os.path.join(PROJECT_ROOT, 'src', 'core-platform', 'Doxyfile')
DOXYGEN_OUT: str = os.path.join(PROJECT_ROOT, 'docs', 'doxygen')
SITE_OUT: str = os.path.join(PROJECT_ROOT, 'doc-site')
MKDOCS_CONFIG: str = os.path.join(PROJECT_ROOT, 'mkdocs.yml')

CPP_WATCH_DIRS: list[str] = [
    os.path.join(PROJECT_ROOT, 'src', 'core-platform', 'cpp'),
]

DOCS_SOURCE_DIRS: list[str] = [
    'read-me',
    'src',
    '.agent',
]


def _sync_source_docs():
    """
    Copies source markdown files into docs/ so MkDocs can find them.

    Each directory in DOCS_SOURCE_DIRS is mirrored into docs/ preserving
    relative paths. Existing files in docs/ are removed first to keep the
    directory clean.
    """

    docs_dirs = [d for d in os.listdir(DOCS_DIR) if d != 'doxygen']

    for d in docs_dirs:
        path = os.path.join(DOCS_DIR, d)

        if os.path.isdir(path):
            shutil.rmtree(path)

    for rel_dir in DOCS_SOURCE_DIRS:
        src = os.path.join(PROJECT_ROOT, rel_dir)
        dst_name = rel_dir.lstrip('.')

        if not dst_name:
            dst_name = rel_dir

        dst = os.path.join(DOCS_DIR, dst_name)

        if os.path.isdir(src):
            shutil.copytree(src, dst, ignore = shutil.ignore_patterns(
                '__pycache__', '*.pyc', '*.pyo', '.gitkeep', '*.env',
                'node_modules', '.venv', 'dist', 'build',
            ))

    # Write a stub page that links to the Doxygen output.
    redirect_page = os.path.join(DOCS_DIR, 'doxygen-api.md')

    with open(redirect_page, 'w') as f:
        f.write('# C++ API Reference\n\n')
        f.write('<script>\n')
        f.write('location.href = "../doxygen/html/index.html";\n')
        f.write('</script>\n')
        f.write('\n')
        f.write('Redirecting to the ')
        f.write('<a href="../doxygen/html/index.html">')
        f.write('C++ API reference</a>...\n')


def run_doxygen() -> bool:
    """
    Runs Doxygen on the core-platform C++ sources.

    @return ok: True on success and False on failure.
    """

    print('[docs] Running Doxygen ...')

    os.makedirs(DOXYGEN_OUT, exist_ok = True)

    doxyfile_dir = os.path.dirname(DOXYFILE)

    result = subprocess.run(
        ['doxygen', DOXYFILE],
        cwd = doxyfile_dir,
        capture_output = True,
        text = True,
    )

    if ok := (result.returncode == 0):
        print('[docs] Doxygen complete ->', DOXYGEN_OUT)
    else:
        print('[docs] Doxygen failed:', result.stderr)

    return ok


def _copy_doxygen_to_site():
    """
    Copies Doxygen HTML output into the MkDocs site directory so it
    is served under /doxygen/.
    """

    src = os.path.join(DOXYGEN_OUT, 'html')
    dst = os.path.join(SITE_OUT, 'doxygen', 'html')

    if os.path.isdir(src):
        if os.path.isdir(dst):
            shutil.rmtree(dst)

        shutil.copytree(src, dst)


def build_mkdocs() -> bool:
    """
    Builds the MkDocs static site and merges Doxygen output.

    @return ok: True on success and False on failure.
    """

    print('[docs] Syncing source docs into docs/ ...')

    _sync_source_docs()

    print('[docs] Building MkDocs site ...')

    result = subprocess.run(
        [
            sys.executable, '-m', 'mkdocs', 'build',
            '--config-file', MKDOCS_CONFIG,
            '--site-dir', SITE_OUT,
        ],
        cwd = PROJECT_ROOT,
        capture_output = True,
        text = True,
    )

    if ok := (result.returncode == 0):
        print('[docs] MkDocs complete ->', SITE_OUT)
        _copy_doxygen_to_site()
    else:
        print('[docs] MkDocs build failed:', result.stderr)

    return ok


def serve_mkdocs():
    """
    Starts the MkDocs live-reload dev server (blocks).
    """

    print('[docs] Syncing source docs into docs/ ...')

    _sync_source_docs()

    print('[docs] Starting MkDocs dev server at: http://127.0.0.1:8000 ...')

    subprocess.run(
        [sys.executable, '-m', 'mkdocs', 'serve', '--config-file', MKDOCS_CONFIG],
        cwd = PROJECT_ROOT,
    )


def _try_watch_cpp() -> bool:
    """
    Attempts to start a C++ file watcher for auto-Doxygen.

    @return ok: True if the watcher starts successfully and False otherwise.
    """

    ok = False
    source_suffixes = ('.cpp', '.hpp', '.h')

    try:
        from watchdog.observers import Observer
        from watchdog.events import FileSystemEventHandler
    except ImportError:
        ok = False
    else:

        class CppChangeHandler(FileSystemEventHandler):
            """
            Watches for C++ file changes and rebuilds Doxygen.
            """

            def __init__(self):
                self._debounce_until: float = 0.0

            def on_modified(self, event: object):

                path: str = getattr(event, 'src_path', '')

                if not path.endswith(source_suffixes):
                    return

                now: float = time.time()

                if now < self._debounce_until:
                    return

                self._debounce_until = now + 2.0

                print('[docs] C++ change was detected. Rebuilding Doxygen ...')

                run_doxygen()

        observer = Observer()
        handler = CppChangeHandler()

        for d in CPP_WATCH_DIRS:
            if os.path.isdir(d):
                observer.schedule(handler, d, recursive = True)

        observer.start()
        ok = True

        print('[docs] Watching C++ for changes (requires `watchdog`).',
              'Ctrl+C to stop.')

        try:
            serve_mkdocs()
        finally:
            observer.stop()
            observer.join()

    return ok


def run_watch_mode():
    """
    Runs MkDocs serve with optional C++ file watching.
    """

    if not _try_watch_cpp():
        print('[docs] `watchdog` not installed. Run: pip install watchdog')
        print('[docs] Falling back to --serve without C++ watch.')
        serve_mkdocs()


def main():
    """
    Parses CLI args and dispatches the requested command.
    """

    parser = argparse.ArgumentParser(
        description = 'Generate project documentation'
    )

    parser.add_argument(
        'command',
        nargs = '?',
        default = 'build',
        choices = ['build', 'serve', 'watch'],
    )

    args = parser.parse_args()

    match args.command:
        case 'watch':
            run_doxygen()
            run_watch_mode()
        case 'serve':
            run_doxygen()
            serve_mkdocs()
        case _:
            run_doxygen()
            build_mkdocs()


if __name__ == '__main__':
    main()
