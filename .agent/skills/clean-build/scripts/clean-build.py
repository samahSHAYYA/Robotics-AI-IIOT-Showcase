"""
@author: Samah SHAYYA
@date: 28-May-2026
@description: Removes CMake build artifacts, __pycache__ dirs, and .pyc files.
"""

import sys
import shutil

from pathlib import Path


def main(argv: list[str]) -> int:
    """
    Entry point — removes build artifacts from the project root.

    @param argv: sys.argv-style argument list.
    @return exit_code: 0 on success, 1 on error.
    """

    exit_code = 0

    # Script lives at .agent/skills/clean-build/scripts/clean-build.py.
    root = Path(__file__).resolve().parents[4]

    try:
        # --- CMake build directory ---
        build_dir = root / 'src' / 'core-platform' / 'cpp' / 'build'
        if build_dir.is_dir():
            shutil.rmtree(build_dir)
            print(f'[clean-build] Removed: {build_dir}')
        else:
            print(f'[clean-build] Not found: {build_dir}')

        # --- __pycache__ directories ---
        removed_dirs = 0
        for d in root.rglob('__pycache__'):
            if d.is_dir():
                shutil.rmtree(d)
                print(f'[clean-build] Removed: {d}')
                removed_dirs += 1
        if removed_dirs == 0:
            print('[clean-build] No __pycache__ directories found.')

        # --- .pyc files ---
        removed_files = 0
        for f in root.rglob('*.pyc'):
            if f.is_file():
                f.unlink()
                print(f'[clean-build] Removed: {f}')
                removed_files += 1
        if removed_files == 0:
            print('[clean-build] No .pyc files found.')

    except (OSError, PermissionError) as exc:
        print(f'[clean-build] ERROR: {exc}', file = sys.stderr)
        exit_code = 1

    return exit_code


if __name__ == '__main__':
    sys.exit(main(sys.argv))
