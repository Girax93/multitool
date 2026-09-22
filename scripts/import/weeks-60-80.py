"""Transcription of Ari's OneNote workout log, weeks 60-80 (screenshots, 2026-09-22).

Same notation as weeks-38-59.py (decoded by scripts/import/build.py).
Dates (Ari, 2026-09-22): Portugal 13-27 Apr = weeks 63, 64 + Mon of 65; Austria/Kassel 9-11 Jun =
week 70; Fusion 24-28 Jun = week 72; Week 80 = this week (21 Sep). So weeks 60-69 follow on from
week 59 without a gap, from week 70 the calendar is one week later than the numbering, the
unnumbered "11 WK AFTER FUSION!!" block is 7 Sep and Week 80 is 21 Sep. The calendar weeks with
no entry at all (1 Jun, 17/24/31 Aug, 14 Sep) are added as "No workout" weeks with red days
(Ari: "keep them in there but mark them with a no workout tag … same as marking those days in red").
Decisions for this batch (see the project doc):
  - every empty past day is red (did not work out), also where the sheet left the label white
    (76 Fri, 77-79, the Wed/Fri of the "11 WK" block); week 80's Wed/Fri lie ahead and stay plain;
  - a day whose only entry is another workout (67 Mon "GYM", 68 Mon/Wed "Gym / USC", 71 Mon
    "Calisthenics class") → other-workout day; the sheet's red / gold day colour is kept;
  - "Read the notes!" written across the chest cells (65 Mon, 67 Mon) is kept in those cells;
  - "1.5 min Handstand practice!" is spelled "1.5min" as in weeks 52-59 (same exercise id);
  - notes with no leading dot that a set refers to (66 rows, 66 curls, 69 handstand) → note 1;
    week 67 handstand's second ". To the wall" note → note 3 (the cells refer to 1, 2 and 4);
  - orange / yellow text (61 triceps note 3, 66 Mon "Maaad tired", "NO WATER") is kept as plain text;
  - the "11 WK AFTER FUSION!!" block appears in two screenshots; the newer one (Wed/Fri "Moving + Lazy")
    is used; its curls cell "4,2(12" is "4,2(12)" there.
"""

WEEKS = []

def W(n, ex, days, sets, fn=None, pn=None, c=None, exc=None, x=None, start=None, label=None, wid=None):
    WEEKS.append(dict(n=n, ex=ex, days=days, sets=sets, fn=fn or {}, pn=pn or {}, c=c or {}, exc=exc or {}, x=x,
                      start=start, label=label, wid=wid))

E = [['', '', '']] * 6
D = lambda wd, bw=None, notes='', marks='', colour=None, nc=None: (wd, bw, notes, marks, colour, nc)
RED = lambda wd, notes='': (wd, None, notes, '', 'red', None)
ALT = lambda wd, what, bw=None, notes='', marks='', colour=None: (wd, bw, notes, marks, colour, None, what)

PS = ('Pistol Squats', 'MOVE TOWARDS PRISONER PS.')
ROWS = ('BENCH: (1st set without) Dumbbell Rows', '28kg')
CHEST26, CHEST24 = ('+1 step Chest Press', '26kg'), ('+1 step Chest Press', '24kg')
HS = ('1.5min Handstand practice!', '')
TRI = ('Bent-over triceps push-ups', 'x = wall, y = bench, z = floor')
CURLS16 = ('Bicep Curls', '16kg')
CURLS14 = ('Bicep Curls', '14kg')
CURLS_PA = ('Bicep Curls', '14kg pure,assisted')
CURLS_AIM = ('Bicep Curls', '14kg pure,assisted (8-10 aim)')

# From week 70 the calendar is one week behind the numbering (see the docstring).
def shifted(n):
    import datetime as dt
    return (dt.date(2025, 2, 3) + dt.timedelta(days=7 * (n - 1) + 7)).isoformat()

# ---------------------------------------------------------------- Week 60
W(60,
  ex=[PS, ROWS, CHEST26, HS, CURLS16, TRI],
  days=[D('Mon', 89.15, 'Stomach issues since Wednesday last week. Still feeling it a bit.'), D('Wed', 90.10), D('Fri', 89.30)],
  sets=[
    [['6', '6', '6'], ['12', '12', '12'], ['10.', '8.', '10..'], ['Ok+', 'Ok+.', 'Bad-..'], ['12!', '9!', '8!'], ['2,8.', '1,5,2..', '2, 7']],
    [['6', '6', '6.'], ['12', '12', '12'], ['11', '9', '8'], ['Ok+', 'Ok', 'Ok'], ['11', '9', '8'], ['3.5,4.', '4,4.', '3,5.']],
    [['6', '6', '6..'], ['12', '12', '12!.'], ['11...', '9!', '8'], ['Good.', 'Good.', 'Good.'], ['12', '8', '7!.'], ['3,4.', '1,7.', '2,3.*']],
  ],
  fn={0: ['Normal, without heel support.', 'Really out of balance!'],
      2: ['Tried a 45 degree angle. Felt it more in triceps, so adjusted. Did only 10 to prevent injury. Also my stomach started complaining before this set.',
          'Same as . But had long break due to belly. Felt good in chest though!',
          "Didn't eat yet. Really feeling it. Snacked a bit of musli after this set"],
      3: ['Did it far away (At the stable part of the wood). Good spot - the feet will reach the wall.',
          'Kept falling. Went close to wall again, focused on wrists and keeping the arms straight. It helped.'],
      4: ['Focus on the upper back - straight back, no over-extending, but focus on using that muscle to keep the body form.'],
      5: ['x(y)', 'x,y,z']})

# ---------------------------------------------------------------- Week 61
W(61,
  ex=[PS, ROWS, CHEST26, HS, CURLS16, TRI],
  days=[D('Mon', 91.80), D('Wed', 89.50, '!!! Update Johnny abt 30 April'), D('Fri', 89.35, '', '*')],
  sets=[
    [['6!', '6', '6.'], ['12', '12!.', '7!..'], ['12!', '9', '8'], ['Good', 'Good..', 'Gr8⭐.'], ['10.', '10.', '9.'], ['1.5, 4!.', '2,3,3..', '2,6']],
    [['6', '6', '6..'], ['12', '12!..', '11..'], ['10!!', '10.⭐', '10!⭐'], ['Good+.', 'Gr8.', 'Gr8.'], ['10.', '9.', '7..'], ['3,6.', '3,6. *', '2**']],
    [['6', '6', '6'], ['12', '12!..', '12..'], ['12', '11⭐', '7..'], ['Gr8', 'Gr8⭐.', 'Good+'], ['8...', '6...', '7..'], ['6.', '7. ...', '6...']],
  ],
  fn={0: ['3 heel on support, 3 normal on floor. Mix heel and normal.', 'Big focus on keeping leg as straight as possible.'],
      1: ['Slowww', 'Explosively up, 2 sec down'],
      2: ['Drank salt! Helped?', 'Brain/energy said stop. (sleep)'],
      3: ['⭐ AMZING! Complete balance for a good moment! Body felt activated in all muscles, even toes (they were "flexing back"). I was breathing and relaxed too. Focused on this:',
          'Don\'t spread legs too much - I got used to the feeling and then keeping them straight felt "wrong"'],
      4: ['Focus on the upper back - straight back, no over-extending, but focus on using that muscle to keep the body form.',
          'Stopped because pain in right shoulder.',
          'Tried different versions DO THE FIRST ONE HERE: Note: [The Best Science-Based DUMBBELL Biceps Exercises For Size And Shape](https://www.youtube.com/watch?v=20ibpB635Rw)'],
      5: ['x, y', 'x, y, z', 'The mark on the floor is in-between the middle finger and the pointing finger (the lowest of the 3 vertical ones)']},
  pn={5: ['* Right shoulder snaps', '** 2 on wall, but to avoid shoulder pain I stopped entirely. The snapping is too uncomfortable.']})

# ---------------------------------------------------------------- Week 62
# Wed notes ". No pre-workout, also start at 14:50." → the leading dot is dropped.
W(62,
  ex=[PS, ROWS, CHEST26, HS, ('Bench Bicep Curls', '14kg <norm>,<assisted>'), ('Handstand/pike push-up.', 'x = wall, y = bench, z = floor')],
  exc={4: 'purple'},
  days=[D('Mon', 89.90), D('Wed', None, 'No pre-workout, also start at 14:50.'), D('Fri', 89.95)],
  sets=[
    [['6', '6', '6.'], ['12!.', '12', '12'], ['10.', '10', '5+5..'], ['Gr8⭐.', 'Gr8', 'Good+..'], ['8(16)!!.', '9!!', '8'], ['4,4.', '5. ..', '-..']],
    [['6.', '6⭐.', '6'], ['12⭐..', '11 ...', '12'], ['12⭐...', '11⭐..', '8'], ['Good', 'Good-', 'Ok+'], ['9', '9..', '8..'], ['1,4...', '1,5...', '0,5!...']],
    [['6.', '6.', '6.'], ['12', '12', '12⭐'], ['12', '12', '12'], ['Good', 'Good...', 'Good-'], ['7,3', '5,3', '5,5'], ['1,6', '0,6', '0,6']],
  ],
  fn={0: ['Focus on restabilizing at the bottom.'],
      1: ['Careful because lower back did not feel comfy!', 'Lower back felt great - found a perfect form.', 'Reeally good pace - really fast up and slow down.'],
      2: ['Kept pushing up the bathrobe on the door…', 'Crashed into the desk. Stopped, moved the bench, then did 5 more.',
          'Till failure, good form - felt it in my chest for once. 3 IN break'],
      3: ['If this keeps going through the week, upgrade rating difficulty, and start counting breaths.',
          'Wide hand grip to gain more strength in hands/wrists', 'Closer to wall, focus on the hip contraction.'],
      4: ['On bench. Had to help out on the last 2. Reduce to 14kg after.', 'Go as far as I can, and when range feels more limited, assist and slow down'],
      5: ['x,y', 'Shoulder pain, taking it easy. Skipped last set, but did one handstand pushup in reverse direction.',
          'Belly facing the wall. Much harder. Do at least one of those to feel the push, then transfer feeling to bench.']})

# ---------------------------------------------------------------- Weeks 63-64 (Portugal)
W(63,
  ex=[PS, ROWS, CHEST26, HS, ('Bench Bicep Curls', '14kg'), TRI],
  days=[RED('Mon', 'Portugal'), RED('Wed', 'Portugal'), RED('Fri', 'Portugal')],
  sets=[E, E, E])

W(64,
  ex=[PS, ROWS, CHEST26, HS, CURLS14, TRI],
  days=[RED('Mon', 'Portugal'), RED('Wed', 'Portugal'), RED('Fri', 'Portugal')],
  sets=[E, E, E])

# ---------------------------------------------------------------- Week 65
W(65,
  ex=[PS, ROWS, CHEST26, HS, CURLS_PA, TRI],
  days=[RED('Mon', 'Came home from Portugal'), D('Wed', 88.10, '1st WO day. Going Easier. Also harder!'), D('Fri', 88.05)],
  sets=[
    [['', '', ''], ['', '', ''], ['Read', 'the', 'notes!'], ['', '', ''], ['', '', ''], ['', '', '']],
    [['6', '6', '6'], ['12(26)', '12(26)', '12(26)'], ['10(24).', '8(24).', '6(22).'], ['Good', 'Good+', 'Good-'], ['7,3', '6,3', '3,3'], ['0,9', '0,5', '1,5']],
    [['6', '6', '6'], ['12(26)', '12(26)', '12(26)'], ['12(24)', '8(24)', '8(24)'], ['Ok+.', 'Ok+..', 'Good...'], ['8,2', '5,3', '5,3'], ['1,4', '1,2,5', '6,1.']],
  ],
  fn={2: ['Super hard. Followed the notes though!! (chest-strech part is effective)'],
      3: ['Not so good, because I tried a different techinque - focusing on the "yoga block touching" trick.', 'Tried with dumbbells',
          'Started with control, not even going all the way up, then moved to the yoga block trick with control. Found a good balance point there.'],
      5: ['Done. Dead.']})

# ---------------------------------------------------------------- Week 66
W(66,
  ex=[PS, ROWS, CHEST24, HS, CURLS_PA, TRI],
  days=[D('Mon', 87.35, 'Maaad tired, even with pre-workout. Slept a decent 8-9 hours too. NO WATER'),
        RED('Wed', 'Far too exhausted, plus home late from Lena in the morning.'), D('Fri', 87.80)],
  sets=[
    [['6', '6', '6'], ['12!', '12', '12!'], ['12..', '9..!!', '6..!!'], ['Ok.', 'Ok.', 'Ok+..'], ['7,3', '8', '7,2'], ['0,5.', '0,3. ..!!', '0,3,3!']],
    E,
    [['6', '6', '6'], ['12', '12', '12!.'], ['12', '10', '8'], ['Ok', 'Good+..', 'Good-..'], ['7,3.', '7,1..', '8,1..'], ['0,5,4', '0,3,1..', '0,3,2..']],
  ],
  fn={1: ['Keep shoulders horizonal. Prevents abs from supporting as much.'],
      2: [None, "Crazy hard. 3 min breaks, I feel like a zombie that hasn't eaten in 4 months. (not hungry, but we also have no water)"],
      3: ['Tired', 'Focused on controlled jumps onto the YOGA BLOCKS, then UP. ⭐'],
      4: ['Right arm MUCH stronger, did 10. On-toe though, trying on toe for both.', 'Both arms were almost even now.'],
      5: ['Bench only - used blocks.', 'Full hand on the block']})

# ---------------------------------------------------------------- Week 67
# Mon "GYM" → other workout (the chest cells' "Read the notes!" is kept underneath); trained Thu and Sat.
W(67,
  ex=[PS, ROWS, CHEST24, HS, CURLS_AIM, TRI],
  days=[ALT('Mon', 'GYM'), D('Thu', 88.10),
        D('Sat', 87.65, 'Not tired, but quickly exhausted today. ADHD symptoms are very strong. No pre-workout today bc sleep.')],
  sets=[
    [['', '', ''], ['', '', ''], ['Read', 'the', 'notes!'], ['', '', ''], ['', '', ''], ['', '', '']],
    [['3,3.', '3,3.', '3,3'], ['12', '12', '12'], ['12', '10', '9'], ['Ok+', 'Bad-.', 'Good+..'], ['9,2', '6,4', '4,4!.'], ['0,0,4.', '0,0,3.', '2(1)..']],
    [['3,3', '3,3??', '3,3'], ['12', '12', '12'], ['12', '11', '8'], ['Ok-.', 'Baad....', "Good.'"], ['8,3', '6,3', '5,3'], ['0,0,3', '0,0,3', '0,0,3']],
  ],
  fn={0: ['3 prisoner w/elevation. Only prisoner down (all the way) then up normal'],
      3: ['Tried the above.',
          'Instead, focused on noticing how the core helps in bringing the body up and then instead, finding out how to not fall down again and also not over-extend. KEEP BREATHING.',
          'To the wall - aligning with it very closely, and realizing "I\'m straight here. Move foot 1cm from the wall and hold."',
          '1 minute, body exhausted.'],
      4: ['NO toe-up! No help - only hand assist.'],
      5: ['QUALITY > QUANITY. Feet raising-feeling.', 'Tried pike-to-headstand with assisted block on ground']},
  pn={0: ['?? Think I did them without a break bc adhd. Idk.'],
      3: ['https://www.instagram.com/reel/DSCuT8djtx3/?igsh=NTVzcmxzaTh3NGQ4',
          "-' Found 2 balance points: 1. Walking my feet all the way up to feel it in my lower core. 2. Thinking of my arms gently bending towards window/belly"]})

# ---------------------------------------------------------------- Week 68
# Mon/Wed "Gym / USC" (red in the sheet) → other workout, red kept; Mon pistol cells "APPLY FOR REHAB" kept underneath.
W(68,
  ex=[PS, ROWS, CHEST26, HS, CURLS_AIM, TRI],
  days=[ALT('Mon', 'Gym / USC', colour='red'), ALT('Wed', 'Gym / USC', colour='red'), RED('Fri', 'Lazy :o')],
  sets=[
    [['APPLY', 'FOR', 'REHAB'], ['', '', ''], ['', '', ''], ['', '', ''], ['', '', ''], ['', '', '']],
    E,
    E,
  ])

# ---------------------------------------------------------------- Week 69
W(69,
  ex=[PS, ROWS, CHEST24, HS, CURLS_AIM, TRI],
  days=[D('Mon', 85.80, 'First time on ADHD meds! No pre workout.'), D('Wed', 86.70), RED('Fri')],
  sets=[
    [['6', '6', '6'], ['12(20).', '12', '12'], ['12(24)', '12(24).', '9(24)'], ['Ok', 'Ok', 'Ok'], ['9(3)', '7(3)', '4(4)'], ['7', '5', '5']],
    [['6', '6', '6'], ['12(20)', '12', '12'], ['12', '6..', 'Skip..'], ['Ok', 'Good.', 'Ok'], ['8(4)', '6(4)', '4(4)'], ['5', '4', '4']],
    E,
  ],
  fn={1: ['Back hurting from stretching, so did first set with 20kg to prevent injury'],
      2: ["MAD LONG break. 12 almost doesn't count.", 'Slight pain in left shoulder. Much weaker - probably because not eating enough!'],
      3: ['Focused on staying "in the palm"']},
  pn={5: ['All on the floor. New technique - much harder.']})

# ---------------------------------------------------------------- (no entry: week of 1 Jun 2026)
GAP_EX = [PS, ROWS, CHEST24, HS, CURLS_AIM, TRI]

def gap(start, n):
    W(n, ex=GAP_EX, days=[RED('Mon'), RED('Wed'), RED('Fri')], sets=[E, E, E],
      start=start, label='No workout', wid=f'import-gap-{start}')

gap('2026-06-01', 69.5)

# ---------------------------------------------------------------- Week 70 (9-11 Jun)
W(70, start=shifted(70),
  ex=[PS, ROWS, CHEST24, HS, CURLS_AIM, TRI],
  days=[D('Mon', 87.0, 'Lower back pain since a week.'), RED('Wed', 'Austria'), RED('Fri', 'Kassel, summer party')],
  sets=[
    [['6', '6', '6'], ['12(20)', '12', '12'], ['12', '10', '9⭐.'], ['Ok', 'Gr8!!.', 'Gr8!.'], ['9,3', '7,2', '6,3'], ['5', '4', '4']],
    E,
    E,
  ],
  fn={2: ['Until complete failure!-'], 3: ["Focus on the inside of the palm. That's where the weight should be. Fingers for press-back."]},
  pn={5: ['All on the floor. New technique - much harder.']})

# ---------------------------------------------------------------- Week 71
# Mon "Calisthenics class" (gold in the sheet) → other workout, gold kept.
W(71, start=shifted(71),
  ex=[PS, ROWS, CHEST24, HS, CURLS_AIM, TRI],
  days=[ALT('Mon', 'Calisthenics class', colour='gold'), RED('Wed', 'Fixed desk instead'), D('Fri', 86.65)],
  sets=[
    E,
    E,
    [['6', '6', '6'], ['12(20)', '12', '12'], ['7 (26)', '10', '8'], ['Bad.', 'Ok..', 'Ok...'], ['8,4', '6,2', '4,3'], ['4', '3', '5.']],
  ],
  fn={3: ['No wall. Bigger room, less mental safety of crashing into things.', '"Jumped" up.', 'Practiced tucking'],
      5: ['Legs a biiit further away = easier.']},
  pn={5: ['All on the floor. New technique - much harder.']})

# ---------------------------------------------------------------- Week 72 (Fusion 24-28 Jun)
W(72, start=shifted(72),
  ex=[PS, ROWS, CHEST24, HS, CURLS_AIM, TRI],
  days=[D('Mon', 85.35), RED('Wed', 'FUSION'), RED('Fri', 'FUSION')],
  sets=[
    [['6', '6', '6'], ['12(22)', '12', '12'], ['8(26)', '10!!', '7.'], ['Ok+.', 'Ok+.', 'Ok -..'], ['10,2', '6,4', '5,3'], ['4', '4', '4']],
    E,
    E,
  ],
  fn={2: ['Failure!'],
      3: ['Both not bad! Focus on inside-palm, and kicking up a bit. Try to lean forward and use fingers to ensure no falling', 'Exhausted (-20 sec)']},
  pn={5: ['All on the floor. New technique - much harder.']})

# ---------------------------------------------------------------- Weeks 73-79
W(73, start=shifted(73), ex=GAP_EX,
  days=[RED('Mon', 'FUSION Recovery'), RED('Wed', 'FUSION Recovery'), RED('Fri', 'FUSION Recovery')], sets=[E, E, E],
  pn={5: ['All on the floor. New technique - much harder.']})

SICK = 'Energy completely drained from sick. Recovery'
W(74, start=shifted(74), ex=GAP_EX, days=[RED('Mon', 'Super sick in the weekend'), RED('Wed', SICK), RED('Fri', SICK)], sets=[E, E, E])
W(75, start=shifted(75), ex=GAP_EX, days=[RED('Mon', SICK), RED('Wed', SICK), RED('Fri', SICK)], sets=[E, E, E])
W(76, start=shifted(76), ex=GAP_EX,
  days=[RED('Mon', SICK), D('Wed', None, 'STRECH ONLY - Still recovering', colour='gold'), RED('Fri')], sets=[E, E, E])
W(77, start=shifted(77), ex=GAP_EX, days=[RED('Mon'), RED('Wed'), RED('Fri')], sets=[E, E, E])
W(78, start=shifted(78), ex=GAP_EX, days=[RED('Mon'), RED('Wed'), RED('Fri')], sets=[E, E, E])
W(79, start=shifted(79), ex=GAP_EX, days=[RED('Mon'), RED('Wed'), RED('Fri')], sets=[E, E, E])

# ---------------------------------------------------------------- (no entry: 17, 24, 31 Aug 2026)
gap('2026-08-17', 79.2)
gap('2026-08-24', 79.4)
gap('2026-08-31', 79.6)

# ---------------------------------------------------------------- "11 WK AFTER FUSION!!" (7 Sep)
W(79.8, start='2026-09-07', label='11 WK AFTER FUSION!!', wid='import-week-11-wk-after-fusion',
  ex=GAP_EX,
  days=[D('Mon', None, 'Lost a lot of strength! Keep pushing :)'), RED('Wed', 'Moving + Lazy'), RED('Fri', 'Moving + Lazy')],
  sets=[
    [['6', '6', '6'], ['10(24)!', '12(24)!', '12(24)!'], ['12(20)!', '12(20)!', '6(20)*!'], ['Ok+', 'Ok+', 'Ok+'], ['6,2', '5,3', '4,2(12)'], ['5', '3*', '2,2*']],
    E,
    E,
  ],
  pn={2: ['* Absolute zero strength. Do 3 min breaks for this one'],
      5: ['* ZERO strength, so my knees/legs just gave up to save my muscles haha.. Good form though!']})

# ---------------------------------------------------------------- (no entry: 14 Sep 2026)
gap('2026-09-14', 79.9)

# ---------------------------------------------------------------- Week 80 (this week, 21 Sep)
W(80, start='2026-09-21',
  ex=GAP_EX,
  days=[D('Mon', 84.0), D('Wed'), D('Fri')],
  sets=[
    [['6', '6', '6'], ['12(22)', '12(22)', '12(22)!'], ['12(20)', '12(20)!', '10(20)!.'], ['Good.', 'Ok', 'Ok-..'], ['8,2(12)', '7,3(12)', '5,4(12)'], ['4.', '5.', '4.']],
    E,
    E,
  ],
  fn={2: ['3min breaks'], 3: ['Only falling back', 'Practice underbalance, very exhausting.'], 5: ['Max "weight" (on toes). 2,5min break to focus on strength.']})
