# Blueprints

Builds the line drawings on the site's Blueprints page (`#/blueprints`) from the game files.

    set KSP_ROOT=C:\path\to\Kerbal Space Program
    python build.py ..\..\data\blueprints

What it does, per craft listed in `CRAFTS` in `build.py`:

1. Reads every PART in the .craft: position, rotation, selected variant, B9 subtypes, attach nodes and module state.
2. Finds each part's config in `GameData/ModuleManager.ConfigCache` and its MODEL nodes (or, with `mesh =`, the first .mu in the part folder, as KSP does).
3. Reads the .mu models (`mureader.py`): transform tree, meshes, skinned meshes and animation curves. Materials and textures are not read.
4. Shows only what the game shows: unselected variant GAMEOBJECTS, unselected B9 subtype transforms, ModuleB9DisableTransform, jettison shrouds, parachute canopies, glow and plume meshes and unattached structural trusses are hidden. Deploy animations are posed at their saved state (legs folded, panels stowed). Procedural fairings are rebuilt from the craft's XSECTION list.
5. Welds vertices at 1 mm, drops duplicate triangles and keeps hard edges (open boundaries, and creases over 6 degrees where the model's normals are split) plus smoothed edges that the viewer draws only on the outline.
6. Packs each unique part + variant once per craft into `<slug>.bin`, with `<slug>.json` listing the parts and where each copy goes.

`hidden_report.json` (written next to this file, not published) lists the transforms hidden per part, for checking.
Never add a craft twice: `build.py` stops if two crafts have the same part list.
