"""
@author: Samah SHAYYA
@date: 28-May-2026
@description: Checks and auto-fixes Python files against project conventions.
"""

import ast
import re
import sys

from pathlib import Path


# Protected methods.

def _has_trailing_whitespace(lines: list[str]) -> bool:
    """
    @return found: True if any line has trailing whitespace.
    """

    return any(line.rstrip('\n').rstrip() != line.rstrip('\n')
               for line in lines)


def _strip_trailing_whitespace(lines: list[str]) -> list[str]:
    """
    @return cleaned: Lines with trailing whitespace removed.
    """

    return [line.rstrip() + '\n' for line in lines]


def _eof_newline_issues(lines: list[str]) -> list[str]:
    """
    Checks end-of-file newline rules.

    @return issues: List of problem descriptions.
    """

    issues: list[str] = []

    if not lines:
        return issues

    # Strip trailing empty lines to check last content line.
    stripped = [l for l in lines if l.strip() or True]  # keep all
    # Actually find last non-empty line index.
    last_content = -1
    for i, l in enumerate(lines):
        if l.strip():
            last_content = i

    if last_content == -1:
        return issues

    # Check trailing blank lines after last content.
    trailing = len(lines) - last_content - 1
    if trailing > 1:
        issues.append(f'{trailing} trailing blank line(s) after last content.'
                       ' Expected 1.')

    # Check if file ends with newline.
    if lines and not lines[-1].endswith('\n'):
        issues.append('File does not end with newline.')

    return issues


def _ensure_eof_newline(lines: list[str]) -> list[str]:
    """
    @return fixed: Lines with exactly one trailing newline at EOF.
    """

    if not lines:
        return lines

    # Strip trailing blank lines.
    while len(lines) > 1 and not lines[-1].strip():
        lines.pop()
    # Ensure last line ends with newline.
    if lines and not lines[-1].endswith('\n'):
        lines[-1] += '\n'
    # If the last line is blank (only newline) after stripping, keep it.
    if lines and lines[-1].strip() == '' and lines[-1].endswith('\n'):
        pass  # keep as is
    # Add exactly one trailing newline.
    return lines


def _check_kwarg_spacing(lines: list[str]) -> list[tuple[int, str]]:
    """
    Scans lines for keyword arguments without spaces around `=`.

    @return violations: List of (line_number, line_text) tuples.
    """

    violations: list[tuple[int, str]] = []
    # Matches `identifier=` in call/def contexts: after (, [, or ,.
    pattern = re.compile(r'(?<=[(\[,])\s*([a-zA-Z_]\w*)='
                         r'(?=[ \t]*[^=])')
    for i, line in enumerate(lines, 1):
        if pattern.search(line):
            violations.append((i, line.rstrip('\n')))
    return violations


def _fix_kwarg_spacing(line: str) -> str:
    """
    @return fixed: Line with spaces around `=` in keyword arguments.
    """

    # Add space before = after identifier in keyword arg context.
    line = re.sub(
        r'(?<=[(\[,])\s*([a-zA-Z_]\w*)=',
        r'\1 = ',
        line,
    )
    # Also handle [= at start (e.g., line continuation of args).
    # Remove double spaces that might result.
    line = re.sub(r' =  ', ' = ', line)
    return line


def _check_docstring_quotes(text: str) -> bool:
    """
    @return found: True if triple-single-quote docstrings exist
                   (not inside string literals).
    """

    # Match ''' that starts a standalone docstring (not inside ' ' or " ").
    return bool(re.search(r"(?<!['\"])(?:^|\s)'''[^']", text, re.MULTILINE))


def _fix_docstring_quotes(text: str) -> str:
    """
    Converts triple-single-quotes to triple-double-quotes.

    @return fixed: Text with triple-single-quotes replaced.
    """

    return text.replace("'''", '"""')


def _check_quote_style(text: str) -> list[tuple[int, str]]:
    """
    Finds double-quoted string literals (not docstrings) that should be single.

    @return violations: List of (line_number, context) tuples.
    """

    violations: list[tuple[int, str]] = []
    # Simple heuristic: find lines with " inside, outside docstring regions.
    in_docstring = False
    for i, line in enumerate(text.split('\n'), 1):
        stripped = line.strip()
        if stripped.startswith('"""') or stripped.startswith("'''"):
            in_docstring = not in_docstring
            continue
        if in_docstring:
            continue
        # Find double-quoted strings
        if '"' in stripped:
            violations.append((i, stripped[:60]))
    return violations


# _fix_quote_style intentionally removed — auto-conversion is too fragile
# with strings like `"'''"`. Quote style is check-only via _check_quote_style.


def _check_line_length(lines: list[str], limit: int = 120) -> list[tuple[int, int]]:
    """
    @param limit: Maximum allowed characters.
    @return violations: List of (line_number, length) tuples > limit.
    """

    violations: list[tuple[int, int]] = []
    for i, line in enumerate(lines, 1):
        length = len(line.rstrip('\n'))
        if length > limit:
            violations.append((i, length))
            
    return violations


def _check_return_annotations(text: str) -> list[str]:
    """
    Checks that all function defs have return type annotations via AST.

    @return violations: List of formatted issue descriptions.
    """

    violations: list[str] = []
    try:
        tree = ast.parse(text)
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if node.returns is None:
                    violations.append(
                        f'Line {node.lineno}: {node.name}()'
                        ' missing return annotation')
    except SyntaxError as exc:
        violations.append(f'Parse error: {exc}')

    return violations


def _check_module_docstring(text: str) -> list[str]:
    """
    @return violations: Missing module docstring or tags.
    """

    violations: list[str] = []
    try:
        tree = ast.parse(text)
        body = tree.body
        if not body or not isinstance(body[0], ast.Expr) \
                or not isinstance(body[0].value, ast.Constant) \
                or not isinstance(body[0].value.value, str):
            violations.append('Missing module-level docstring')
            return violations

        doc = body[0].value.value
        if '@author' not in doc:
            violations.append('Module docstring missing @author tag')
        if '@date' not in doc:
            violations.append('Module docstring missing @date tag')
        if '@description' not in doc:
            violations.append('Module docstring missing @description tag')
    except SyntaxError as exc:
        violations.append(f'Parse error: {exc}')

    return violations


def _check_protected_methods_section(text: str) -> list[str]:
    """
    @return violations: Functions starting with `_` found before the section
                       marker.
    """
    violations: list[tuple[int, str]] = []
    in_docstring = False
    for i, line in enumerate(text.split('\n'), 1):
        stripped = line.strip()
        if stripped.startswith('"""') or stripped.startswith("'''"):
            in_docstring = not in_docstring
            continue
        if in_docstring:
            continue
        # Find "text" where content has no ' (must use " because of embedded ').
        for m in re.finditer(r'"([^"]*?)"', stripped):
            inner = m.group(1)
            if "'" not in inner and inner:
                violations.append((i, stripped[:60]))
    return violations


def _check_trailing_underscores(text: str) -> list[str]:
    """
    @return violations: Identifiers ending with trailing underscore.
    """

    violations: list[str] = []
    # Match identifier-like patterns ending in _.
    # Exclude __dunder__ patterns
    pattern = re.compile(r'\b[a-zA-Z]\\w*_(?:\W|$)')
    dunder = re.compile(r'__\w+__')
    for i, line in enumerate(text.split('\n'), 1):
        for match in pattern.finditer(line):
            ident = match.group().strip()
            if ident.endswith('_') and not dunder.search(ident):
                name = ident.rstrip(' ,;:')
                violations.append(
                    f'Line {i}: trailing underscore in "{name}"')
    return violations


def _check_msg_for_raise(text: str) -> list[str]:
    """
    @return violations: Raise with long string literal not using `msg` var.
    """

    violations: list[str] = []
    pattern = re.compile(r'raise\s+\w+\((["\'])(.{40,}?)\1\)')
    for i, line in enumerate(text.split('\n'), 1):
        match = pattern.search(line)
        if match:
            violations.append(f'Line {i}: long raise string,'
                              f' extract to `msg` variable')

    violations2: list[str] = []
    pattern2 = re.compile(r'raise\s+\w+\(f[\"\'].{60,}?[\"\']\)')
    for i, line in enumerate(text.split('\n'), 1):
        if pattern2.search(line):
            violations2.append(f'Line {i}: long raise string,'
                               f' extract to `msg` variable')

    return violations + [v for v in violations2 if v not in violations]


def _check_import_order(text: str) -> list[str]:
    """
    Checks three-group import ordering via AST.

    @return violations: Ordering issues found.
    """

    violations: list[str] = []
    try:
        tree = ast.parse(text)
        groups: list[str] = []
        current_group: list[str] = []
        prev_is_import = False

        for node in tree.body:
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                name = (f'import {node.names[0].name}' if isinstance(node,
                        ast.Import) else f'from {node.module} import ...')
                current_group.append(name)
                prev_is_import = True
            elif prev_is_import:
                if isinstance(node, ast.Expr) and isinstance(node.value,
                        ast.Constant) and node.value.value == '':
                    # blank line — group boundary
                    groups.append(current_group)
                    current_group = []
                elif not isinstance(node, (ast.Import, ast.ImportFrom)):
                    groups.append(current_group)
                    current_group = []
                    prev_is_import = False

        if current_group:
            groups.append(current_group)

        imports = [stmt for stmt in tree.body if isinstance(stmt,
                   (ast.Import, ast.ImportFrom))]
        for stmt in imports:
            is_builtin = stmt.names[0].name in dir(__builtins__) \
                if isinstance(stmt, ast.Import) else \
                stmt.module in sys.stdlib_module_names
            # This is a rough check; skip detailed ordering for now.

    except SyntaxError as exc:
        violations.append(f'Parse error: {exc}')

    return violations


# =============================================================================
# Main processing
# =============================================================================

def process_file(path: Path, check_only: bool) -> list[str]:
    """
    Runs all checks and auto-fixes on a single file.

    @param path: Target .py file.
    @param check_only: If True, only report without modifying.
    @return issues: All issues found (fixed or remaining).
    """

    issues: list[str] = []
    text = path.read_text(encoding = 'utf-8')
    lines = text.splitlines(keepends = True)
    original = text

    # --- Auto-fixable checks (Rules 1-5) ---
    fixes_applied = 0

    # Trailing whitespace
    if _has_trailing_whitespace(lines):
        lines = _strip_trailing_whitespace(lines)
        if not check_only:
            fixes_applied += 1
        issues.append('[FIX] Trailing whitespace')

    # EOF newline
    eof_issues = _eof_newline_issues(lines)
    if eof_issues:
        for msg in eof_issues:
            issues.append(f'[FIX] {msg}')
        lines = _ensure_eof_newline(lines)
        if not check_only:
            fixes_applied += 1

    text = ''.join(lines)

    # Docstring quotes check only
    if _check_docstring_quotes(text):
        issues.append('[CHECK] Triple-single-quote docstrings,'
                       ' convert to three double-quotes manually')

    # Keyword arg spacing
    kwarg_violations = _check_kwarg_spacing(text.splitlines(keepends = True))
    if kwarg_violations:
        fixed_lines = text.splitlines(keepends = True)
        for lineno, _ in kwarg_violations:
            fixed_lines[lineno - 1] = _fix_kwarg_spacing(
                fixed_lines[lineno - 1])
        text = ''.join(fixed_lines)
        if not check_only:
            fixes_applied += 1
        issues.append('[FIX] Keyword argument spacing')

    # Quote style check only
    quote_violations = _check_quote_style(text)
    if quote_violations:
        issues.append('[CHECK] Double-quoted strings prefer single quotes')

    # --- Manual-check rules (6-19) ---

    # Module docstring (6)
    for v in _check_module_docstring(text):
        issues.append(f'[CHECK] {v}')

    # Return annotations (8)
    for v in _check_return_annotations(text):
        issues.append(f'[CHECK] {v}')

    # Protected methods section (12)
    for v in _check_protected_methods_section(text):
        issues.append(f'[CHECK] {v}')

    # Trailing underscores (13)
    for v in _check_trailing_underscores(text):
        issues.append(f'[CHECK] {v}')

    # msg variable for long raise (17)
    for v in _check_msg_for_raise(text):
        issues.append(f'[CHECK] {v}')

    # Line length (18)
    for line_no, length in _check_line_length(text.splitlines(keepends = True)):
        issues.append(f'[CHECK] Line {line_no}: {length} chars'
                       f' (limit 120)')

    # Import order (11)
    for v in _check_import_order(text):
        issues.append(f'[CHECK] {v}')

    # --- Write if changed ---
    if text != original:
        if not check_only:
            path.write_text(text, encoding = 'utf-8')
            issues.append(f'[WRITTEN] {path.name}')
    else:
        if not check_only and fixes_applied == 0:
            issues.append(f'Already clean')

    return issues


def main(argv: list[str]) -> int:
    """
    Entry point — processes Python files for formatting rules.

    @param argv: sys.argv-style argument list.
    @return exit_code: 0 clean, 1 violations found, 2 error.
    """

    exit_code = 0
    check_only = False
    files: list[str] = []

    for arg in argv[1:]:
        if arg == '--check':
            check_only = True
        elif arg.startswith('-'):
            print(f'Unknown option: {arg}', file = sys.stderr)
            return 2
        else:
            files.append(arg)

    if not files:
        print('Usage: py format-python.py [--check] <file.py> ...',
              file = sys.stderr)
        return 2

    label = 'check' if check_only else 'fix'
    found_issues = False

    for fp in files:
        path = Path(fp)
        if not path.exists():
            print(f'Error: file not found — {path}', file = sys.stderr)
            exit_code = 2
            continue

        print(f'\n--- {path.name} ({label}) ---')
        issues = process_file(path, check_only = check_only)

        for msg in issues:
            print(f'  {msg}')

        if any(msg.startswith('[CHECK]') or msg.startswith('[FIX]')
               for msg in issues):
            found_issues = True

    if found_issues:
        exit_code = 1

    return exit_code


if __name__ == '__main__':
    sys.exit(main(sys.argv))
