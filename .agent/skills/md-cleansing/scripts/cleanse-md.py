"""
Applies project Markdown formatting conventions to any .md file.

Rewraps prose, cleans whitespace, normalises blank lines, and
preserves structural elements (tables, code blocks, blockquotes).

@return exit_code: 0 if already clean, 1 if modified, 2 on error.
"""

import re
import sys

from pathlib import Path


def is_header(line: str) -> bool:
    return bool(re.match(r'^#{1,6}\s', line))


def is_table(line: str) -> bool:
    return '|' in line and not is_header(line)


def is_blockquote(line: str) -> bool:
    return line.startswith('>')


def is_fence(line: str) -> bool:
    return line.startswith('```') or line.startswith('~~~')


def is_list_item(line: str) -> bool:
    return bool(re.match(r'^(\s*)[-*+]\s', line)) or \
           bool(re.match(r'^(\s*)\d+\.\s', line))


def _block_kind(lines: list[str]) -> str:
    """
    Classify a non-blank block: prose, list, header, table, etc.
    """

    if len(lines) == 1:
        l = lines[0]

        if is_header(l):
            return 'header'

        if is_table(l):
            return 'table'

        if is_blockquote(l):
            return 'blockquote'

        if is_list_item(l):
            return 'list'

        if is_fence(l):
            return 'fence'

        return 'prose'

    if all(is_blockquote(l) for l in lines if l.strip()):
        return 'blockquote'

    if all(is_table(l) for l in lines if l.strip()):
        return 'table'

    if is_fence(lines[0]):
        return 'fence'

    for l in lines:
        if l.strip():
            if is_list_item(l):
                return 'list'

            break

    return 'prose'


# Natural break indicators (priority order)
_BREAK_PATTERNS: list[re.Pattern] = [
    re.compile(r'\.\s+'),
    re.compile(r'\?\s+'),
    re.compile(r'!\s+'),
    re.compile(r',\s+'),
    re.compile(r';\s+'),
    re.compile(r'\s+and\s+', re.IGNORECASE),
    re.compile(r'\s+or\s+', re.IGNORECASE),
    re.compile(r'\s+but\s+', re.IGNORECASE),
    re.compile(r'\s+--\s+'),
    re.compile(r'\s+—\s+'),
]


def _best_break(text: str, max_pos: int, min_pos: int) -> int:
    """
    Finds the best break position in [min_pos, max_pos].

    @return pos: break position.
    """

    if len(text) <= max_pos:
        return len(text)

    zone = text[min_pos:max_pos]

    for pat in _BREAK_PATTERNS:
        for m in reversed(list(pat.finditer(zone))):
            pos = min_pos + m.end()

            if min_pos <= pos <= max_pos:
                return pos

    for i in range(max_pos, min_pos - 1, -1):
        if text[i:i + 1] in (' ', '\t'):
            return i + 1

    return max_pos


def wrap_prose(text: str, max_width: int = 79, min_width: int = 70) -> str:
    """
    Rewraps a single prose paragraph.
    """

    text = re.sub(r'\s+', ' ', text).strip()

    if not text:
        return ''

    words = text.split()

    lines: list[str] = []
    i = 0

    while i < len(words):
        line_words = [words[i]]
        line_len = len(words[i])
        j = i + 1

        while j < len(words):
            if line_len + 1 + len(words[j]) <= max_width:
                line_words.append(words[j])
                line_len += 1 + len(words[j])
                j += 1
            else:
                break

        candidate = ' '.join(line_words)

        if j == len(words) or len(candidate) >= min_width:
            lines.append(candidate)
            i = j
            continue

        if j < len(words):
            extra = f'{candidate} {words[j]}'
            if len(extra) <= max_width:
                lines.append(extra)
                i = j + 1
                continue

            break_pos = _best_break(extra, min(len(extra), max_width), min_width)
            lines.append(extra[:break_pos].rstrip())
            remaining = extra[break_pos:].strip()

            if remaining:
                words[j] = remaining
                i = j
            else:
                i = j + 1
            continue

        lines.append(candidate)
        i = j

    return '\n'.join(lines)


def cleanse(text: str) -> str:
    """
    Applies all formatting rules. @return cleaned text.
    """

    lines = text.splitlines()
    out: list[str] = []
    i = 0
    in_fence = False

    while i < len(lines):
        line = lines[i]
        if is_fence(line):
            out.append(line)
            in_fence = not in_fence
            i += 1
            continue

        if in_fence:
            out.append(line)
            i += 1
            continue

        if not line.strip():
            out.append('')
            i += 1
            continue

        block: list[str] = [line]
        i += 1

        while i < len(lines) and lines[i].strip() and not is_fence(lines[i]):
            block.append(lines[i])
            i += 1

        kind = _block_kind(block)

        match kind:
            case 'prose':
                para = ' '.join(l.strip() for l in block if l.strip())
                out.extend(wrap_prose(para).split('\n'))
            case 'list' | 'header' | 'table' | 'blockquote' | 'fence':
                for l in block:
                    out.append(l.rstrip())

    result: list[str] = []
    prev_blank = True

    for line in out:
        cleaned = line.rstrip()
        if not cleaned and prev_blank:
            continue

        result.append(cleaned)
        prev_blank = not cleaned

    final: list[str] = []
    for idx, line in enumerate(result):
        final.append(line)
        if is_header(line) and idx + 1 < len(result) and result[idx + 1].strip():
            final.append('')

    while final and not final[-1]:
        final.pop()

    return '\n'.join(final) + '\n'


def main():

    if len(sys.argv) != 2:
        print('Usage: py cleanse-md.py <file.md>', file = sys.stderr)
        sys.exit(2)

    path = Path(sys.argv[1])

    if not path.exists():
        print(f'Error: file not found — {path}', file = sys.stderr)
        sys.exit(2)

    original = path.read_text(encoding = 'utf-8')
    cleaned = cleanse(original)

    if cleaned == original:
        sys.exit(0)

    path.write_text(cleaned,encoding = 'utf-8')
    sys.exit(1)


if __name__ == '__main__':
    main()
