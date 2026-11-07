/* Roadmap: Horizon Station assembly. Module details come from each module's craft description. */
(function () {
  const PROC = [
    'Launch on **Harrier (Atlas V 421)**: MechJeb target Horizon Station (Node 1), Launch to Rendezvous, inc 0, turn start 1 km, end 60 km, 40 percent, autostage on, stop at stage 1.',
    'Stage 2 drops the fairing; stage 1 releases the module within 1 km of the station.',
    'The module flies itself (MOS-CBS probe core, RCS): dock its top port to the port listed below.',
    'Deorbit the Centaur.'
  ];
  const mod = (id, n, name, mass, role, port, extra) => Object.assign({
    id, title: name, time: 'Launch ' + n + ' of 10',
    meta: mass + ' t, uncrewed',
    lead: role,
    values: [['Mass', mass + ' t'], ['Docks to', port], ['Launch file', 'KAST Horizon ' + name + ' on Harrier (Atlas V 421)'], ['Payload only', 'Subassembly of the same name']],
    actions: PROC,
    status: 'planned'
  }, extra || {});

  KAST.registerDoc({
    id: 'horizon-roadmap',
    order: 2,
    kind: 'Roadmap',
    status: 'Launch 1 of 10 next',
    navTitle: 'Horizon roadmap',
    title: 'Horizon Station',
    cta: 'View roadmap',
    hero: 'assets/photo-glide-ksc.jpg',
    subtitle: 'Ten launches turn KASP Station Node 1 into Horizon Station, an ISS-style outpost. Every joint is an MOS-DM 1.875 m docking port.',
    facts: [
      ['Start point', 'Node 1 in orbit, Valentina aboard'],
      ['Modules', '10 launches, 4.6 to 7.3 t each'],
      ['Ports', 'MOS-DM 1.875 m at every joint'],
      ['Reference craft', 'Complete station, 193 parts'],
      ['Standard launcher', 'Harrier (Atlas V 421), 51,100'],
      ['Reusable option', 'LV-5 Kestrel, about 33,000 recovered']
    ],
    chartTitle: 'Assembly sequence',
    chartNote: 'Launch order, left to right. Select a module for its role, docking port and launch procedure.',
    legend: [['f', 'Complete'], ['', 'Next up'], ['d', 'Planned']],
    lanes: [
      {
        name: 'Foundation', color: 'var(--gold)', note: 'What the station and the program stand on.', numbered: false,
        steps: [
          {
            id: 'node1', title: 'Node 1 in orbit', time: 'Complete', status: 'done',
            lead: 'KASP Station Node 1 - Atlas V is the core of Horizon Station.',
            values: [['Orbit', 'About 150 x 178 km, 0.19°'], ['Crew', 'Valentina Kerman'], ['Free port', 'Bottom MOS-DM port, Centaur decoupled']]
          },
          {
            id: 'kestrel-orbit', title: 'Kestrel reaches orbit', time: '2026-11-06', status: 'done',
            lead: 'First LV-5 Kestrel flight: direct, phase-timed ascent ending 300 m from Node 1.',
            notes: 'See Flight logs, flight 01.'
          },
          {
            id: 'kestrel-landing', title: 'First booster landing', time: 'Next Kestrel flight', status: 'next',
            lead: 'The booster script fault from flight 01 is fixed. The next flight is the first landing attempt.',
            values: [['Landing zone', 'KSC pad'], ['Method', 'FMRS replay, kOS boostback and suicide burn']]
          },
          {
            id: 'kestrel-reflight', title: 'First reflight', time: 'After a landing', status: 'planned',
            lead: 'Fly a recovered booster again with Jingwei reflight pricing.',
            values: [['Jingwei pricing', '40, 25, 10 percent'], ['Oh Scrap!', 'Parts rated "Terrible" until they log flights']]
          }
        ]
      },
      {
        name: 'Launches 1 to 5', color: 'var(--sky)', note: 'The spine and the science labs.',
        steps: [
          mod('junction', 1, 'Junction', '4.6', 'Spine node: docks to Node 1 on its aft port and carries 4 side ports.', 'Node 1 bottom MOS-DM port (free it by decoupling the Centaur)', {
            status: 'next',
            notes: 'Junction also has a Kestrel version, KAST Horizon Junction on Kestrel (LV-5): see the Junction flight plan.'
          }),
          mod('pathfinder', 2, 'Pathfinder', '5.6', 'Main science lab on the spine, forward of Junction.', 'Forward end port of Junction'),
          mod('crossroads', 3, 'Crossroads', '4.6', 'Forward node: labs on its sides; crew vehicles dock to its free ports.', 'Forward end port of Pathfinder'),
          mod('prospect', 4, 'Prospect', '5.5', 'Starboard science lab on Crossroads.', 'Starboard side port of Crossroads'),
          mod('lantern', 5, 'Lantern', '5.0', 'Port laboratory on Crossroads.', 'Port side port of Crossroads')
        ]
      },
      {
        name: 'Launches 6 to 10', color: '#E8E9EC', note: 'Power, habitat and the airlock.',
        steps: [
          mod('spine', 6, 'Spine', '4.8', 'Truss hub on Junction zenith; carries both Sunwings.', 'Zenith side port of Junction'),
          mod('sunwing-s', 7, 'Sunwing Starboard', '7.3', 'Starboard power truss: 15 m lattice truss, 4 main solar wings outboard, 4 radiators inboard.', 'Starboard side port of Spine'),
          mod('sunwing-p', 8, 'Sunwing Port', '7.3', 'Port power truss: 15 m lattice truss, 4 main solar wings outboard, 4 radiators inboard.', 'Port side port of Spine'),
          mod('haven', 9, 'Haven', '5.4', 'Habitat with 5 seats, on Junction starboard.', 'Starboard side port of Junction'),
          mod('threshold', 10, 'Threshold', '4.6', 'Airlock with 3 seats and EVA access, on Junction port.', 'Port side port of Junction')
        ]
      }
    ],
    sections: [
      {
        title: 'Reference',
        list: [
          'Assembled reference craft: **KAST Horizon Station - complete (ISS-style reference)**, 193 parts. Grab a module by its port to pull it off as a payload.',
          'Every module has a launch file, KAST Horizon <name> on Harrier (Atlas V 421), and a payload-only subassembly.',
          'Earlier roadmap write-up: https://claude.ai/artifact/U732vbekg5quWCQn9eEKM5'
        ]
      }
    ]
  });
})();
