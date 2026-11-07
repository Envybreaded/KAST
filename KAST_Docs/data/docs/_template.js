/* TEMPLATE for a new KAST document. Copy this file, rename it, fill it in,
   then add its path to data/manifest.js. Not loaded by the site as it is.

   Text fields accept **bold**, `code` and plain https:// links. */
KAST.registerDoc({
  id: 'my-mission',                 // unique, used in the address bar: #/doc/my-mission
  order: 10,                        // position in the nav and on the home page
  kind: 'Flight plan',              // 'Flight plan', 'Roadmap', 'Vehicle', 'Procedure'...
  status: 'Draft',
  navTitle: 'My mission',           // short name for the top bar
  title: 'Mission name',
  vehicle: 'LV-5 Kestrel',          // optional
  cta: 'View flight plan',          // button text on the home page
  hero: 'assets/hero-orbit.jpg',    // any image in assets/
  subtitle: 'One or two sentences: what this flight does.',
  checklist: true,                  // true = steps can be ticked off (saved in this browser)

  facts: [['Vehicle', '...'], ['Target', '...']],
  goals: ['First objective.', 'Second objective.'],

  lanes: [                          // one row of the chart per lane
    {
      name: 'Phase name', color: 'var(--gold)', note: 'Short line under the name.',
      // dashed: true      dashed line, for a replay or optional branch
      // prefix: 'R'       numbers this lane R01, R02... instead of continuing the count
      // numbered: false   no step numbers (roadmaps)
      steps: [
        {
          id: 'step-one',           // unique within the document
          title: 'Step title',
          time: 'T+0:00',           // shown under the title
          // status: 'done' | 'next' | 'planned'   (roadmaps)
          lead: 'What this step is for.',
          actions: ['First thing to do.', 'Second thing.'],
          values: [['Label', 'Value']],
          table: { title: 'Optional table', head: ['A', 'B'], rows: [['1', '2']] },
          watch: ['Things that go wrong here.'],
          notes: 'Anything else.'
        }
      ]
    }
  ],

  sections: [                       // optional blocks under the chart
    { title: 'Contingencies', table: { head: ['If', 'Then'], rows: [['...', '...']] } },
    { title: 'Notes', list: ['...'] }
  ]
});
