"""
@author: Samah SHAYYA
@date: 28-May-2026
@description: Reads measures.json and generates measures.ipp header with
              constexpr unit definitions and a registerAllMeasures function.
"""

import json
import re
import sys

from pathlib import Path


def validate_structure(data: dict) -> None:
    """
    Validates top-level structure and every measure/unit entry.

    @param data: Decoded JSON root object.
    @raises ValueError: If JSON structure is malformed or missing required keys.
    """

    if 'measures' not in data:
        raise ValueError('top-level key "measures" is required.')

    if not isinstance(data['measures'], list):
        raise ValueError('"measures" must be an array.')

    for i, m in enumerate(data['measures']):
        if not isinstance(m, dict):
            raise ValueError(f'measures[{i}] must be an object.')

        for key in ('name', 'siUnit', 'defaultUnit', 'units'):
            if key not in m:
                msg = f'measures[{i}] missing required key "{key}".'
                raise ValueError(msg)

        if not isinstance(m['units'], list) or not m['units']:
            msg = f'measures[{i}]["units"] must be a non-empty array.'
            raise ValueError(msg)

        for j, u in enumerate(m['units']):
            if not isinstance(u, dict):
                msg = f'measures[{i}].units[{j}] must be an object.'
                raise ValueError(msg)

            for key in ('name', 'symbol', 'toSI', 'fromSI'):
                if key not in u:
                    msg = f'measures[{i}].units[{j}] missing key "{key}".'
                    raise ValueError(msg)

            _validate_expr(u['toSI'])
            _validate_expr(u['fromSI'])


def generate(measures: list[dict]) -> str:
    """
    Assembles the full generated header from parsed measures.

    @param measures: List of measure dicts from measures.json.
    @return header: Complete text of measures.ipp.
    """

    lines = [
        '/**',
        ' * @author: Samah SHAYYA',
        ' * @date: 28-May-2026',
        ' * @description: Auto-generated from measures.json — do not edit'
        ' manually.',
        ' * @dependencies: measures.json as source of truth.',
        ' * @thread_safety: Read-only after registration.',
        ' */',
        '',
        '#ifndef CORE_PLATFORM_GENERATED_MEASURES_IPP',
        '#define CORE_PLATFORM_GENERATED_MEASURES_IPP',
        '',
        '#include <cmath>  // IWYU pragma: keep — used by generated lambdas',
        '',
        '#include <array>',
        '#include <string_view>',
        '',
        '#include "core_platform/units/unit_registry.hpp"',
        '',
        'namespace core_platform {',
        '',
    ]

    lines.append(_emit_measure_id_enum(measures))
    lines.append('')
    lines.append('namespace detail {')
    lines.append('')
    lines.append(_emit_measure_name_fn(measures))
    lines.append('')
    lines.append(_emit_measure_id_to_si_unit_fn(measures))
    lines.append('')

    for m in measures:
        lines.append(_emit_measure_array(m))
        lines.append('')

    lines.append(_emit_register_fn(measures))
    lines.append('')
    lines.append('}  // namespace detail')
    lines.append('}  // namespace core_platform')
    lines.append('')
    lines.append('#endif  // CORE_PLATFORM_GENERATED_MEASURES_IPP')
    lines.append('')

    header = '\n'.join(lines)

    return header


def main(argv: list[str]) -> int:
    """
    Entry point — parses JSON, validates, writes generated header.

    @param argv: sys.argv-style argument list.
    @return exit_code: 0 on success, 1 on error.
    """

    exit_code = 0

    if len(argv) != 3:
        print(f'Usage: {argv[0]} <measures.json> <output.ipp>', file = sys.stderr)
        return 1

    src = Path(argv[1])
    dst = Path(argv[2])

    try:
        with open(src,encoding = 'utf-8') as f:
            data = json.load(f)

        validate_structure(data)
        output = generate(data['measures'])

        dst.parent.mkdir(parents = True, exist_ok = True)

        with open(dst, 'w',encoding = 'utf-8',newline = '\n') as f:
            f.write(output)

    except (json.JSONDecodeError, ValueError, OSError) as exc:
        print(f'Error: {exc}', file = sys.stderr)
        exit_code = 1

    return exit_code


# Protected methods.

def _validate_expr(expr: str) -> None:
    """
    Validates that a conversion expression uses only safe tokens.

    @param expr: Expression string such as "(x * 0.01)".
    @raises ValueError: If expression contains unsafe characters.
    """

    allowed = re.compile(r'^[\sx0-9+\-*/.()eE,<>!&|^%a-zA-Z_:]+$')

    if not allowed.match(expr):
        raise ValueError(f'Invalid expression: {expr!r}.')


def _emit_measure_id_enum(measures: list[dict]) -> str:
    """
    Formats the MeasureId enum with entries for each measure plus None.

    @param measures: List of measure dicts.
    @return block: C++ enum definition text.
    """

    names = [m['name'] for m in measures]
    entries = ',\n  '.join(names)
    block = (
        'enum class MeasureId : unsigned char {\n'
        f'  None,\n'
        f'  {entries}\n'
        f'}};\n'
    )

    return block


def _emit_measure_name_fn(measures: list[dict]) -> str:
    """
    Formats constexpr measureName(MeasureId) -> std::string_view.

    @param measures: List of measure dicts.
    @return block: C++ switch-based constexpr function.
    """

    cases = '\n'.join(
        f'      case MeasureId::{m["name"]}: return "{m["name"]}";'
        for m in measures
    )
    block = (
        'constexpr std::string_view measureName(MeasureId id) {\n'
        '  switch (id) {\n'
        f'{cases}\n'
        '      default: return "";\n'
        '  }\n'
        '}\n'
    )

    return block


def _emit_measure_id_to_si_unit_fn(measures: list[dict]) -> str:
    """
    Formats constexpr siUnitForMeasure(MeasureId) -> std::string_view.

    @param measures: List of measure dicts.
    @return block: C++ switch-based constexpr function.
    """

    cases = '\n'.join(
        f'      case MeasureId::{m["name"]}: return "{m["siUnit"]}";'
        for m in measures
    )
    block = (
        'constexpr std::string_view siUnitForMeasure(MeasureId id) {\n'
        '  switch (id) {\n'
        f'{cases}\n'
        '      default: return "";\n'
        '  }\n'
        '}\n'
    )

    return block


def _emit_unit(u: dict, indent: str) -> str:
    """
    Formats a single UnitRegistry::UnitDef initialiser.

    @param u: Unit dict with name, symbol, measure, toSI, fromSI.
    @param indent: Indentation string for the block.
    @return block: C++ aggregate initialiser text for one unit.
    """

    block = f'{indent}UnitRegistry::UnitDef{{\n'
    block += f'{indent}  .name    = "{u["name"]}",\n'
    block += f'{indent}  .symbol  = "{u["symbol"]}",\n'
    block += f'{indent}  .measure = "{u["measure"]}",\n'
    block += f'{indent}  .toSI    = [](double x) {{ return {u["toSI"]}; }},\n'
    block += f'{indent}  .fromSI  = [](double x) {{ return {u["fromSI"]}; }},\n'
    block += f'{indent}}},\n'

    return block


def _emit_measure_array(m: dict) -> str:
    """
    Formats a constexpr std::array of unit defs for one measure.

    @param m: Measure dict with name and units list.
    @return block: Full C++ array definition block.
    """

    array_name = f'k{m["name"]}Units'
    num_units = len(m['units'])

    lines = [
        f'inline constexpr std::array<UnitRegistry::UnitDef, '
        f'{num_units}> {array_name} = {{'
    ]

    for u in m['units']:
        u['measure'] = m['name']
        lines.append(_emit_unit(u, '  '))

    lines.append('};\n')

    block = '\n'.join(lines)

    return block


def _emit_register_fn(measures: list[dict]) -> str:
    """
    Formats the registerAllMeasures helper that populates UnitRegistry.

    @param measures: List of measure dicts.
    @return block: C++ inline function body with direct register calls.
    """

    calls = '\n'.join(
        f'  registry.registerMeasure("{m["name"]}", "{m["siUnit"]}",'
        f' "{m["defaultUnit"]}", k{m["name"]}Units);'
        for m in measures
    )

    block = (
        'inline void registerAllMeasures(UnitRegistry& registry) {\n'
        f'{calls}\n'
        '}'
    )

    return block


if __name__ == '__main__':
    sys.exit(main(sys.argv))
