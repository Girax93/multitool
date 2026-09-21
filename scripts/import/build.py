#!/usr/bin/env python3
"""Build a MultiTool workout import file from a transcription module.

    python3 scripts/import/build.py scripts/import/weeks-01-16.py out.json

Week N is dated Mon 3 Feb 2025 + 7·(N−1) days (Ari: "weeks since I started").
Exercise ids are slugs of the exercise name, so a renamed/changed exercise is a
new id and the history shows exactly what was done each week.
"""
import datetime as dt
import importlib.util
import json
import re
import sys

START = dt.date(2025, 2, 3)  # Week 1 Monday
WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']


def slug(name: str) -> str:
    s = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
    return s or 'exercise'


def parse_cell(text: str) -> dict:
    """Mirror of parseLegacyCell in web/src/tools/workout/model.ts."""
    s = text.replace('…', '...').strip()
    star = '⭐' in s
    s = s.replace('⭐', '')
    refs: list[int] = []

    def sub(m: re.Match) -> str:
        refs.append(len(m.group(0)))
        return ''

    s = re.sub(r'(?<!\d)\.+(?!\d)|(?<=\d)\.+(?!\d)|(?<!\d)\.+(?=\d)', sub, s)
    v = re.sub(r'\s+', ' ', s).strip()
    cell: dict = {'v': v}
    fn = sorted(set(refs))
    if fn:
        cell['fn'] = fn
    if star:
        cell['star'] = True
    return cell


def build(weeks: list[dict]) -> dict:
    out = []
    for w in weeks:
        n = w['n']
        start = START + dt.timedelta(days=7 * (n - 1))
        wid = f'import-week{n:02d}'
        exercises = []
        for i, (name, weight) in enumerate(w['ex']):
            ex = {'id': slug(name), 'name': name, 'weight': weight, 'sets': 3}
            colour = w['exc'].get(i)
            if colour:
                ex['c'] = colour
            exercises.append(ex)
        ids = [e['id'] for e in exercises]
        assert len(set(ids)) == len(ids), f'week {n}: duplicate exercise ids {ids}'

        days = []
        for di, (weekday, bw, notes, marks, colour, notes_colour) in enumerate(w['days']):
            assert weekday in WEEKDAYS, weekday
            cells = {}
            for ei, ex in enumerate(exercises):
                sets = w['sets'][di][ei]
                assert len(sets) == 3, f'week {n} day {weekday} ex {ex["name"]}: {sets}'
                parsed = [parse_cell(s) for s in sets]
                for si, cell in enumerate(parsed):
                    colour_key = w['c'].get((di, ei, si))
                    if colour_key:
                        cell['c'] = colour_key
                cells[ex['id']] = {'sets': parsed}
            day = {
                'id': f'{wid}-{weekday.lower()}',
                'weekday': weekday,
                'date': (start + dt.timedelta(days=WEEKDAYS.index(weekday))).isoformat(),
                'cells': cells,
            }
            if bw is not None:
                day['bodyweight'] = bw
            if notes:
                day['notes'] = notes
            if marks:
                day['marks'] = marks
            if colour:
                day['c'] = colour
            if notes_colour:
                day['notesStyle'] = {'c': notes_colour}
            days.append(day)

        footnotes = {}
        for ei, texts in w['fn'].items():
            lst = [{'n': k + 1, 'text': t} for k, t in enumerate(texts) if t is not None]
            if lst:
                footnotes[exercises[ei]['id']] = lst

        # A referenced footnote should exist. The sheet occasionally has a
        # reference without a matching note (e.g. Week 6 Bicep Curls `12.`
        # with only a `..` note); those are kept as typed and reported so
        # Ari can decide, rather than silently dropped or invented.
        for day in days:
            for exid, ed in day['cells'].items():
                for cell in ed['sets']:
                    for ref in cell.get('fn', []):
                        have = {f['n'] for f in footnotes.get(exid, [])}
                        if ref not in have:
                            print(f'WARNING week {n} {day["weekday"]} {exid}: set "{cell["v"]}" refers to note {ref} '
                                  f'but the sheet only has notes {sorted(have)}', file=sys.stderr)

        week = {
            'id': wid,
            'label': f'Week {n}',
            'startDate': start.isoformat(),
            'createdAt': int(dt.datetime(2026, 9, 21, tzinfo=dt.timezone.utc).timestamp() * 1000) + n,
            'exercises': exercises,
            'days': days,
            'footnotes': footnotes,
        }
        if w.get('x'):
            week['notes'] = w['x']
        out.append(week)
    return {
        'format': 'multitool-workout',
        'version': 1,
        'exportedAt': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'),
        'weeks': out,
    }


if __name__ == '__main__':
    src, dest = sys.argv[1], sys.argv[2]
    spec = importlib.util.spec_from_file_location('weeks', src)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    data = build(mod.WEEKS)
    with open(dest, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    cells = sum(len(ed['sets']) for w in data['weeks'] for d in w['days'] for ed in d['cells'].values())
    filled = sum(1 for w in data['weeks'] for d in w['days'] for ed in d['cells'].values() for c in ed['sets'] if c['v'])
    notes = sum(len(v) for w in data['weeks'] for v in w['footnotes'].values())
    print(f'{len(data["weeks"])} weeks, {cells} set cells ({filled} filled), {notes} footnotes → {dest}')
