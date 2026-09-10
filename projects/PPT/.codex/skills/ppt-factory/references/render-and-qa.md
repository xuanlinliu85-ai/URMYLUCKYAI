# Rendering and QA

Route editable text, labels, tables, KPI blocks, standard charts, and simple shapes to Native PPT. Route genuinely complex vector diagrams to SVG. Use raster images only for hero artwork, atmosphere, backgrounds, and decoration. HTML/CSS may support style exploration but is never the final source of truth.

Technical QA checks overflow, overlap, clipping, bounds, invalid assets, broken SVG, font substitution, contrast, and chart-label collision. Visual QA scores readability, hierarchy, alignment/grid, whitespace, data visualization, style consistency, reference fidelity, and AI-look penalties.

Pass requires overall at least 85, readability at least 85, no critical technical errors, and AI-look score at most 20. Auto repair is capped at three passes: technical defects, layout/readability, then style/fidelity. Roll back a pass if its score declines.
