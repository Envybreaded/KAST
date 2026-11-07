/* Flight plan: Horizon Junction on LV-5 Kestrel. */
KAST.registerDoc({
  id: 'horizon-junction-kestrel',
  order: 1,
  kind: 'Flight plan',
  status: 'Ready to fly',
  navTitle: 'Junction flight plan',
  title: 'Horizon Junction',
  vehicle: 'LV-5 Kestrel',
  cta: 'View flight plan',
  hero: 'assets/photo-f9rcs-descent.jpg',
  subtitle: 'Kestrel delivers Horizon Junction to KASP Station Node 1 and docks it to the bottom port. The first stage then flies itself home to the pad for reflight.',
  checklist: true,
  facts: [
    ['Vehicle', 'LV-5 Kestrel, 118 t, 63 parts'],
    ['Payload', 'Horizon Junction, launch 1 of 10'],
    ['Target', 'Node 1, about 150 x 178 km, 0.19°'],
    ['Launch window', 'Phase-timed, about every 41 min'],
    ['Arrival', 'About T+8:30'],
    ['Cost', '74,700 new; about 33,000 with booster recovery']
  ],
  overview: 'Flight 1 reached orbit and stopped 300 m from Node 1, but the first stage was lost: its computer asked Trajectories for a landing prediction while it was not the active vessel, the script crashed and nothing flew the stage. That is fixed and guarded everywhere. Practise the landing in the KAST Booster Sim save before the next flight.',
  goals: [
    'Dock Horizon Junction to Node 1\'s bottom MOS-DM port.',
    'Deorbit the second stage so no debris is left near the station.',
    'Land the first stage on the KSC pad and save it for reflight.'
  ],
  chartNote: 'Fly it left to right, top to bottom. Select any step for the full procedure; tick steps off as you go.',
  lanes: [
    {
      name: 'Pre-launch', color: '#7F93AE', note: 'In the VAB and on the pad.',
      steps: [
        {
          id: 'practice', title: 'Practise the landing', time: 'Sim save',
          lead: 'A separate save that starts 2 seconds after separation, with you flying Kestrel Booster at 20 km. Nothing done there touches the Horizon career.',
          actions: [
            'Main menu: **Resume Game**, choose **KAST Booster Sim**.',
            'Open FMRS and **disarm** it for this save.',
            'Watch the booster fly itself. Each phase shows at the top of the screen: flip, boostback, coast, entry, glide, landing.',
            'To try again: Esc, **Load**, choose **quicksave_START**.',
            'When it lands on the pad reliably, go back to the Horizon save.'
          ],
          values: [['Made from', 'FMRS separation save of flight 1 (F8486583)'], ['Log', '`logs/kestrel_booster.csv` (real flights log to `logs/flights/`)']],
          watch: ['The upper stage in that save also wakes up and tries to keep climbing. Ignore it.']
        },
        {
          id: 'rollout', title: 'Roll out', time: 'VAB',
          lead: 'Launch a fresh copy of the craft so both flight computers boot clean from the archive.',
          actions: [
            'In the VAB, load **KAST Horizon Junction on Kestrel (LV-5)**.',
            'Launch it to the pad.',
            'Optional cleanup first: Node 1\'s old Centaur is decoupled and sits in a 208 x 230 km orbit. It does not block the bottom port, so it can wait.'
          ],
          values: [['Mass', '118 t'], ['Parts', '63'], ['Boot files', '`boot/kestrel_ascent.ks` (second stage), `boot/kestrel_booster.ks` (first stage)']]
        },
        {
          id: 'terminals', title: 'Check the terminals', time: 'Pad',
          lead: 'Both kOS computers should be running and waiting.',
          actions: [
            'Second stage terminal (`kl_s2_cpu`) should end with "or click this terminal and type 0 or L".',
            'First stage terminal (`kl_booster_cpu`) should say "Standing by until stage separation".',
            'If either is blank or shows an error, revert to the VAB and roll out again.'
          ],
          watch: ['A focused terminal swallows key presses. Never type into KSP until you know where the keys go.']
        },
        {
          id: 'fmrs', title: 'Arm FMRS', time: 'Pad',
          lead: 'FMRS saves the moment of separation. Without it the booster cannot come home. It can only be armed while the rocket is still on the pad.',
          actions: [
            'Click the **FMRS** button on the toolbar to open its window.',
            'Open its settings. Set **Auto-recover** to OFF, so Jingwei can record the booster before it is recovered.',
            'Set **Engine cut-off** to OFF, so FMRS does not shut down the booster engines the script needs.',
            'Click **Arm**. The window must show it is armed before you press 0.'
          ],
          values: [['Needs', 'A probe core on the booster (the hidden OKTO). Without one, FMRS ignores the stage.'], ['Saves', 'A save point the instant the booster separates']],
          watch: [
            'If FMRS is not armed, do not launch: the booster has no way back.',
            'Arm on the pad, never at separation. Arming does not make a save point; it tells FMRS to save at the next separation. Clicking Arm in flight only saves from that moment, after the booster is already gone (this happened on an earlier attempt).',
            'Noticed after liftoff that it is not armed? Revert to launch and arm it on the pad.'
          ]
        },
        {
          id: 'target', title: 'Target and quicksave', time: 'Pad',
          lead: 'Targeting Node 1 switches the ascent script to the direct, phase-timed launch.',
          actions: ['Set **KASP Station Node 1 - Atlas V** as target (map view or the Tracking list).', 'Quicksave with F5.', 'Click the game view, not a terminal.']
        }
      ]
    },
    {
      name: 'Launch and ascent', color: 'var(--gold)', note: 'Flown by the second stage computer. Hands off.',
      steps: [
        {
          id: 'liftoff', title: 'Window and liftoff', time: 'T+0:00',
          lead: 'Press 0 and the script waits for the next phase-timed window, warps to it and launches.',
          actions: ['Press **0** (action group 10), or type 0, L or Enter in the second stage terminal.', 'To launch immediately instead, press **9**.', 'Watch: 9 engines ignite, clamps release, lofted gravity turn.'],
          values: [['Window', 'About every 41 min'], ['Heading', '90° (equatorial)'], ['Climb time model', 'Refined from `logs/kestrel_window.json`']]
        },
        {
          id: 'meco', title: 'MECO and separation', time: 'T+1:20',
          lead: 'The first stage shuts down at 30 percent fuel and separates. FMRS saves here. You do nothing: keep flying the upper stage.',
          actions: [
            'Check the FMRS window: **Kestrel Booster** now appears in its list. That is the save point.',
            'Do **not** switch to the booster with [ or ], and do **not** click it in FMRS yet.',
            'Let the upper stage carry on to orbit.'
          ],
          values: [['Altitude', 'About 22 km'], ['Speed', 'About 660 m/s'], ['Fuel left', '30 percent, for boostback and landing']],
          watch: ['If Kestrel Booster is not in the FMRS list, the save point was not made. Carry on with the mission; the booster is lost this time.'],
          notes: 'The first stage terminal switches to "Waiting to become the active vessel". That is correct: it flies later, in the FMRS replay. In this timeline it falls behind and disappears; the replay is where it really lands.'
        },
        {
          id: 'fairing', title: 'Fairing deploy', time: 'T+2:18',
          lead: 'The fairing drops automatically above 55 km.',
          values: [['Trigger', 'Altitude above 55 km'], ['Stage', '1']]
        },
        {
          id: 'seco', title: 'SECO', time: 'T+3:08',
          lead: 'The second stage cuts off once the apoapsis reaches Node 1\'s altitude.',
          values: [['Target apoapsis', 'About 151 to 158 km'], ['Last flight', 'Apoapsis 150.8 km at T+3:08']]
        },
        {
          id: 'arrival', title: 'Arrival and circularize', time: 'T+8:30',
          lead: 'The script coasts to apoapsis, circularizes beside Node 1, then hands over to you.',
          actions: ['Wait for "Orbit: ... km" on the terminal.', 'Check the distance to Node 1 printed below it.'],
          values: [['Expected gap', 'A few hundred metres'], ['Last flight', 'Ended 300 m from Node 1']]
        }
      ]
    },
    {
      name: 'Station operations', color: 'var(--sky)', note: 'Pilot-paced. Docking is by hand. Stay in the flight scene until the booster replay is done.',
      steps: [
        {
          id: 'approach', title: 'Close the gap', time: 'After arrival',
          lead: 'Use MechJeb to tidy up the rendezvous before releasing the module.',
          actions: ['MechJeb Maneuver Planner: **fine tune closest approach**, execute.', 'Then **match velocities with target** at closest approach, execute.'],
          values: [['Goal', 'A few hundred metres apart, not drifting']]
        },
        {
          id: 'release', title: 'Release Junction', time: 'Stage 0',
          lead: 'Junction separates from the second stage on its decoupler.',
          actions: ['Press **Space** (stage 0).', 'Switch to Junction with [ or ].', 'Let the second stage drift clear before manoeuvring.']
        },
        {
          id: 'ports', title: 'Set up the ports', time: 'Junction',
          lead: 'Fly from the docking port and aim at the right port on Node 1.',
          actions: ['Right-click Junction\'s **top** docking port, choose **Control from here**.', 'Right-click Node 1\'s **bottom** docking port, choose **Set as Target**.']
        },
        {
          id: 'point', title: 'Point at the port', time: 'Smart A.S.S.',
          lead: 'Smart A.S.S. holds Junction lined up with the target port.',
          actions: ['Smart A.S.S.: **TARGET**, then **PAR −**.', 'Wait until Junction stops turning.']
        },
        {
          id: 'drift', title: 'Drift in on RCS', time: 'RCS',
          lead: 'Translate without rotating. Keep the prograde marker on the target marker.',
          actions: ['Press **R** for RCS.', 'Translate with **H/N** (forward and back), **I/K** and **J/L** (sideways).', 'Keep the yellow prograde marker on the purple target marker.'],
          table: { title: 'Closing speed', head: ['Distance to port', 'Speed'], rows: [['Over 50 m', 'About 2 m/s'], ['10 to 50 m', '0.5 m/s'], ['Last 10 m', '0.2 m/s']] }
        },
        {
          id: 'contact', title: 'Contact', time: 'Docked',
          lead: 'The ports pull together and latch.',
          actions: ['When it reports docked, turn Smart A.S.S. **off**.'],
          watch: ['If the ports will not latch: back off to 10 m, re-check Control from here and the target port, then approach again at 0.2 m/s.']
        },
        {
          id: 'deorbit', title: 'Deorbit second stage', time: 'Disposal',
          lead: 'Remove the spent second stage from the station\'s orbit.',
          actions: ['Switch to **Kestrel Upper Stage** with [ or ].', 'Back away a few hundred metres on RCS.', 'Smart A.S.S. **RETRO**.', 'Burn until the periapsis is below 0 km.'],
          watch: ['Next is the booster replay. Until it is done, do not go to the Space Center, Tracking Station or VAB, do not revert, and do not load a quicksave. Any of those ends the FMRS flight and the booster save point is gone.']
        }
      ]
    },
    {
      name: 'First stage recovery', color: '#E8E9EC', dashed: true, prefix: 'R',
      note: 'Replays from separation at T+1:20, after station operations, through FMRS.',
      steps: [
        {
          id: 'jump', title: 'Jump back', time: 'FMRS',
          lead: 'FMRS goes back in time to the separation moment and puts you in control of the booster. The station work you just did is kept; FMRS returns you to it afterwards.',
          actions: [
            'Optional safety net: press **F5** while docked, before the jump, to quicksave the finished station work.',
            'In the FMRS window, click **Kestrel Booster**.',
            'The game reloads at about T+1:20 with the booster active, 20 km up.',
            'The booster computer reboots and starts flying on its own. "Kestrel Booster: flip" shows at the top of the screen.',
            'Hands off. Watch it, or open its terminal to see the phase, altitude, miss distance and fuel.'
          ],
          watch: ['Do this only after docking and the second stage deorbit are done.', 'While flying the replay, do not go to the Space Center or Tracking Station: FMRS sends you back to the main flight and the booster is lost.', 'Do not press F5 or F9 during the replay.'],
          notes: 'The upper stage also appears in the replay and its computer tries to keep climbing. Ignore it; it leaves physics range and FMRS discards it.'
        },
        {
          id: 'flip', title: 'Flip', time: 'Auto',
          lead: 'The booster turns to face KSC. If the reaction wheel is too slow, a trickle of thrust swings it round.',
          values: [['Limit', '45 s to turn within 12°']]
        },
        {
          id: 'boostback', title: 'Boostback', time: 'Auto, 3 engines',
          lead: 'Burns until the predicted impact point reaches the pad, steered by the Trajectories prediction.',
          values: [['Aims at', '6 km past the pad: the entry burn and glide pull the impact short'], ['Stops when', 'Impact reaches the aim point, or fuel reaches the landing reserve'], ['Fuel reserve', '650 units liquid fuel (was 900)']],
          notes: 'Booster Sim run 1 (2026-11-06): soft upright splashdown 12.4 km short of the pad. Boostback stopped at the old 900-unit reserve about 5 km short; the entry burn and glide added 7.5 km more. Tuned: reserve 650, aim 6 km past the pad, firmer final descent. The log now records the predicted impact point to tune the glide.'
        },
        {
          id: 'entry', title: 'Coast and entry burn', time: 'Auto',
          lead: 'Coasts engines-first, then slows down before the thick air.',
          values: [['Entry burn', 'Below 32 km, if faster than 650 m/s'], ['Ends at', '480 m/s']]
        },
        {
          id: 'glide', title: 'Grid-fin glide', time: 'Auto',
          lead: 'The grid fins steer the falling booster onto the pad.',
          values: [['Ends', 'When the landing burn must start, with a 15 percent margin']]
        },
        {
          id: 'landing', title: 'Landing burn', time: 'Auto, 3 engines',
          lead: 'A suicide burn, then a slow final descent that kills sideways drift.',
          values: [['Legs', 'Lower below 1.5 km'], ['Target', 'KSC pad, latlng(-0.0972, -74.5577)']],
          notes: 'The terminal reports "Booster down" with the distance from the target and the fuel left.'
        },
        {
          id: 'recover', title: 'Save and recover', time: 'Tracking Station',
          lead: 'Bring the landed booster into the main timeline, record it for reflight, then recover it for the refund.',
          actions: [
            'After "Booster down", click **Jump back to main mission** in the FMRS window.',
            'You return to the station at the moment you left. The landed booster is now in the main save, standing on the pad.',
            'Go to the **Tracking Station** and select **Kestrel Booster**.',
            'Jingwei: **Save for reflight**.',
            '**Recover** it.',
            'Tell Management: the flight log and trajectory log get built in the debrief.'
          ],
          watch: ['Do not use the recover button above the altimeter during the replay: that recovers it before Jingwei has recorded it.']
        }
      ]
    }
  ],
  sections: [
    {
      title: 'How FMRS works',
      text: [
        'FMRS (Flight Manager for Reusable Stages) makes a save point the moment a stage with a probe core separates. You keep flying the main vessel. Afterwards you jump back in time to that save point and fly the stage you dropped. When it has landed, you jump back to the main mission and FMRS adds the landed stage to your main save.',
        'Your station work is kept. When you jump to the booster, FMRS first saves the main mission exactly as it is (`saves/Horizon/FMRS_main_save.sfs`). Jump back to main mission reloads that save and only adds the landed booster to it, so you return to the docked station at the moment you left. Only a revert or loading an older quicksave during the main mission can undo station work, the same as without FMRS.',
        'Without FMRS the booster would simply disappear: KSP deletes anything in the atmosphere that falls more than the physics range (100 km here) behind the vessel you are flying.'
      ],
      list: [
        '**On the pad, before pressing 0:** open FMRS, Auto-recover OFF, Engine cut-off OFF, **Arm**. Never arm in flight: it only catches separations that happen after it is armed.',
        '**At separation:** do nothing. Check that Kestrel Booster appears in the FMRS list.',
        '**Until the replay:** stay in the flight scene. No Space Center, Tracking Station, VAB, revert or quickload.',
        '**Replay:** click Kestrel Booster in FMRS. Hands off while the script lands it.',
        '**After landing:** Jump back to main mission, then Tracking Station, Jingwei Save for reflight, Recover.'
      ]
    },
    {
      title: 'Flight 1 booster loss: cause and fix',
      text: [
        'At separation the booster computer started its landing straight away and asked Trajectories for a prediction. Trajectories only answers for the vessel being flown, so it threw an error, the script stopped, and the stage fell with nothing flying it.',
        'Fix (2026-11-06): the booster waits until you take control of it in the FMRS replay, and every Trajectories call is checked against the active vessel first, so that crash cannot happen at any point in the flight. Each phase now shows on screen and is written to the log. Old versions are kept in `KAST_Backups/booster_fix_2026-11-06`.',
        'Second fault, found in the Booster Sim (2026-11-06): the script called `addons:tr:setretrograde()`, which does not exist in kOS 1.6 (it has a `RETROGRADE` setting instead). The booster crashed before the flip. Fixed: the script now sets `addons:tr:retrograde` and checks each Trajectories feature exists before using it.',
        'The Booster Sim save was running the old copy of the script stored on the booster\'s own disk. It now has kOS **Start on archive** turned on, so it always runs the current script from `Ships/Script/boot`.',
        'The KSP.log from that session was overwritten by a restart. Restart KSP.bat now copies KSP.log to `KAST_Backups/ksp_logs` before it closes the game.'
      ]
    },
    {
      title: 'Contingencies',
      table: {
        head: ['If this happens', 'Do this'],
        rows: [
          ['Pressing 0 does nothing', 'A kOS terminal has focus. Click the game view, or type 0 in the second stage terminal.'],
          ['Keys move the rocket instead of the terminal', 'Focus is on the game view. Click the terminal first.'],
          ['A script stops with an error', 'Revert to launch. Scripts load from the archive at every launch, so a fix applies on revert.'],
          ['No "Waiting to become the active vessel" on the booster', 'FMRS may not have saved at separation. Note the time and tell Management.'],
          ['Kestrel Booster is not in the FMRS list after separation', 'FMRS was not armed, or the stage has no working probe core. Finish the mission; the booster is lost this flight.'],
          ['The booster script stops with an error in the replay', 'Do not restart KSP before telling Management. Restart KSP.bat now saves KSP.log first, but leave the game open if you can.'],
          ['Booster misses the pad', 'Let it land or splash down, then jump back to the main mission. The log goes to Management for tuning in the Booster Sim.'],
          ['You went to the Space Center before the replay', 'The FMRS flight has ended and the booster save point is gone. Note it for the debrief.'],
          ['Docking ports will not latch', 'Back off to 10 m, re-check the ports, approach again at 0.2 m/s.']
        ]
      }
    },
    {
      title: 'Standing rules',
      list: [
        'Management never accepts contracts. Any contract this flight could fill goes in the debrief.',
        'Oh Scrap! rates Kestrel parts "Terrible" until they log flights.',
        'Never open the Xbox app or Xbox Game Bar on the flight PC.',
        'Memory: modded KSP grows by about 1.5 GB an hour, more with every quickload, FMRS jump or scene change. Start KSP with Restart KSP.bat: it also starts KAST Memory Watch, which logs memory every 30 s and warns (tray balloon and beep) when KSP passes 20 GB or Windows drops below 4 GB free. When warned, save and restart. KSP crashed on 2026-11-06 at about 15 GB after an hour of Booster Sim reloads.',
        'Booster telemetry for every run (Booster Sim and real flights) is on the Booster telemetry page.',
        'HullCam VDS Continued 0.2.2.4 is installed and working; Mission Control Panel (F8 in flight) uses it.',
        'Open question: grid fins stay on the black interstage (Falcon 9 style), or move to the top of the white booster tank?'
      ]
    }
  ]
});
