"""Transcription of Ari's OneNote workout log, weeks 1-16 (screenshots, Sept 2026).

Notation is the original sheet notation and is decoded by scripts/import/build.py:
  - set cells: text as typed; runs of dots = footnote refs (run length = note number),
    '…' = 3 dots, '⭐' = star. "" = empty.
  - fn: footnote texts per exercise, in order (index 0 = note 1); None keeps a gap.
  - c: cell colours {(day_index, exercise_index, set_index): legend_id}
  - exc: exercise header colours {exercise_index: legend_id}
  - days: (weekday, bodyweight, notes, marks, day_colour, notes_colour)
  - x: extra per-week notes (Notes-column footnote cell / header) → week.notes
Rules agreed with Ari 2026-09-21: Week 1 = Mon 3 Feb 2025, consecutive; Week 4 rows
Mon set 2 "10.5" → "10"; Week 4 Wed grey row = no colour; day-level footnotes → day notes.
"""

WEEKS = []

def W(n, ex, days, sets, fn=None, c=None, exc=None, x=None):
    WEEKS.append(dict(n=n, ex=ex, days=days, sets=sets, fn=fn or {}, c=c or {}, exc=exc or {}, x=x))

# ---------------------------------------------------------------- Week 1
W(1,
  ex=[('Walking Lunges', '14kg'), ('Dumbbell Rows', '14kg'), ('Chest Press', '16kg'),
      ('Shoulder Press', '8kg'), ('Bicep Curl (alternating)', '8kg'), ('Triceps Ext.', '16kg')],
  days=[('Mon', None, '', '', None, None), ('Wed', None, '', '', None, None), ('Fri', None, '', '', None, None)],
  sets=[
    [['', '', ''], ['', '', ''], ['', '', ''], ['', '', ''], ['', '', ''], ['', '', '']],
    [['12', '12', '12'], ['12', '12', '12'], ['12', '12', '12'], ['12', '12', '9'], ['12', '12', '8'], ['12(14)', '12(14)', '12(14)']],
    [['12', '12', '8'], ['12', '12', '12'], ['12', '12', '12'], ['12', '12', '12'], ['12', '12', '11'], ['12', '12', '8']],
  ])

# ---------------------------------------------------------------- Week 2
W(2,
  ex=[('Walking Lunges', '14kg'), ('Dumbbell Rows', '16kg'), ('Chest Press', '18kg'),
      ('Shoulder Press', '10kg'), ('Bicep Curls', '10kg'), ('Triceps Ext.', '16kg')],
  days=[('Mon', None, '', '', None, None), ('Wed', None, '', '', None, None), ('Fri', None, '', '', None, None)],
  sets=[
    [['12', '12', '12'], ['12', '12', '11'], ['12', '10', '8'], ['12', '9', '9'], ['12', '10', '8'], ['12', '11', '11']],
    [['12', '12', '12'], ['12', '12', '12'], ['12', '12', '8'], ['12', '11', '7'], ['12', '10', '8!'], ['12', '11', '9']],
    [['12(16)', '12(16)', '8(16)'], ['12(18)', '11(18)', '11(18)'], ['12', '12', '12'], ['12', '12', '9'], ['12', '12', '9'], ['12', '12', '12']],
  ])

# ---------------------------------------------------------------- Week 3
W(3,
  ex=[('Walking Lunges', '16kg'), ('Dumbbell Rows', '18kg'), ('Chest Press', '18kg'),
      ('Shoulder Press', '10kg'), ('Bicep Curls', '10kg'), ('Triceps Ext.', '26kg')],
  exc={0: 'purple'},
  days=[('Mon', None, '', '', None, None), ('Wed', None, '', '', None, None), ('Fri', None, '', '', None, None)],
  sets=[
    [['12', '12', '10'], ['12', '12', '11'], ['12', '12', '12'], ['12', '10', '10'], ['8(12)', '10', '9'], ['12', '12', '12']],
    [['12', '12', '12'], ['12', '12', '12'], ['12(20)', '9(20)', '8'], ['12', '12', '8'], ['10(12)', '10', '8'], ['10(18)', '12', '12']],
    [['12(18)', '8(18)', '8(16)'], ['12(20)', '12(20)', '11(20)'], ['12(20)', '10(20)', '9(20)'], ['12', '10', '11'], ['11(12)', '8(12)', '8'], ['12(18)', '10(18)', '?(18)']],
  ])

# ---------------------------------------------------------------- Week 4
W(4,
  ex=[('Bulg. Split Squats', '14(10) kg'), ('Dumbbell Rows', '22kg'), ('Chest Press', '22kg'),
      ('Shoulder Press', '12kg'), ('Bicep Curls', '12kg'), ('Triceps Ext.', '20kg')],
  days=[('Mon', None, '', '', None, None), ('Wed', None, '', '', None, None), ('Fri', None, '', '', None, None)],
  sets=[
    [['12!!', '8!!', '8!!'], ['12', '10', '10'], ['12', '10', '8'], ['12', '12', '8'], ['12', '9!!', '8!!'], ['12', '13⭐', '9']],
    [['12!!.', '8!!.', '8(10)!!.'], ['12.', '11.', '9.'], ['10.', '12.', '8.'], ['12', '11', '10'], ['12', '11.', '8'], ['12', '12', '9']],
    [['12', '10', '10'], ['12', '10', '10'], ['12', '10', '8'], ['12', '12', '8'], ['12', '12', '10'], ['12', '10', '10']],
  ],
  fn={0: ['Pushed way too hard'], 1: ['Wrecked from 1st exercise'], 2: ['Bench BROKE. In panic.'], 4: ['Chill music. No push push.']})

# ---------------------------------------------------------------- Week 5
# "Mon ." → the day-level note "No pre-workout + Just Ate" goes into Monday's notes (Ari, 2026-09-21).
W(5,
  ex=[('Bulg. Split Squats', '10 kg'), ('Dumbbell Rows', '22kg'), ('Chest Press', '22kg'),
      ('Shoulder Press', '12kg'), ('Bicep Curls', '12kg'), ('Triceps Ext.', '20kg')],
  days=[('Mon', None, 'No pre-workout + Just Ate', '', None, None),
        ('Wed', None, 'Amazing WO with Kawtar', '', None, None),
        ('Sat', None, 'Great workout day. First thing in the morning.', '', None, None)],
  sets=[
    [['12', '10', '10'], ['12', '11', '8'], ['12', '11', '7!'], ['12! .', '10.', '8..'], ['12', '12', '9'], ['12', '10', '9']],
    [['12', '12', '11'], ['12', '12', '10'], ['12', '12', '9'], ['12', '11', '8'], ['12', '11', '9'], ['10', '12', '10']],
    [['12', '12', '11'], ['12', '12', '10'], ['12', '12', '8'], ['12', '12', '11'], ['12', '12', '9'], ['12', '10', '11']],
  ],
  fn={3: ['Feeling the lack of pre-w.', 'Food coming up? Lol..']})

# ---------------------------------------------------------------- Week 6
W(6,
  ex=[('Bulg. Split Squats', '10 kg'), ('Dumbbell Rows', '22kg'), ('Chest Press', '22kg'),
      ('ARNOLD Sh-Press', '10kg'), ('Bicep Curls', '12kg'), ('Triceps Ext.', '20kg')],
  days=[('Mon', None, '10kg arnold = good for this wk. Sliiiight pain after. Be careful.', '', None, None),
        ('Wed', 97.5, 'Be very careful about form on Arnold. If pain on Fri, go to 8kg.', '', None, None),
        ('Fri', 97.3, '', '', None, None)],
  sets=[
    [['12', '12', '12'], ['12', '12', '11'], ['12', '12', '6!.'], ['12', '12.', '10***'], ['12.***', '11!!**', '8..***'], ['12', '11', '11']],
    [['12', '12', '12'], ['12', '12', '12'], ['12', '11..', '11..'], ['12', '12', '8..***'], ['12', '12!', '9'], ['12', '12', '9.']],
    [['12', '12', '12'], ['12', '12.', '12'], ['12', '12', '10'], ['12', '12', '12'], ['12', '12', '8'], ['12', '11', '11']],
  ],
  fn={1: ['Starting to feel belly-ache, unrelated to the workout'],
      2: ['Muscle fatigue', 'Fatigue! Much energy tho? Being careful. 2min break.'],
      3: ['Buurns lovely', 'Sliiiight pain after. Be careful.'],
      4: [None, 'Took it easy bc. pain'],
      5: ['Took it easy to avoid injury']},
  x='NOTE: ARNOLD!!')

# ---------------------------------------------------------------- Week 7
E = [['', '', '']] * 6
W(7,
  ex=[('Bulg. Split Squats', '12 kg'), ('Dumbbell Rows', '24kg'), ('Chest Press', '22kg'),
      ('Arnold S-Press', '10kg'), ('Bicep Curls', '12kg'), ('Triceps Ext.', '20kg')],
  exc={0: 'purple', 1: 'purple'},
  days=[('Mon', 97.9, '', '', None, None),
        ('Wed', None, 'Darmstadt. No Workout', '', 'red', None),
        ('Fri', None, 'Darmstadt. No Workout', '', 'red', None)],
  sets=[
    [['12', '10', '10'], ['12', '10', '8'], ['12', '12', '10'], ['12', '12', '12'], ['12', '12', '10'], ['12', '12', '11']],
    E, E,
  ])

# ---------------------------------------------------------------- Week 8
W(8,
  ex=[('Bulg. Split Squats', '12 kg'), ('Dumbbell Rows', '24kg'), ('Chest Press', '22kg'),
      ('Arnold S-Press', '12kg'), ('Bicep Curls', '12kg'), ('Triceps Ext.', '20kg (22kg)')],
  exc={3: 'purple'},
  days=[('Mon', 98.0, 'Very exhausted today.', '', None, None),
        ('Wed', 98.2, 'Bouldering yesterday!', '', None, None),
        ('Fri', None, 'Too exhausted for WO.', '', 'red', None)],
  sets=[
    [['12', '10', '10'], ['12', '11', '9'], ['12', '12', '8'], ['12', '8!', '12!!.'], ['12', '12', '12!!'], ['12', '12', '12']],
    [['12', '12', '10'], ['12', '12', '10'], ['12.', '12', '8..'], ['12', '10', '9'], ['12', '12', '12!'], ['12', '12', '11']],
    E,
  ],
  c={(1, 5, 0): 'purple', (1, 5, 1): 'purple', (1, 5, 2): 'purple'},
  fn={2: ['24', 'Got scared(fatigue)'], 3: ['10kg (also careful).']})

# ---------------------------------------------------------------- Week 9
W(9,
  ex=[('Bulg. Split Squats', '12 kg'), ('Dumbbell Rows', '24kg'), ('Chest Press', '22kg'),
      ('Norm/Arnold S-Press', '12kg'), ('Bicep Curls', '12kg'), ('Triceps Ext.', '22kg')],
  exc={5: 'purple'},
  days=[('Mon', 97.4, 'Starting out very exhausted', '*', None, None),
        ('Wed', 97.5, 'Norm, then arnold shoulder press for both worlds. Or mix', '', None, 'gold'),
        ('Fri', 97.2, '', '', None, None)],
  sets=[
    [['12', '10', '11'], ['12', '11', '11'], ['12', '12', '10'], ['12!', '11', '8'], ['12', '12', '10!!'], ['12', '10!', '9!']],
    [['12', '12', '11'], ['12', '11', '10'], ['12', '12', '9'], ['12', '12.', '6/6'], ['12', '12', '12!!'], ['12', '12!', '9!']],
    [['12', '12', '12'], ['12', '12', '10'], ['12', '12', '10'], ['12', '10..', '10'], ['12', '12', '12'], ['12', '12', '12']],
  ],
  fn={3: ['Trying half arnold, half normal. Maybe go to norm?', 'Arn/norm/arn/norm']})

# ---------------------------------------------------------------- Week 10
# "Chest Press - 24kg ." → header dot; the note stays on Chest Press without a set reference.
W(10,
  ex=[('Bulg. Split Squats', '12 kg'), ('Dumbbell Rows', '24kg'), ('Chest Press', '24kg'),
      ('Norm/Arnold S-Press', '12kg'), ('Bicep Curls', '14kg'), ('Triceps Ext.', '22kg')],
  exc={2: 'purple', 4: 'purple'},
  days=[('Mon', 97.4, '', '', None, None),
        ('Wed', 97.3, 'Mixed S-press and Curls, so I switched after 1 set.', '', None, None),
        ('Sat', 98.2, 'Mad exhausted today. Bad food, bad sleep.', '', None, None)],
  sets=[
    [['12', '12', '12'], ['12', '12', '11'], ['12', '10', '8'], ['12', '12', '12'], ['(12)', '10', '8!!'], ['12', '11', '8!']],
    [['12', '12', '12'], ['12', '12', '11'], ['12', '10', '8'], ['12.', '12', '12'], ['12', '12!..', '10'], ['12.', '12.', '14.']],
    [['12', '12', '12'], ['12', '12', '12'], ['12', '10', '8'], ['12', '12', '12'], ['12!!', '10!', '8!'], ['12.', '12.', '12.']],
  ],
  c={(0, 4, 1): 'purple', (0, 4, 2): 'purple'},
  fn={2: ["24kg feels hard. Keep goin'"], 3: ['Did a curl by mistake. ->'], 4: [None, '"round 2"'],
      5: ['reverse cock-norm-cock grip. More str this way? - Confirmed: c-n-c is harder.']})

# ---------------------------------------------------------------- Week 11
# Wed Notes cell contains just "*" → day mark. Triceps footnote cell explains the *** marks (kept as note 1, unreferenced).
W(11,
  ex=[('Bulg. Split Squats', '14 kg'), ('Dumbbell Rows', '24kg'), ('Chest Press', '24kg'),
      ('Norm/Arnold S-Press', '14kg'), ('Bicep Curls', '14kg'), ('Triceps Ext.', '24kg')],
  exc={0: 'purple', 3: 'purple', 5: 'purple'},
  days=[('Mon', 98.7, '', '', None, None),
        ('Wed', 96.9, '', '*', None, None),
        ('Fri', 97.5, '', '', None, None)],
  sets=[
    [['12', '10', '8'], ['12', '12', '12!!'], ['12!', '12', '9'], ['12', '8!', '8'], ['12', '11', '9!'], ['11', '10', '8']],
    [['12', '11', '9'], ['12', '12', '12'], ['12', '10!', '10!!'], ['12!!', '12.', '12.'], ['12', '11!!', '8.'], ['11', '11', '8***']],
    [['12', '11', '9'], ['12', '12', '12!'], ['12', '12.', '9'], ['12', '12.!', '10'], ['12..', '12', '9'], ['12', '11', '12']],
  ],
  fn={2: ['That was a great set somehow'], 3: ['2 minute break +'],
      4: ['Bad form (swing)', 'Ate small rice cake before'],
      5: ['*** Pain in wrists when bringing weight down again']},
  x='Small rice cake after fast while working out was great!')

# ---------------------------------------------------------------- Week 12
W(12,
  ex=[('Bulg. Split Squats', '14 kg'), ('Dumbbell Rows', '24kg'), ('Chest Press', '24kg'),
      ('Norm/Arnold S-Press', '14kg'), ('Bicep Curls', '14kg'), ('Triceps Ext.', '24kg')],
  days=[('Mon', None, 'Party weekend, danced instead. Needed pause.', '', 'red', None),
        ('Wed', 97.9, '', '', None, None),
        ('Fri', None, 'Low stamina, very tired. Started late & After food.', '', None, None)],
  sets=[
    E,
    [['12', '11', '9'], ['12', '12', '12.'], ['12', '11', '8!!'], ['12', '12', '10!'], ['12', '11.', '8.'], ['12', '11', '10']],
    [['12', '12.', '9'], ['12', '12', '11'], ['12', '12', '9'], ['12', '10', '8'], ['12', '11.', '8'], ['12', '12', '10']],
  ],
  fn={1: ['Sloppy form..'], 4: ['Good form (no swing)']})

# ---------------------------------------------------------------- Week 13
# "Fri 97.1kg." + Remark footnote ". 96.7 after WO!" → Friday notes (Ari, 2026-09-21).
W(13,
  ex=[('Bulg. Split Squats', '14 kg'), ('Dumbbell Rows', '24kg'), ('Chest Press', '24kg'),
      ('Norm/Arnold S-Press', '14kg'), ('Bicep Curls', '14kg'), ('Triceps Ext.', '24kg')],
  days=[('Mon', 98.0, 'Muscle fatigue. Have energy, but strength gone.', '', None, None),
        ('Wed', 96.5, '', '', None, None),
        ('Fri', 97.1, 'This day was exceptionally good. Not a good reference :) — 96.7 after WO!', '', None, None)],
  sets=[
    [['12', '12', '10'], ['12', '12', '11'], ['12', '12!.', '7!!'], ['12!', '10!', '8'], ['12', '10!', '7!'], ['12.', '12.', '12.']],
    [['12', '12', '10'], ['12', '12', '12.'], ['12', '12!', '9!'], ['12', '12', '10'], ['12', '10', '9'], ['12', '12', '12..']],
    [['12', '12', '12'], ['12', '12', '12'], ['12', '12', '11'], ['12.', '12.', '12.'], ['12', '12.', '10'], ['12', '12', '12']],
  ],
  fn={1: ['2-3 min break'], 2: ['Very hard since rep 8'], 3: ['Veery easy day for this!', 'Long breaks though..'],
      4: ['Good form! -> Did not sacrifice on form at all.'], 5: ['Did this exercise slightly fast', 'Barely made it']},
  x='DISCOVERY: Pulsing on my muscles seem to make them recover faster')

# ---------------------------------------------------------------- Week 14
W(14,
  ex=[('Bulg. Split Squats', '14 kg'), ('Dumbbell Rows', '24kg'), ('Chest Press', '24kg'),
      ('Norm/Arnold S-Press', '14kg'), ('Bicep Curls', '14kg'), ('Triceps Ext.', '24kg')],
  days=[('Mon', 97.5, '', '', None, None),
        ('Wed', 96.8, 'Altern. DR & CP Feels great!! Almost only 1 min br. Today!', '', None, None),
        ('Fri', 98.2, 'Day very hard from mid Norm/Arnold S-press onwards', '', None, None)],
  sets=[
    [['12', '12', '10'], ['12', '12', '10.!'], ['12', '12', '8'], ['12', '10', '8.'], ['12', '9', '10'], ['12', '12', '12']],
    [['12.', '12.', '10'], ['12..', '12..', '12..'], ['12', '12', '12'], ['12', '12', '10..'], ['12', '11', '10!.'], ['12', '12', '12.']],
    [['12', '12', '12'], ['12', '12', '12'], ['12', '12', '12!!'], ['12', '10', '6+2'], ['12', '12', '12'], ['12', '12', '12']],
  ],
  fn={0: ['Good, new form.'], 1: ['Barely', 'Good form!'], 3: ['Being extra careful', 'Not careful & terrible form'],
      4: ['Added swing - too hard.'], 5: ['Veery easy']})

# ---------------------------------------------------------------- Week 15
W(15,
  ex=[('Pistol Squats', '4kg'), ('Dumbbell Rows', '26kg'), ('Chest Press', '26kg'),
      ('Norm/Arnold S-Press', '14kg'), ('Bicep Curls', '14kg'), ('Triceps Ext.', '26kg')],
  exc={1: 'purple', 2: 'purple', 5: 'purple'},
  days=[('Mon', 96.2, 'Grrreat day. Alt. Chest/Rows. Weight down to 95.5kg after', '', None, None),
        ('Wed', None, '', '', None, None),
        ('Fri', 96.1, 'DB Row with bench feels much more effective for growth.', '', None, None)],
  sets=[
    [['8', '8', '8'], ['12', '11', '10'], ['12', '10', '10'], ['6+6', '6+6', '10'], ['12', '12', '10+2'], ['12', '10', '10']],
    [['10', '8', '8.'], ['12', '12', '12.'], ['12', '12', '8.'], ['12', '12', '10'], ['12', '12.!!', '9'], ['12', '12', '10']],
    [['8', '7..', '8..'], ['12..', '12..', '12..'], ['12', '12', '12'], ['12', '12', '12'], ['12', '12..', '12'], ['12', '12', '12']],
  ],
  c={(2, 0, 1): 'brown', (2, 0, 2): 'green'},
  fn={0: ['+4kg gives added balance', 'Switched to bench+swing'], 1: ['dunno.. Just managed?', '/w Bench!'],
      2: ['Careful. Near pain from row'], 4: ['2 min break, still hard', 'Last rep was bad form.']})

# ---------------------------------------------------------------- Week 16
W(16,
  ex=[('Bench + Swing Pistol Squats', ''), ('Dumbbell Rows', '26kg'), ('Chest Press', '26kg'),
      ('Normal S-Press', '14kg'), ('Bicep Curls', '14kg'), ('Triceps Ext.', '26kg')],
  days=[('Mon', 96.7, '', '', None, None),
        ('Wed', None, 'Very painful day. Only gentle weight, and superb posture.', '', 'red', None),
        ('Fri', None, '', '', None, None)],
  sets=[
    [['8', '8', '8'], ['12', '13⭐', '12'], ['12', '12!!', '10.***'], ['12', '12', '12'], ['12', '12', '12'], ['12', '12.', '11.']],
    [['***.', '***.', '***.'], ['12', '12', '12'], ['12', '12', '12'], ['12', '12***.', 'N/A'], ['12', '12***.', 'N/A'], ['10', 'N/A', 'N/A']],
    [['8', '8', '8'], ['12', '12', '12!'], ['12', '10', '12!!'], ['12..', '12..', '12.. …'], ['12', '12', '10'], ['8 ..', '12 …', '11']],
  ],
  fn={0: ['Knee pain. Gentle movements only.'], 2: ['Careful - slight pain in r shoulder'],
      3: ['Dropped to 10kg. Pai', 'NOTE = NORMAL NOW!', 'Much easier than previous set. Bc switch to curls(?)'],
      4: ['Dropped to 10kg. Pain'],
      5: ['Extremely good form. Near-full extend & controlled', 'Slow. 2 sec up, 3-5 down', 'Normal tempo again.']},
  x='NEXT WEEK MONDAY - NEW METHOD OF SLOWWW.C')
