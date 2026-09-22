"""Transcription of Ari's OneNote workout log, weeks 38-59 (screenshots, 2026-09-22).

Same notation as weeks-17-37.py (decoded by scripts/import/build.py):
  - set cells: text as typed; runs of dots = footnote refs (run length = note number),
    '…' = 3 dots, '⭐' = star. "" = empty, "-" = the sheet's dash (day not done).
  - fn: numbered footnotes per exercise, in order (index 0 = note 1); None keeps a gap.
  - pn: plain notes per exercise (no dot in the sheet, not referenced) → shown without a number.
  - c: cell colours {(day_index, exercise_index, set_index): legend_id}
  - exc: exercise header colours {exercise_index: legend_id}
  - days: (weekday, bodyweight, notes, marks, day_colour, notes_colour[, other_workout])
    other_workout = "worked out, but not tracked".
  - x: week-level notes (Notes-column header cell) → week.notes
Decisions for this batch (2026-09-22, see the project doc):
  - the S-Press column is a handstand exercise from week 40 (the sheet only greys the old header
    out from week 41): exercise "1min Handstand practice!" (weight "Count = Falls"), "1.5min …" from 52;
    week 55/57-59 write "1.5 min" with a space → same exercise id, so it is spelled "1.5min" throughout;
  - "Triceps Ext. - 26kg" is struck through from week 40 → exercise "Bent-over triceps push-ups";
  - "?kg" / "Xkg" bodyweights → none; "Fri (sat)" (week 48) → Sat;
  - handstand cells hold words (Bad / Mid / Good! / Ok+ / Gr8 / 50+ / 30+30 …) → kept as typed;
  - the sheet's red "~" in a few cells (55-58) is kept as "~"; orange / yellow / red text colour in
    notes is not representable and dropped (week 49 Fri "⭐ See text in orange" refers to the plain
    chest note);
  - untracked sessions mentioned in a note ("TUESDAY CALISTHENICS", "Did heavy cali on Tuesday",
    "GYM w/Ole on Saturday") become an extra "other workout" day (ALT_DAYS below); the sheet's
    row keeps its dashes and its note. Week 53 Fri (stars + "GYM W OLE") is that day itself;
  - week 48's yellow-highlighted "22kg!" and the purple headers → exercise colour purple;
  - week 57 triceps note 3 links the YouTube video by its title (found by search, not in the sheet).
"""

WEEKS = []

def W(n, ex, days, sets, fn=None, pn=None, c=None, exc=None, x=None):
    WEEKS.append(dict(n=n, ex=ex, days=days, sets=sets, fn=fn or {}, pn=pn or {}, c=c or {}, exc=exc or {}, x=x))

E = [['', '', '']] * 6
DASH = [['-', '-', '-']] * 6
D = lambda wd, bw=None, notes='', marks='', colour=None, nc=None: (wd, bw, notes, marks, colour, nc)
ALT = lambda wd, what, bw=None, notes='', marks='': (wd, bw, notes, marks, None, None, what)

# Extra "worked out, but not tracked" days derived from the notes (see the docstring).
ALT_DAYS = True

PS, CHEST, CURLS, TRI = 'Pistol Squats', '+1 step Chest Press', 'Bicep Curls', 'Bent-over triceps push-ups'
HS1, HS15 = '1min Handstand practice!', '1.5min Handstand practice!'
NB = 'NO BENCH: Dumbbell Rows'

# ---------------------------------------------------------------- Week 38
# "Wed 94.6kg ." + Remark ". Ate b4" → Wednesday notes.
W(38,
  ex=[(PS, ''), (NB, '18kg!'), (CHEST, '26kg'), ('Norm/Arnold S-Press', '12kg'), (CURLS, '14kg'), ('Triceps Ext.', '26kg')],
  exc={4: 'purple'},
  days=[D('Mon', 93.7),
        D('Wed', 94.6, 'Very difficult day, but pain was in check. Good results. Tok 1.5 min breaks instead of 1. — Ate b4'),
        D('Fri', 94.0, 'Drank alcohol, needed more sleep. Went easy on this WO.')],
  sets=[
    [['7', '6', '6'], ['12', '12', '12'], ['12', '7.', '9'], ['12', '12', '12'], ['12', '8', '9'], ['12', '12', '12']],
    [['6', '6', '6.'], ['12', '12', '12'], ['12', '8', '7'], ['12', '12', '12'], ['11', '10', '12.'], ['12!.', '11!.', '10!.']],
    [['7', '6', '6'], ['12', '12', '12'], ['8..', '8.', '9.'], ['12', '12', '11'], ['11', '8', '9'], ['12', '12', '12']],
  ],
  fn={0: ['Right leg first - very good set on right leg!'], 2: ['Out of strength', 'Form was bad, stopped.'],
      4: ["Last 3 doesn't count cause I had a looong break. 3+ min"], 5: ['Barely on the last rep']})

# ---------------------------------------------------------------- Week 39
# Wed S-Press cells are just "." (gold): the handstand practice, see note 1.
W(39,
  ex=[(PS, ''), (NB, '18kg!'), (CHEST, '26kg'), ('Norm/Arnold S-Press', '12kg'), (CURLS, '14kg'), ('Triceps Ext.', '26kg')],
  days=[D('Mon', 95.0), D('Wed'),
        D('Fri', 93.8, 'Great day. Felt it in shoulder, but not at a painful level, only hardening a bit.')],
  sets=[
    [['6', '6', '6'], ['12', '12', '12'], ['12', '9', '8'], ['12', '12', '12'], ['12', '10', '8'], ['12', '12', '12']],
    [['6', '6', '6'], ['12', '12', '12'], ['12', '9', '9'], ['.', '.', '.'], ['10.', '9.', '7.'], ['8.', '6.', '8.']],
    [['6', '6', '6'], ['12', '12', '12'], ['12', '10', '8'], ['5', '3', '3'], ['12', '10', '8'], ['6.', '10.', '8.']],
  ],
  c={(1, 3, 0): 'gold', (1, 3, 1): 'gold', (1, 3, 2): 'gold'},
  fn={3: ['1min Handstand practice! -> Count = Falls'], 4: ['Side of right shoulder slight pain.'],
      5: ['6-10 Bent over triceps push']})

# ---------------------------------------------------------------- Week 40
# Header still says "Norm/Arnold S-Press - 12kg" but the column is the handstand practice (falls counted);
# "Triceps Ext. - 26kg" struck through, "Bent-over triceps push-ups" underneath.
W(40,
  ex=[(PS, ''), (NB, '20kg!'), (CHEST, '26kg'), (HS1, 'Count = Falls'), ('Arn. Bicep Curls', '14kg'), (TRI, '')],
  exc={1: 'purple'},
  days=[D('Mon'), D('Wed', 95.0, 'Day feeling greeeat! Amazing stretching too. Slept good.'), D('Fri', 94.4, 'Had banana')],
  sets=[
    [['6', '6', '6'], ['12⭐', '12⭐', '12'], ['12', '9', '7.'], ['4.', '3.', '3.'], ['12', '10', '7.'], ['6.', '8.', '7.']],
    [['7⭐', '6⭐', '6'], ['12', '12', '12'], ['12', '11', '8..'], ['3.', '3.', '3..'], ['12', '10', '8'], ['10..', '9.. ...', '7..']],
    [['6', '6', '6!'], ['12', '12', '12'], ['12', '10', '8'], ['4.', '4.', '3...'], ['12', '10', '9'], ['9.', '10.', '9.']],
  ],
  c={(1, 5, 1): 'gold'},
  fn={2: ['Careful. Mostly mental fear, not physical limit.', 'Weaker. 2 1/2m break'],
      3: ['1min Handstand practice! -> Count = Falls', 'STRAIGHT leg on wall.', 'Too exhausted for 4'],
      4: ['Thumb on top for good twist'],
      5: ['6-10 Bent over triceps push', 'Amazing form! V shape', 'Pain starting slightly only.']})

# ---------------------------------------------------------------- Week 41
W(41,
  ex=[(PS, ''), (NB, '20kg!'), (CHEST, '26kg'), (HS1, 'Count = Falls'), (CURLS, '14kg'), (TRI, '')],
  days=[D('Mon', 94.1, 'Did new leg stretch, felt great. NO Pre-workout, still great! - A bit tired at bicep curls'),
        D('Wed', 93.6, 'Same as Monday. No pre-w!'), D('Fri')],
  sets=[
    [['6', '6', '6'], ['12', '12', '12'], ['12', '8. ..', '8...'], ['4⭐', '3⭐', '3⭐'], ['12', '12⭐', '9⭐'], ['10', '9', '9']],
    [['7⭐', '6⭐', '6⭐'], ['12', '12', '12'], ['12', '9', '8...'], ['4.⭐', '3..', '4/5 :('], ['12', '10', '8'], ['10', '10', '10']],
    DASH,
  ],
  c={(0, 2, 0): 'gold', (1, 2, 1): 'gold'},
  fn={2: ['Out of strength', 'Pushing shoulders forward helps', 'Did not go all the way down. Left 10%'],
      3: ['Tighten core for straight back HELPED A LOT!', 'Too tired for 1 more']})

# ---------------------------------------------------------------- Week 42
# Handstand notes: "+." → note 1 (cells "+."), "*" → plain note, ".." → note 2.
W(42,
  ex=[(PS, ''), (NB, '20kg!'), (CHEST, '26kg'), (HS1, 'Count = Falls'), (CURLS, '14kg'), (TRI, '')],
  days=[D('Mon', 93.0, 'Sick leave today. Tired. Late workout (7pm)'), D('Wed', 94.0), D('Fri', 93.0)],
  sets=[
    [['6', '6', '6'], ['12', '12', '12'], ['12(24)', '12(24)', '8(24).'], ['+.', '+', '+'], ['12', '11', '10'], ['6.', '6.', '6.']],
    [['6', '6', '6'], ['12', '12', '12'], ['12', '10', '8'], ['50+', '50+', '50+'], ['12', '10', '10'], ['8.', '6.', '6.']],
    [['7', '6', '6'], ['12', '12', '12'], ['12', '10..', '9⭐'], ['50+', '20+20..', '10+20..'], ['12', '10', '10.'], ['9', '8', '8']],
  ],
  fn={2: ['Scared of pain. Went easy', 'Strange pain sensation in left shoulder now :( nothing in right shoulder though.'],
      3: ['+ New method. Walk up, then balance. Counting seconds holding myself up', 'Hand UNDER line - VERY good!'],
      4: ['Did 1 arm at a time due to phone call'], 5: ['On bench']},
  pn={3: ['* Get CLOSE to wall! Tip fwd.']})

# ---------------------------------------------------------------- Week 43
W(43,
  ex=[(PS, ''), (NB, '22kg!'), (CHEST, '26kg'), (HS1, 'Count = Falls *'), (CURLS, '14kg'), (TRI, '')],
  exc={1: 'purple'},
  days=[D('Mon', 91.5, 'Feeling super drained this morning and a bit dizzy'), D('Wed'), D('Fri')],
  sets=[
    [['6⭐', '6⭐', '6⭐'], ['12', '11', '11.'], ['12', '9.', '7.'], ['30+30', '30+20', '30+20..'], ['12', '8', '8'], ['6 1/2.', '9..', '8']],
    DASH,
    [['6', '6', '6'], ['12', '12', '10'], ['12', '8.', '8.'], ['30+30', '20+15!', '12...'], ['12', '11', '8'], ['9..', '8..', '7']],
  ],
  fn={1: ['Barely. Also felt micro-pain.'], 2: ['Stopped 1 before possible pain.'],
      3: ['Out of strength', 'Hand UNDER line - VERY good! UNDER 2ND LINE! ⭐', '12 Sh-Press 14kg'],
      5: ['6, but to absolute failure hah.. GREAT form though*', 'Less perfect form, made it slightly less V shaped. Still good though.']},
  pn={3: ['* Get CLOSE to wall! Tip fwd.']})

# ---------------------------------------------------------------- Week 44
W(44,
  ex=[(PS, ''), (NB, '22kg!'), (CHEST, '26kg'), (HS1, 'Count = Falls *'), (CURLS, '14kg'), (TRI, '')],
  days=[D('Mon'), D('Wed', None, 'No pre-w today. Bad & short sleep also.'), D('Fri')],
  sets=[
    [['7', '6', '6'], ['12', '12', '11'], ['12', '10', '8'], ['Bad', 'Mid.', 'Good!..'], ['12', '9', '11'], ['10', '8', '8']],
    [['6', '6', '6'], ['12', '12', '12'], ['12.', '7..', '6..'], ['Mid', 'Mid', 'Good...'], ['12', '10?', '10?'], ['8', '10', '8']],
    [['6', '6', '6'], ['12', '12', '11.5'], ['12', '8', '7'], ['Mid >', 'Mid', 'Good....'], ['12', '10', '10'], ['10', '8', '7']],
  ],
  fn={2: ['Pushed a bit too hard. Baaarely could push it up.', 'Scared of injury. Took it easy.'],
      3: ['Pretty ok. Did towards the wall this time.', 'Used arms - bend for balance', 'Slow kick-up, focus on control!', 'Left wrist hurt a bit.']},
  pn={4: ['? Forgot to write. Forgot. Feels like blackout. Scary.']})

# ---------------------------------------------------------------- Week 45
W(45,
  ex=[(PS, ''), (NB, '22kg!'), (CHEST, '26kg'), (HS1, 'Count = Falls *'), (CURLS, '14kg'), (TRI, '')],
  days=[D('Mon'), D('Wed'), D('Fri')],
  sets=[
    DASH,
    [['6', '6', '6'], ['12', '12', '12!'], ['11', '8', '9.'], ['Baaad', 'Bad <', 'Mid'], ['12', '11', '10'], ['8', '8', '9']],
    DASH,
  ],
  fn={2: ['Went ALL in, no slow n chill']})

# ---------------------------------------------------------------- Week 46
W(46,
  ex=[(PS, ''), (NB, '18kg!'), (CHEST, '26kg'), (HS1, 'Count = Falls *'), (CURLS, '14kg'), (TRI, '')],
  days=[D('Mon'), D('Wed'), D('Fri')],
  sets=[DASH, DASH, DASH])

# ---------------------------------------------------------------- Week 47
W(47,
  ex=[(PS, ''), (NB, '20kg!'), (CHEST, '24kg'), (HS1, 'Count = Falls *'), (CURLS, '14kg'), (TRI, '')],
  days=[D('Mon'), D('Wed'), D('Fri', None, 'Finally back after holidays! BACK ON! Felt angry today. Channeled the anger WELL!')],
  sets=[
    DASH,
    DASH,
    [['6', '6', '6'], ['12', '12', '12'], ['12', '9', '6'], ['ok', 'ok', 'ok'], ['12', '12', '9'], ['10⭐', '10', '8']],
  ])

# ---------------------------------------------------------------- Week 48
# "22kg!" highlighted yellow in the header → purple (weight increased); "Fri (sat)" → Sat.
W(48,
  ex=[(PS, ''), (NB, '22kg!'), (CHEST, '26kg'), (HS1, 'Count = Falls *'), (CURLS, '14kg'), (TRI, '')],
  exc={1: 'purple'},
  days=[D('Mon'), D('Wed', 91.5, '? I think I forgot to do them lol..'), D('Sat', 90.7)],
  sets=[
    [['6', '6', '6'], ['12', '11', '11'], ['12', '9', '8'], ['Ok +', 'Ok +', 'Good'], ['12', '10', '10'], ['10', '10', '8']],
    [['6', '6', '6'], ['12', '12', '11'], ['12', '8!', '6!!'], ['Bad +', 'Bad.', 'Ok -'], ['12', '12', '12'], ['9', '?', '?']],
    [['6', '6', '6'], ['12', '12', '10'], ['12', '8!', '9 (24)'], ['Ok +', 'Good -', 'Good'], ['12', '10', '8'], ['6.', '8..', '8..!']],
  ],
  fn={3: ["Less energy today. Couldn't do 1 sec even."],
      5: ['Close grip - much harder (aligned with shoulder)', 'Not elevated feed, but shoulder aligned arm width']})

# ---------------------------------------------------------------- Week 49
# Chest: the orange ". Really relaxed my body…" note (a second single-dot note) → plain note; Fri notes "⭐ See text in orange" point at it.
W(49,
  ex=[(PS, ''), (NB, '22kg!'), (CHEST, '26kg'), (HS1, 'Count = Falls *'), (CURLS, '14kg'), (TRI, '')],
  days=[D('Mon', 91.3, 'Monitor: Lower back pain'), D('Wed', 91.1), D('Fri', 90.7, '⭐ See text in orange <------')],
  sets=[
    [['6', '6', '6'], ['12', '12!', '10'], ['12', '9', '6*'], ['bad', 'Ok .', 'Ok -'], ['12', '10', '8'], ['8', '10⭐', '10']],
    [['6', '6', '6'], ['12!.', '10!.', '9!.'], ['11', '8', '6.'], ['Ok -', 'Ok', 'Good!'], ['12', '10', '9.⭐'], ['10!', '10⭐', '8!']],
    [['6', '6', '6!'], ['12', '12', '10'], ['11', '9.', '8.'], ['Good..', 'Good..', 'Good..'], ['12', '8..⭐', '8'], ['10', '8', '7.⭐']],
  ],
  c={(0, 2, 2): 'gold'},
  fn={1: ['Only slight angled lower back. Much harder!'], 2: ['Tired muscles so took it ez to prevent injury'],
      3: ['Discovered: finger tilts back, abs/core/lower back tilts forwards', 'Tried walking up to a handstand, with only sliiight onset.'],
      4: ['Final rep barely, but sloww and proper. Felt great', 'Did the whole set slow and goood.'],
      5: ['Did one wall-handstand pushup-test to get the angle right. Helped a lot and made it harder.']},
  pn={2: ['Really relaxed my body, focused on only engaging what I had to, but controlled.']})

# ---------------------------------------------------------------- Week 50
# Header drops "Count = Falls". Mon/Wed notes kept as typed; "TUESDAY CALISTHENICS" also → Tue other-workout day.
W(50,
  ex=[(PS, ''), (NB, '22kg'), (CHEST, '26kg'), (HS1, ''), (CURLS, '14kg'), (TRI, '')],
  days=[D('Mon', None, '** TUESDAY CALISTHENICS'), *([ALT('Tue', 'Calisthenics')] if ALT_DAYS else []),
        D('Wed', None, '** BODY STILL BROKEN ON WEDNESDAY AND THURSDAY'), D('Fri', 90.8)],
  sets=[
    DASH, *([E] if ALT_DAYS else []),
    DASH,
    [['6', '6', '6'], ['12!', '11', '10'], ['10', '10(24).', '9(24)'], ['Good', 'Good-', 'Bad'], ['12', '12', '11'], ['8.', '8.', '8.']],
  ],
  fn={2: ['Prevent shoulder pain to come back.'], 5: ['Made one proper, against the wall to find form!']})

# ---------------------------------------------------------------- Week 51
# "Wed ⭐" → day marks; the yellow handstand note 2 is kept without colour.
W(51,
  ex=[(PS, ''), (NB, '22kg'), (CHEST, '26kg'), (HS1, ''), (CURLS, '14kg'), (TRI, '')],
  days=[D('Mon', 92.0, '** TUESDAY CALISTHENICS'), *([ALT('Tue', 'Calisthenics')] if ALT_DAYS else []),
        D('Wed', 89.85, '** Pretty good performance for working out yesterday!', '⭐'), D('Fri')],
  sets=[
    DASH, *([E] if ALT_DAYS else []),
    [['6', '6.', '6.'], ['12!.', '8!.', '8(20)!.'], ['11', '7!', '8(24)'], ['Good.', 'YES!!..', 'Bad+'], ['12', '12', '8!'], ['8⭐.', '6..', '4/2...']],
    DASH,
  ],
  fn={0: ['FOCUS: Straight leg when sitting. No hand support. (at the bottom)'], 1: ['Hold for 0,5 seconds on top then down.'],
      3: ['Reversed (faced wall), held 45 seconds before coming down. Close to balance point',
          '8 sec+ hold! Normal way, then legs down to mid, get my hip AWAY from wall to find balance point!'],
      5: ['Did one on the wall!', 'On the bench again, very proper form!', '4 on bench, 2 on floor']})

# ---------------------------------------------------------------- Week 52
W(52,
  ex=[(PS, ''), (NB, '22kg'), (CHEST, '26kg'), (HS15, 'Count = Falls *'), (CURLS, '14kg'), (TRI, '')],
  days=[D('Mon', 90.0, 'Also Calisthenics on Tuesday!'), *([ALT('Tue', 'Calisthenics')] if ALT_DAYS else []),
        D('Wed', 89.90, 'Also Yoga in Evening!'),
        D('Fri', 89.35, 'Hips are messed up today Definitely drained from the week. 2 days rest will help.')],
  sets=[
    [['6', '6', '6 (4kg).'], ['12.', '11.', '8. ..'], ['11', '10⭐.', '8!!..'], ['Ok', 'Bad', 'Good.'], ['9(16)', '10(14)', '9(14)'], ['6!.', '6!.⭐', '6']],
    *([E] if ALT_DAYS else []),
    [['6', '6(2kg)', '6(2kg)'], ['12.', '10.', '10.'], ['11', '9', '9'], ['Ok -', 'Gr8⭐', 'Good..'], ['10(16)', '8(16)', '11(14)'], ['8.⭐..', '6.', '6!']],
    [['6 (2kg)', '6 (2kg)', '6 (2kg) *** ..'], ['12⭐.', '11.', '10.!'], ['10', '8', '8'], ['Gr8⭐', 'Gr8⭐', 'Good'], ['10(16)!', '8(16)!.', '10(14)'], ['8.⭐', '6...', '7!']],
  ],
  fn={0: ['4kg weight per hand to activate shoulders before bench press (2kg next time)', 'Pain in left hip. Too much stretching lately?'],
      1: ['Hold for 0,5 seconds on top then down.', 'Pain said hi, stopped.'],
      2: ['Scapula forward helps!', 'Barely made it, really locked in calmly!'],
      3: ['Put my focus on gripping hands, straight wrists and lower arms. The rest stabilized from there.', 'Almost no kick - almost push-up'],
      4: ['Baaarely!'],
      5: ['Did 1 on wall as well, plus veery good form at start. Then got quickly tired from that.', 'Almost handstand angle!', '3 on the bench.']},
  pn={3: ['⭐ Held maybe 8 sec ish']})

# ---------------------------------------------------------------- Week 53
# Wed: a red "*" before the first handstand cell and before the Wed note → kept as text.
# Fri: a star in every first cell + Notes "⭐⭐⭐ GYM W OLE" → other workout "GYM W OLE", day marks ⭐⭐⭐.
W(53,
  ex=[(PS, '2kg'), (NB, '22kg'), (CHEST, '26kg'), (HS15, ''), (CURLS, '16kg'), (TRI, '')],
  exc={0: 'purple', 4: 'purple'},
  days=[D('Mon', 89.70, "From handstand outwards, felt very weak. Did not eat yet and it's 16:45....."),
        D('Wed', 89.85, '* Quite exhausted from here-on out.'),
        ALT('Fri', 'GYM W OLE', marks='⭐⭐⭐')],
  sets=[
    [['6', '6', '6'], ['12', '11', '10!!'], ['12.⭐', '10.⭐', '8.'], ['bad', 'ok-.', 'bad.'], ['8', '8', '8'], ['8', '8', '8']],
    [['6', '6', '6'], ['12', '12', '9'], ['10', '9🥈..', '7'], ['*Ok-', 'Ok', 'Ok- ..'], ['9!', '8!', '7!!'], ['8', '8', '9']],
    [['⭐', '', ''], ['⭐', '', ''], ['⭐', '', ''], ['⭐', '', ''], ['⭐', '', ''], ['⭐', '', '']],
  ],
  fn={2: ['On each set last rep was when initial failure happened.', "Had NO strength left. Didn't give up and it worked. However, slightly compensation"],
      3: ['Was so close to wall that I could put my butt on it. Straight with wall. Very good exercise for finding weight point',
          'Could look around, and saw myself in the mirror']})

# ---------------------------------------------------------------- Week 54
W(54,
  ex=[(PS, '2kg'), (NB, '22kg'), (CHEST, '26kg'), (HS15, ''), (CURLS, '16kg'), (TRI, '')],
  days=[D('Mon', 90.0, 'SALT in water helps a bit.'), D('Wed', None, 'XMAS PARTY'), D('Fri', None, 'XMAS PARTY')],
  sets=[
    [['6', '6!', '6!'], ['12', '12', '12'], ['11', '10', '9'], ['Ok+', 'Ok+', 'Gr8.'], ['10', '9', '8'], ['7', '9', '7!.']],
    DASH,
    DASH,
  ],
  fn={3: ['Managed a great hold!'], 5: ["Tried 8 but so bad shape that I didn't count it"]})

# ---------------------------------------------------------------- Week 55
# Wed rows "12..." in red (note 3 is red too); "Fri*" → day mark; red "~" kept.
W(55,
  ex=[(PS, '2kg'), (NB, '22kg'), (CHEST, '26kg'), (HS15, ''), (CURLS, '16kg'), (TRI, '')],
  days=[D('Mon', None, 'AMAZING day! Also vocal-wise :)'), D('Wed', 90.70),
        D('Fri', 91.5, 'This day was pain and suffering. Weak and mentally sad from the tiredness.', '*')],
  sets=[
    [['6', '6', '6'], ['12!.', '11!', '12..'], ['12', '8!', '8'], ['Ok.', 'Ok', 'Good-'], ['10', '9', '9'], ['10⭐.', '10⭐.', '8⭐.']],
    [['6', '6', '6'], ['12...', '12...', '12...'], ['10', '10', '8'], ['Ok', 'Ok', 'Ok+..'], ['9.', '8.', '7.!'], ['8!', '~8⭐', '8..']],
    [['6(4)', '6', '6*'], ['12', '12', '12'], ['12', '10', '9!⭐.~'], ['Terrible', 'Baaaad', 'Bad'], ['7!!..', '7!..', '8(14)..'], ['9', '8', '6(on b)']],
  ],
  fn={1: ["Over-supported with abs hurt. Don't do that!", "Also don't limit back-bend too much. Too much focus makes it painful anyway.", '26kg, leg on bench, 1 arm'],
      2: ['Very hard - rep 8 was very tough, but I thought I would do 1 more slow and controlled. Managed barely, but well!'],
      3: ['NEW! Parallel with wall, butt ON wall, practice bringing legs forward in order to use them to find a balance point.', 'Close grip was good!'],
      4: ['Medium-fast up, slowww down!', 'Both arm at once, slow and steady.'],
      5: ['Pre-Workout kicked in AGAIN!! So much energy! AWESOME singing. One against the wall, then 10 on the floor.',
          'Put head on the floor, to activate end of muscle.']})

# ---------------------------------------------------------------- Week 56
# "BENCH:" in yellow text in the header (no fill) → no colour.
W(56,
  ex=[(PS, '2kg'), ('BENCH: Dumbbell Rows', '26kg'), (CHEST, '26kg'), (HS15, ''), (CURLS, '16kg'), (TRI, '')],
  days=[D('Mon', 91.50, 'Headache, maybe getting sick. Feel drained and heavy.'), D('Wed', 90.00), D('Fri', 91.10)],
  sets=[
    [['6', '6', '6'], ['12.', '11', '10'], ['10', '7!!', '8'], ['Bad', 'Bad', 'Gr8.'], ['10', '8', '8'], ['5⭐.', '6', '6']],
    [['6 (4)', '6(4)', '6(4)'], ['10 ***. ..', '12', '11'], ['10~', '9', '8'], ['Ok', 'Gr8', 'Good'], ['9.', '9.', '8'], ['10⭐.', '7', '7']],
    [['6(4)', '6(4)', '6(4)!!'], ['12. ..', '12', '12'], ['12', '9', '9'], ['Ok+', 'Ok', 'Ok-'], ['11', '10', '8'], ['7.5(1.5)', '7(1)', '7(1)']],
  ],
  fn={1: ['No bench.', "Back pain. Too wide legs - make them closer to each other, and don't go too inwards with the dumbbells."],
      3: ['Up to wall - focused on LIFTING the foot off the wall, not AT ALL kicking/bouncing it off.'],
      4: ['Kinda push down on the way down'],
      5: ['REALLY used the (one) *handstand-pushup to FIND the muscle to focus on. Then 5 on floor.']},
  pn={4: ["DON'T do both arms."]})

# ---------------------------------------------------------------- Week 57
# Triceps note 3 links the YouTube video embedded in the sheet (found by its title).
W(57,
  ex=[(PS, 'MOVE TOWARDS PRISONER PS.'), ('BENCH: Dumbbell Rows', '26kg'), (CHEST, '26kg'), (HS15, ''), (CURLS, '16kg'), (TRI, '')],
  exc={0: 'purple'},
  days=[D('Mon', 91.30), D('Wed', 89.00), D('Fri', 91.25)],
  sets=[
    [['6', '6.', '6.'], ['12.', '12', '12'], ['12', '8.', '8.'], ['Ok', 'Ok', 'Bad.'], ['12', '8', '8'], ['10(1)', '8', '7(1)']],
    [['6', '6', '6'], ['12', '12', '12'], ['11. ..', '10. ..', '9. ..'], ['Gr8+..', 'Gr8..', 'Good'], ['12', '10.', '8.'], ['7.5(1.5)', '8(1)', '8!!.']],
    [['6', '6', '6'], ['12', '12', '12'], ['12!⭐', '9. ..', '8. ..~'], ['Ok...', 'PERF...', 'Gr8...~'], ['11', '9', '9'], ['9(2)', '8(1)..', '6...']],
  ],
  fn={0: ['Raise heel makes it a bit easier. Arms behind back on the way down, then in front on the way up.'],
      1: ['No Bench'],
      2: ['BIG focus on "straight" elbows/arms to really target the chest, and not traps.', 'Slow down on last rep'],
      3: ['Mostly bad because demotivated', '⭐ Focused on breathing while holding! Was great',
          'Focused on MEGA-controlled muscles. MINIMAL bounce, even at the top.'],
      4: ['To failure'],
      5: ['After 4 reps I was completely out, the rest was very flat', 'Not very good form.',
          'PIKE push-up [Master Handstand Push-Ups (TOP 10 EXERCISES)](https://www.youtube.com/watch?v=IQvCU0kLvds)']})

# ---------------------------------------------------------------- Week 58
W(58,
  ex=[(PS, 'MOVE TOWARDS PRISONER PS.'), ('BENCH: Dumbbell Rows', '28kg'), (CHEST, '26kg'), (HS15, ''), (CURLS, '16kg'),
      (TRI, 'x = floor, y = bench, z = wall')],
  exc={1: 'purple'},
  days=[D('Mon', 91.20, 'Super distracted today. Made many too-long breaks.'),
        D('Wed', 91.05, 'Start: 11:52 with stretch, end 12:52 with LOTS of distractions Start 12:53 with WO, end 14:32, some distractions'),
        D('Fri', 90.40)],
  sets=[
    [['6', '6', '6'], ['12', '12', '12'], ['12', '10', '10'], ['Ok', 'Ok-', 'Good'], ['12', '11', '10'], ['8(1).', '8(1).', '5(2).']],
    [['6', '6', '6'], ['12!', '12!', '12!'], ['12', '10⭐.', '10. *..~'], ['Ok', 'Ok', 'Ok+.'], ['11', '10!', '8'], ['2(5)..', '2(5)..', '2(5)..']],
    [['6', '6', '6'], ['12', '12', '12'], ['12...', '9...', '9...'], ['Bad', 'Ok-', 'Bad+'], ['11', '8!.', '9'], ['1.5(5)..', '1(7)..', '2(8)']],
  ],
  fn={2: ['I might have done 12, 10 ,10. But not sure about 3rd set, so doing a 4th just in case.', 'Something in right shoulder??!', 'Focus on chesst, not arms'],
      3: ['Imagined leomoves control+str+speed.'],
      4: ['Whole body feels drained. Brain is overwhelmed, so giving my nervous system an easier time.'],
      5: ['y(x)', 'z(y)']})

# ---------------------------------------------------------------- Week 59
# Mon "Did heavy cali on Tuesday tho." → Tue other-workout day; Fri "GYM w/Ole on Saturday!" → Sat other-workout day.
W(59,
  ex=[(PS, 'MOVE TOWARDS PRISONER PS.'), ('BENCH: (1st set without) Dumbbell Rows', '28kg'), (CHEST, '26kg'), (HS15, ''), (CURLS, '16kg'),
      (TRI, 'x = wall, y = bench, z = floor')],
  days=[D('Mon', None, "Didn't do, no time. Did heavy cali on Tuesday tho."), *([ALT('Tue', 'Heavy cali')] if ALT_DAYS else []),
        D('Wed'), D('Fri', 89.90, 'GYM w/Ole on Saturday!'), *([ALT('Sat', 'GYM w/Ole')] if ALT_DAYS else [])],
  sets=[
    DASH, *([E] if ALT_DAYS else []),
    [['6', '6', '6'], ['12', '12', '12'], ['11.', '10.', '8.'], ['Bad', 'Ok-', 'Bad'], ['12!', '9', '8!.'], ['2(6).', '3(5).', '6..']],
    DASH, *([E] if ALT_DAYS else []),
  ],
  fn={2: ['Focused big on the GAP between the dumbbells to create proper chest WO.'], 4: ['Tried 9 but no strength :D'], 5: ['z(y)', 'y']})
