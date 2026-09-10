# Style DNA and fidelity

Style DNA records typography, colors, grid, composition, charts, visuals, storytelling, density, preferred layouts, anti-patterns, and a normalized style vector.

Reference fidelity is semantic rather than pixel-only. Weight typography 20, color 15, layout 20, chart style 15, density 10, composition 10, storytelling 5, and visual tone 5. Multiply dimension importance by Reference Strength and advanced-mixer weight. A locked dimension targets at least 95.

Reference Strength targets:

- 0-30: no fidelity enforcement.
- 31-60: overall fidelity at least 70.
- 61-80: at least 82.
- 81-100: at least 90.

Repair only the failing dimensions. Do not regenerate the whole deck when typography, layout, or chart style alone is below target.
