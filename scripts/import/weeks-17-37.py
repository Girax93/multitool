"""Transcription of Ari's OneNote workout log, weeks 17-37 (screenshots, 2026-09-22).

Same notation as weeks-01-16.py (decoded by scripts/import/build.py):
  - set cells: text as typed; runs of dots = footnote refs (run length = note number),
    '…' = 3 dots, '⭐' = star. "" = empty.
  - fn: numbered footnotes per exercise, in order (index 0 = note 1); None keeps a gap.
  - pn: plain notes per exercise (no dot in the sheet, not referenced) → shown without a number.
  - c: cell colours {(day_index, exercise_index, set_index): legend_id}
  - exc: exercise header colours {exercise_index: legend_id}
  - days: (weekday, bodyweight, notes, marks, day_colour, notes_colour[, other_workout])
    other_workout = "worked out, but not tracked" (Week 34: a YouTube session instead).
  - x: week-level notes (Notes-column header cell) → week.notes
Decisions for this batch (2026-09-22, see the project doc):
  - deload weights written as "26kg → 18kg" (the sheet has the reduced weight in red);
  - Week 21 Fri two-line cells "12 / 12kg!" → "12(12)!" (the sheet's own (x) convention);
  - Week 30 "Wed" was trained on Thursday → weekday Thu, the note "Thursday." is kept;
  - the brick-red NORWAY / SICK rows (18-20) → day colour red ("Did not do");
  - Week 33's ❌ cells → "✗"; Week 29 Triceps 24kg vs 20kg in the two screenshots → 20kg (asked Ari);
  - Week 34's lbs→kg table (Mon Notes cell) → week note; its purple day labels → day colour purple.
"""

WEEKS = []

def W(n, ex, days, sets, fn=None, pn=None, c=None, exc=None, x=None):
    WEEKS.append(dict(n=n, ex=ex, days=days, sets=sets, fn=fn or {}, pn=pn or {}, c=c or {}, exc=exc or {}, x=x))

E = [['', '', '']] * 6
D = lambda wd, bw=None, notes='', marks='', colour=None, nc=None: (wd, bw, notes, marks, colour, nc)

# ---------------------------------------------------------------- Week 17
W(17,
  ex=[('Pistol Squats', ''), ('Dumbbell Rows', '26kg → 18kg'), ('Chest Press', '26kg → 18kg'),
      ('Norm S-Press', '14kg → 10kg'), ('Bicep Curls', '14kg → 10kg'), ('Triceps Ext.', '26kg → 18kg')],
  days=[D('Mon', 98.1, 'Haaard on the hands/wrists! Very difficult, but very good!'),
        D('Wed', 96.2),
        D('Fri', 97.6, 'S-P!! Straight chest!! Core FLEXED. Not puffing up like chest press. EXHALED when UP!')],
  sets=[
    [['8', '8', '8'], ['12', '10', '10'], ['12', '10', '10'], ['12', '10', '10'], ['12', '10', '8'], ['12', '10', '8']],
    [['8', '8', '8'], ['12', '10', '12'], ['12', '12', '12'], ['12', '12', '12'], ['12', '11', '11'], ['12', '11', '8']],
    [['8', '8', '8'], ['12', '12', '12'], ['12', '12', '12'], ['7***. ..', '12', '12'], ['12', '12', '12'], ['12', '10', '9']],
  ],
  fn={3: ['Felt a "pop" in side of ribcage. Next time; don\'t pop out my ribcage, tighten core like getting a punch, lower ribs intact.',
          'NB! DID 14KG, NOT 10!'],
      4: ['NB! DID 14KG, NOT 10!']},
  pn={5: ['SAME WITH S-P. CHEST IN! TIGHT CORE. LIKE PLANK!']},
  x='LOWER WEIGHT (-30/40% ish). 2 sec up, 3-5 sec down EACH.')

# ---------------------------------------------------------------- Week 18
W(18,
  ex=[('Pistol Squats', ''), ('Dumbbell Rows', '26kg → 18kg'), ('Chest Press', '26kg → 18kg'),
      ('Norm/Arnold S-Press', '10kg'), ('Bicep Curls', '10kg'), ('Triceps Ext.', '26kg → 18kg')],
  days=[D('Mon', 96.6),
        D('Wed', 97.4, 'First sets FULL weight. (like old)', nc='gold'),
        D('Fri', None, 'NORWAY', colour='red')],
  sets=[
    [['8', '8', '8'], ['12', '12', '12.'], ['12', '12', '12.'], ['12', '12.', '12'], ['12', '12', '12'], ['12', '10', '8']],
    [['8', '8', '8'], ['12', '12', '12'], ['12', '12', '12'], ['12', '12', '12'], ['12', '12', '12'], ['12', '11', '11.']],
    E,
  ],
  fn={1: ['Hands/wrists are dead...'], 2: ['Hands/wrists are dead...'], 3: ['Seated on bench'], 5: ['Did full weight on last set']},
  x='LOWER WEIGHT (-30/40% ish). 2 sec up, 3-5 sec down EACH.')

# ---------------------------------------------------------------- Week 19
W(19,
  ex=[('Pistol Squats', ''), ('Dumbbell Rows', '26kg'), ('Chest Press', '26kg'),
      ('Norm/Arnold S-Press', '14kg'), ('Bicep Curls', '14kg'), ('Triceps Ext.', '26kg')],
  days=[D('Mon', None, 'NORWAY', colour='red'), D('Wed', None, 'NORWAY', colour='red'), D('Fri', None, 'NORWAY', colour='red')],
  sets=[E, E, E])

# ---------------------------------------------------------------- Week 20
W(20,
  ex=[('Pistol Squats', ''), ('Dumbbell Rows', '26kg'), ('Chest Press', '26kg'),
      ('Norm/Arnold S-Press', '14kg'), ('Bicep Curls', '14kg'), ('Triceps Ext.', '26kg')],
  days=[D('Mon', 96.6, 'SICK', colour='red'), D('Wed', None, 'SICK', colour='red'), D('Fri', None, '', colour='red')],
  sets=[E, E, E])

# ---------------------------------------------------------------- Week 21
# Fri S-Press / Curls cells have the weight on a second line ("12 / 12kg!") → "12(12)!".
W(21,
  ex=[('Pistol Squats', ''), ('Dumbbell Rows', '26kg → 18kg'), ('Chest Press', '26kg → 18kg'),
      ('Norm/Arnold S-Press', '10kg'), ('Bicep Curls', '10kg'), ('Triceps Ext.', '26kg → 18kg')],
  days=[D('Mon', 96.5, '!! ROUGH getting back to it!'),
        D('Wed', None, 'Ok - better than Monday.'),
        D('Fri', 96.7, 'Already a muuch better day! - except tricep extensions...')],
  sets=[
    [['8', '8', '8'], ['12', '12.', '10.'], ['12', '10', '9'], ['12', '10.', '10..'], ['12', '10', '8'], ['8!', '10.', '8.']],
    [['8', '8', '8'], ['12', '12', '12..'], ['12', '10', '10'], ['12', '12', '12'], ['12', '12', '12'], ['12', '10', '8']],
    [['9.', '8.', '8.'], ['12', '12', '12'], ['12', '12', '11'], ['12(12)!', '8(12)', '12(10)'], ['12(12)', '8(12)', '10(12)'], ['11!', '8!!', '8!..']],
  ],
  fn={0: ['Generally much better! Form improved.'], 1: ['Used hand supports', 'Hand support on last 4'],
      3: ['Rapid break at 8 reps', 'Sitting, leaning back'], 5: ['14 kg! Lost strength.', '16kg. Fatigue.']})

# ---------------------------------------------------------------- Week 22
W(22,
  ex=[('Pistol Squats', ''), ('Dumbbell Rows', '24kg'), ('Chest Press', '24kg'),
      ('Norm/Arnold S-Press', '14kg'), ('Bicep Curls', '14kg'), ('Triceps Ext.', '26kg')],
  days=[D('Mon', 97.1, 'More explosive, no longer slow!'), D('Wed', 96.5), D('Fri', 95.8)],
  sets=[
    [['8', '8', '8'], ['12', '10', '10.'], ['12', '6+4.', '6.'], ['12', '12.', '9.'], ['9', '9.', '8.'], ['12.', '12', '10.']],
    [['8.', '8.', '8.'], ['12.', '12.', '12.'], ['12.', '11.', '8.'], ['12.', '10.', '16..'], ['12.', '9.', '13..'], ['12.', '12.', '12.']],
    [['8..', '8.', '8.'], ['12.', '12.', '12.'], ['12.', '12.', '10.'], ['12.', '15..', '12..'], ['12.', '10.', '8.'], ['12..', '12..', '12.']],
  ],
  fn={0: ['4 on ground, 4 on bench', '5 "", 3 ""'], 1: ['22kg'], 2: ['24+ 4x 22kg.'], 3: ['12kg', '10kg'],
      4: ['12kg', '10kg & 13 reps'], 5: ['18kg', '20kg']})

# ---------------------------------------------------------------- Week 23
W(23,
  ex=[('Pistol Squats', ''), ('Dumbbell Rows', '24kg'), ('Chest Press', '24kg'),
      ('Norm/Arnold S-Press', '14kg'), ('Bicep Curls', '14kg'), ('Triceps Ext.', '20kg')],
  days=[D('Mon', 97.3), D('Wed', 96.0), D('Fri', 96.7, 'LIGHT GREEN = GOOD!! Good day generally!')],
  sets=[
    [['9.', '9.', '8..'], ['12', '10', '9'], ['12!', '9', '8.'], ['!! 13.', '!! 16', '!! 16'], ['12.', '12.', '11.'], ['12', '11', '9']],
    [['8.', '9.', '9.'], ['12', '11', '10'], ['12', '10', '8!!'], ['!! 16.', '!! 13.', '!! 16'], ['12.', '8 .. + 4', '12..'], ['12', '12', '12']],
    [['9.', '9.', '8..'], ['12', '12', '10'], ['12', '11', '9.'], ['!! 16', '!! 16', '!! 16'], ['12.', '8. + 4..', '13..'], ['12', '12', '12']],
  ],
  c={(2, 3, 0): 'green', (2, 3, 1): 'green'},
  fn={0: ['5 on ground', '4 on ground'], 2: ['Good form, no pain'], 3: ['Already gentle pain'],
      4: ['12kg until no pain', '10kg cuz pain']},
  pn={3: ['!! 10kg until no longer pain']})

# ---------------------------------------------------------------- Week 24
# S-Press notes: ". THIINK PULLUP … – Didn't work, still pain…" is note 1 (with its sub-line), "… long break" is note 3.
W(24,
  ex=[('Pistol Squats', ''), ('Dumbbell Rows', '24kg'), ('Chest Press', '24kg'),
      ('Norm/Arnold S-Press', '10kg'), ('Bicep Curls', '10kg'), ('Triceps Ext.', '20kg')],
  days=[D('Mon'), D('Wed', None, 'Drank alcohol yesterday (slight hungover). BAD.', colour='brown'), D('Fri')],
  sets=[
    [['9.!', '8..', '8..'], ['12', '12', '12.'], ['12', '11', '10.'], ['!! 20', '!! 16', '!! 12'], ['12.', '11.', '10.'], ['12', '12', '13']],
    [['9.', '8..', '8..!'], ['12', '12', '12.'], ['12', '10', '8. ... !'], ['!! 17', '!! 13', '!! 12.'], ['12.', '9.', '12..'], ['12', '12', '10.']],
    [['10.', '9..', '9..'], ['12', '12', '12'], ['12', '10.', '12...'], ['!! 15.', '!! 12 !', '!! 20...'], ['12..', '10..', '14..'], ['13.', '12.', '12.']],
  ],
  c={(0, 3, 0): 'green'},
  fn={0: ['5 on ground', '4 on ground'], 1: ['Lower bench (3 free)'],
      2: ['No pain, but getting stiffer', 'Very hard - fatigue.', '20kg - TO FAILURE!'],
      3: ['THIINK PULLUP (less pain!) – Didn\'t work, still pain…', None, 'long break, shoulder good'],
      4: ['12kg until no pain', '10kg cuz pain'], 5: ['BEND ELBOW, FLEX TRICEP – Much harder. Good!']})

# ---------------------------------------------------------------- Week 25
W(25,
  ex=[('Pistol Squats', ''), ('Dumbbell Rows', '26kg'), ('Chest Press', '24kg'),
      ('Norm/Arnold S-Press', '10kg'), ('Bicep Curls', '12kg'), ('Triceps Ext.', '22kg')],
  exc={5: 'purple'},
  days=[D('Mon'), D('Wed'), D('Fri')],
  sets=[
    [['8.', '8.', '8.'], ['12', '10', '12'], ['12', '10', '12⭐'], ['!! 15', '!! 15', '!! 15 ++'], ['12.', '12.', '12.'], ['12', '12', '15']],
    [['10..', '10..', '9.'], ['12', '11', '12'], ['12', '11', '12.⭐'], ['12.', '12.', '12.'], ['12!..', '9...', '8...'], ['15⭐', '12', '11']],
    [['12...', '10..', '8.'], ['12', '12', '12'], ['12', '11', '10..'], ['12.', '12.', '12..'], ['12.', '12. ....', '11. .....'], ['12', '12', '12']],
  ],
  fn={0: ['4 on ground', '5 on ground', '6 on ground'], 2: ['Barely on last set. Very good shape & no pain', 'Being extra careful'],
      3: ['No pain. Good. 12kg', '12kg - micro pain :('],
      4: ['10kg to keep painfree', 'Hard, but no pain yet.', 'No pain, but keep form.', 'Maybe pain? Observing.', 'Pain. Not a lot, but pain.']},
  pn={3: ['++ = did another set of 15 after. Minimal pain.']})

# ---------------------------------------------------------------- Week 26
W(26,
  ex=[('Pistol Squats', ''), ('Dumbbell Rows', '26kg'), ('Chest Press', '24kg'),
      ('Norm/Arnold S-Press', '12kg'), ('Bicep Curls', '12kg'), ('Triceps Ext.', '22kg')],
  exc={1: 'purple', 3: 'purple', 4: 'purple'},
  days=[D('Mon'), D('Wed', None, 'Focus: No facial expressions'), D('Fri', 95.6)],
  sets=[
    [['10..', '10..', '10..'], ['12.', '11.', '11.'], ['12', '11', '11'], ['12.', '12', '12'], ['12.', '11', '12..'], ['12', '12', '15⭐']],
    [['10..', '10..!', '9.!'], ['12', '11', '11'], ['12', '12', '10'], ['12', '12..', '10'], ['12', '10...', '10...'], ['12', '12', '12']],
    [['10...', '10...', '10.'], ['12', '12', '12'], ['12', '12!.', '8..'], ['12.', '12', '12'], ['12', '10...', '10...'], ['12.', '12.', '10.']],
  ],
  c={(0, 3, 2): 'gold', (0, 4, 1): 'gold', (0, 4, 2): 'gold', (1, 2, 2): 'gold', (1, 3, 0): 'gold', (1, 4, 0): 'gold', (2, 2, 1): 'gold',
     (2, 3, 0): 'green', (2, 3, 1): 'green', (2, 3, 2): 'green', (2, 4, 2): 'green'},
  fn={0: ['4 on ground', '5 on ground', '6 on ground'], 1: ['Slow-ish. Good form!'],
      2: ['Last one was barely - pain came when trying to do it.', 'Extra careful'],
      3: ['No rest before switch exercise', 'Did 3-4 min break : Good - did it slow and steady.'],
      4: ['No rest before switch exercise', 'Long break (3-4 min)', 'Could do more, but was careful.'], 5: ['24kg']})

# ---------------------------------------------------------------- Week 27
W(27,
  ex=[('Pistol Squats', ''), ('Dumbbell Rows', '26kg'), ('Chest Press', '24kg'),
      ('Norm/Arnold S-Press', '12kg'), ('Bicep Curls', '12kg'), ('Triceps Ext.', '24kg')],
  exc={5: 'purple'},
  days=[D('Mon', None, 'Feeling strong today though!'), D('Wed', 95.9), D('Fri', 95.6)],
  sets=[
    [['12...⭐', '10.', '10..'], ['12', '12', '12!.'], ['12', '11', '10'], ['12', '12', '12.'], ['12', '10', '6.'], ['12', '10', '12']],
    [['12...', '11..', '10.'], ['12..', '12..', '12..'], ['12', '10..', '12'], ['12', '12..', '12'], ['12', '9', '10'], ['12', '11', '12!']],
    [['12...', '12..⭐', '10..⭐'], ['12', '12..', '12'], ['12', '11..', '11..'], ['12', '...10', '12'], ['12..', '8.', '8...'], ['12', '12', '12']],
  ],
  c={(0, 2, 1): 'gold', (0, 3, 0): 'gold', (0, 3, 1): 'gold', (0, 4, 1): 'gold', (2, 3, 1): 'gold',
     (1, 2, 1): 'green', (1, 2, 2): 'green', (1, 3, 0): 'green', (1, 3, 1): 'green', (2, 2, 1): 'green', (2, 2, 2): 'green', (2, 3, 0): 'green'},
  fn={0: ['4 on ground', '5 on ground', '6 on ground'], 1: ['Good form, not too fast', '^ + Breathing each rep in/out'],
      2: [None, 'Good form + Breathing each rep in/out'],
      3: ['Stopped. Did mobility exercises, did 12 more.', 'Feel it, but feels like strength, not pain',
          'During my break after BC I start feeling stiffening in shoulder. + Carefuullll'],
      4: ['Very careful. Did X good ones.', 'No break before this one', 'Seated, top slot, harder!']})

# ---------------------------------------------------------------- Week 28
# Mon** = sick; the "**" cells with red background = third set not done.
W(28,
  ex=[('Pistol Squats', ''), ('Dumbbell Rows', '26kg'), ('Chest Press', '24kg'),
      ('Norm/Arnold S-Press', '12kg'), ('Bicep Curls', '12kg'), ('Triceps Ext.', '24kg')],
  days=[D('Mon', 94.9, 'Did shoulder vid!!', marks='**'), D('Wed', None, 'Did shoulder vid!!'), D('Fri', 94.4, '!!! After pistol - YT shoulder vid.')],
  sets=[
    [['12.', '12.', '12.⭐'], ['12.', '12.', '**'], ['12', '12', '**'], ['12', '12', '**'], ['12', '12', '**'], ['12', '10', '**']],
    [['8⭐', '8', '12..'], ['12.', '12.', '12'], ['12', '12', '10'], ['***12', '12.', '12.'], ['12', '12.', '8.'], ['13', '8.!', '10(20)!']],
    [['8', '8', '8'], ['12', '12', '12'], ['12', '11', '12!'], ['12.', '10.', '10.'], ['12.', '10.', '11.'], ['12(20).', '12(20).', '12(20).']],
  ],
  c={(0, 1, 2): 'red', (0, 2, 2): 'red', (0, 3, 2): 'red', (0, 4, 2): 'red', (0, 5, 2): 'red',
     (0, 2, 0): 'gold', (1, 3, 0): 'gold', (2, 3, 1): 'gold', (2, 3, 2): 'gold',
     (0, 2, 1): 'green', (2, 1, 0): 'green', (2, 1, 1): 'green', (2, 1, 2): 'green', (2, 2, 0): 'green', (2, 2, 1): 'green',
     (1, 5, 1): 'purple', (1, 5, 2): 'purple'},
  fn={0: ['5 on ground', '6 on ground'], 1: ['3 Down from top!!'], 3: ['Did not alternate - first S-press then curls'],
      4: ['Did not alternate - first S-press then curls'], 5: ['Grip!! Check YT vid. Much harder.']})

# ---------------------------------------------------------------- Week 29
# Two screenshots of this week: Triceps Ext. header 24kg in one, 20kg in the other → 20kg, asked Ari.
W(29,
  ex=[('Pistol Squats', ''), ('Dumbbell Rows', '26kg'), ('Chest Press', '24kg'),
      ('Norm/Arnold S-Press', '12kg'), ('Bicep Curls', '12kg'), ('Triceps Ext.', '20kg')],
  days=[D('Mon', 96.5), D('Wed', 96.4), D('Fri', 95.4, 'Beginning of this day - crazy good. Good form, energy and all.')],
  sets=[
    [['12.!!', '12..!!', '12.!!'], ['12', '12', '12'], ['12', '12', '12'], ['12.', '10.', '8.!!'], ['12', '12', '8'], ['***12', '***10', '***10']],
    [['8', '12..', '12.'], ['12', '12', '12'], ['12', '12', '11'], ['12.', '12.', '10.'], ['12', '10', '6'], ['12(18).', '12(18)', '12(18)']],
    [['9', '8x', '8'], ['12', '12', '12.'], ['12', '12', '12.'], ['12. ..', '13. ..', '12. ..'], ['12', '11', '10'], ['12', '12', '12']],
  ],
  c={(0, 1, 0): 'green', (0, 1, 1): 'green', (0, 1, 2): 'green', (0, 2, 0): 'green', (0, 2, 1): 'green',
     (2, 3, 0): 'green', (2, 3, 1): 'green', (2, 3, 2): 'green',
     (0, 3, 1): 'gold', (0, 3, 2): 'gold', (1, 3, 2): 'gold'},
  fn={0: ['6 on ground', '7 on ground'], 2: ['Did 3 min break cuz start of pain'],
      3: ['Did not alternate - first S-press then curls', 'No pain. Relatively quick reps.'], 5: ['18kg due to wrist pain still.']},
  pn={0: ['x Left leg much harder.'], 5: ['*** Wrist pain. Did Hammer Curls instead, 10kg (8-12)']})

# ---------------------------------------------------------------- Week 30
# The "Wed" session was done on Thursday (sheet: Notes "Thursday." + Fri "Skipped Wednesday, did Thursday instead.") → Thu.
W(30,
  ex=[('Pistol Squats', ''), ('Dumbbell Rows', '26kg'), ('Chest Press', '26kg'),
      ('Norm/Arnold S-Press', '12kg'), ('Bicep Curls', '12kg'), ('Triceps Ext.', '20kg')],
  exc={2: 'purple'},
  days=[D('Mon', 96.0), D('Thu', 95.2, 'Thursday.'), D('Fri', None, 'Skipped Wednesday, did Thursday instead. Exhausted.', colour='red')],
  sets=[
    [['8', '8', '8!'], ['12', '12', '12'], ['12.', '8..', '8..'], ['12', '12', '8.'], ['8.', '8', '8'], ['12', '12', '12']],
    [['8', '8', '8'], ['12', '12', '12.'], ['12(24)', '12(24)', '12(24)'], ['12..', '12', '10'], ['12', '12', '10'], ['12', '12', '14⭐']],
    E,
  ],
  c={(0, 3, 1): 'gold', (1, 1, 2): 'gold', (0, 3, 2): 'red', (0, 4, 0): 'red', (0, 4, 1): 'red', (0, 4, 2): 'red'},
  fn={1: ['Started feeling the pain around here. Went lower on chest press, and taking it easy.'],
      2: ['BE careful! 11reps next?', 'Being CAREFUL.'], 3: ['Stopped cause of pain :(', 'Full body pain, sore from calisthenics.'],
      4: ['Much more strength, but pain. Switching to mobility - did on bench to release shoulder']})

# ---------------------------------------------------------------- Week 31
W(31,
  ex=[('Pistol Squats', ''), ('Dumbbell Rows', '26kg'), ('Chest Press', '26kg'),
      ('Norm/Arnold S-Press', '12kg'), ('Bicep Curls', '12kg'), ('Triceps Ext.', '22kg')],
  exc={5: 'purple'},
  days=[D('Mon', 95.5, 'No pain today, but I certainly felt it.', nc='gold'), D('Wed', 95.0), D('Fri', 95.1, 'Pistols very hard today')],
  sets=[
    [['8', '8', '8!'], ['12', '12', '12'], ['12', '8', '8(24)'], ['12', '10.', '10.'], ['12', '8.', '8.'], ['12(20)', '12(20)', '14⭐']],
    [['9', '8', '8!'], ['12', '12', '12'], ['10', '8', '8'], ['12', '12', '8.'], ['12', '10', '10'], ['12', '12', '12']],
    [['8!', '8!', '8!'], ['12', '12..', '12..'], ['11.', '10..', '10..'], ['12⭐', '12⭐', '12⭐'], ['12', '12', '9'], ['12', '12', '12']],
  ],
  fn={1: [None, '2 min break'], 2: ['Pushed for 12, but failed.', '2 min break'], 3: ['Careful.'], 4: ['Careful.']},
  pn={3: ['⭐ Felt very strong!']})

# ---------------------------------------------------------------- Week 32
W(32,
  ex=[('Pistol Squats', ''), ('Dumbbell Rows', '26kg'), ('Chest Press', '26kg'),
      ('Norm/Arnold S-Press', '12kg'), ('Bicep Curls', '12kg'), ('Triceps Ext.', '24kg')],
  exc={5: 'purple'},
  days=[D('Mon', 95.3, 'Very exhausted in body today, but still good performance!'),
        D('Wed', 93.7, 'Pistol squats veeery hard today !! FORGOT calisthenics stretch'),
        D('Fri', 92.9, 'Body feels very drained today OK day pain wise - stretched!')],
  sets=[
    [['8', '8', '8!'], ['12', '12!', '12'], ['12⭐', '9', '8.'], ['12⭐', '12', '12'], ['12⭐', '11', '10'], ['12', '10', '10']],
    [['9!', '8!', '8!'], ['12', '12!', '12!'], ['12', '9', '9..'], ['12.', '12.', '12..'], ['12', '12', '12'], ['12', '11', '10.']],
    [['8!', '8', '8!'], ['12', '12', '12'], ['11', '9', '9'], ['12⭐', '12⭐', '12.'], ['12.', '10⭐', '8⭐..'], ['12', '11', '12']],
  ],
  c={(1, 5, 1): 'gold', (1, 5, 2): 'gold', (2, 4, 0): 'gold'},
  fn={2: ['Extra careful to monitor.', 'Accidentally long break'], 3: ['No star. No pain, but the symptoms before pain.', 'No pain, but not good.'],
      4: ['Symptoms, almost pain.', 'Little strength, but form is very good!'], 5: ['Had more strength, but stopped because of pain']})

# ---------------------------------------------------------------- Week 33
# ❌ cells (third set skipped: "Slept terribly. Doing 2 sets.") → "✗".
W(33,
  ex=[('Pistol Squats', ''), ('Dumbbell Rows', '26kg'), ('Chest Press', '26kg'),
      ('Norm/Arnold S-Press', '12kg'), ('Bicep Curls', '12kg'), ('Triceps Ext.', '24kg')],
  days=[D('Mon', 94.4, 'Feeling my strength getting worse. Next week = Deload!'), D('Wed', 93.5, '✗ Slept terribly. Doing 2 sets.'), D('Fri')],
  sets=[
    [['8', '8', '8'], ['12', '12', '12'], ['10', '10', '9'], ['12', '12', '10.'], ['12', '12', '12'], ['12!.', '12!.', '12!.']],
    [['8', '8', '✗'], ['10', '12', '✗'], ['10', '8', '✗'], ['12', '12', '✗'], ['12', '12', '✗'], ['12⭐', '12', '✗']],
    E,
  ],
  fn={3: ['Maybe slight pain, but did very slow and controlled. No stress in head.'], 5: ['Very hard, but felt it very well in the triceps!']})

# ---------------------------------------------------------------- Week 34 (deload: YouTube session instead of the exercises)
YT = '40 Min COMPLETE Full Body Dumbbell Workout (YouTube)'
W(34,
  ex=[('Pistol Squats', ''), ('Dumbbell Rows', '26kg'), ('Chest Press', '26kg'),
      ('Norm/Arnold S-Press', '12kg'), ('Bicep Curls', '12kg'), ('Triceps Ext.', '24kg')],
  exc={1: 'purple', 2: 'purple', 3: 'purple', 4: 'purple', 5: 'purple'},
  days=[('Mon', 94.6, '', '', 'purple', None, YT), ('Wed', None, '', '', 'purple', None, YT), ('Fri', None, '', '', 'purple', None, YT)],
  sets=[E, E, E],
  x='50 lbs = 12kg, 40 lbs = 10 kg, 30 lbs = 8kg, 15 lbs = 6 / 4 kg.')

# ---------------------------------------------------------------- Week 35
W(35,
  ex=[('Pistol Squats', ''), ('Dumbbell Rows', '26kg'), ('Chest Press', '26kg'),
      ('Norm/Arnold S-Press', '12kg'), ('Bicep Curls', '12kg'), ('Triceps Ext.', '24kg')],
  days=[D('Mon', 94.7, 'Back after de-load week. From here: 6-8 pist. Squats'), D('Wed', 94.0), D('Fri', 94.5, 'Bad sleep, exhausted. Doing low intensity.')],
  sets=[
    [['4/4', '5/3', '5/3'], ['12', '12', '10'], ['12', '9', '8'], ['12⭐', '10⭐', '8'], ['12', '8', '8'], ['12', '12', '12']],
    [['6', '6', '6'], ['12', '12', '12'], ['10', '10', '9'], ['12', '10.', '8.'], ['12', '11.', '12..'], ['12', '12', '10.⭐']],
    [['6!!.', '6!!..', 'X'], ['10', '12', '12'], ['11', '10', '10'], ['12', '10.', '12⭐'], ['12', '12', '10'], ['12', '12', '12']],
  ],
  c={(0, 3, 2): 'gold', (1, 3, 1): 'gold', (1, 3, 2): 'gold'},
  fn={0: ['Really bad form. No str. Hard.', 'On the bench....'], 3: ['Had str. Careful bc pain.'],
      4: ['Slow. Like "posing" motion', 'Dad called, long break'], 5: ['Slow. Like "posing" motion']},
  pn={3: ['!!! Wave arms circles!']})

# ---------------------------------------------------------------- Week 36
W(36,
  ex=[('Pistol Squats', '4-6!!'), ('Dumbbell Rows', '26kg'), ('Chest Press', '26kg'),
      ('Norm/Arnold S-Press', '12kg'), ('Bicep Curls', '12kg'), ('Triceps Ext.', '24kg')],
  days=[D('Mon', 96.0), D('Wed', 94.4, 'GREAT Day! Did full stretch. See top for stretch routine.'), D('Fri', 94.4)],
  sets=[
    [['6', '6', '6'], ['12', '12', '10'], ['12', '8.', '12(24).'], ['12⭐', '12', '12'], ['12', '10', '8'], ['12', '12', '11⭐']],
    [['6', '6', '6.'], ['12', '12', '12'], ['10', '10', '10'], ['12', '12⭐', '12⭐'], ['12', '11', '9'], ['12', '12', '12']],
    [['6', '6', '6.'], ['12', '12', '12'], ['12⭐..', '9', '10'], ['12⭐', '10.', '11.'], ['12', '12⭐', '12⭐'], ['12!..', '12⭐', '11']],
  ],
  fn={0: ['Very good set!'], 2: ['1 step incline to test!', 'No. 12 very hard!'], 3: ['Careful'], 5: ['Slow. Like "posing" motion', 'Barely']})

# ---------------------------------------------------------------- Week 37
# Header note → week note; "Fri 94.2kg ." + Remark ". Ate a lot!" → Friday notes; Wed Notes "^" kept.
W(37,
  ex=[('Pistol Squats', ''), ('NO BENCH: Dumbbell Rows', '18kg!'), ('+1 step Chest Press', '26kg'),
      ('Norm/Arnold S-Press', '12kg'), ('Bicep Curls', '12kg'), ('Triceps Ext.', '26kg')],
  exc={5: 'purple'},
  days=[D('Mon', 94.5, 'Shit day.. Pain and weak.. In bed all yesterday, ate shit.'),
        D('Wed', 94.7, '^'),
        D('Fri', 94.2, 'Better sleep, sauna yesterday. Mental state better. Slightly better perfomance. — Ate a lot!')],
  sets=[
    [['6', '6', '6'], ['12', '12.', '12.'], ['11.', '8.', '8.'], ['12', '8.', ''], ['12', '12', '12'], ['11', '12', '9']],
    [['6', '6', '6'], ['12(16)', '12(16)', '12(16)'], ['11.', '8.', '11(24)'], ['12', '12', '12⭐'], ['12', '12', '12'], ['10', '12', '12']],
    [['6', '6', '6'], ['12', '12', '12'], ['12', '8', '9..'], ['12..', '12⭐', '12'], ['10(14)', '12(14).', '8(14)'], ['11', '12', '12']],
  ],
  c={(0, 1, 1): 'gold', (0, 1, 2): 'gold', (0, 2, 2): 'gold', (2, 3, 0): 'gold', (0, 3, 2): 'red'},
  fn={1: ['Slight pain right shoulder'], 2: ['Failure already', 'Stopped to prevent injury'],
      3: ['Stopped cuz click in ribs - no pain, but preventative.', 'Pain AFTER. Was greedy.'], 4: ['Adrenaline rush!']},
  x='** Bad stomach this week. - Really affecting performance')
