# Frontend design decisions

Source: the `landing-page-design` visual system (typography, spacing, radius, motion, states),
adapted to an app UI, plus the client's brief: minimal, calm, one accent colour.

| Decision | Choice | Why |
|---|---|---|
| Theme | Light, warm off-white surfaces with dark ink text | Readable in sunlight on a phone; warm tones avoid a cold, empty look |
| Accent | Amber/orange, used only for the primary action, focus and key status | One accent keeps the screen quiet and the next step obvious |
| Font | Poppins, one family, no italics, weight capped at semibold | Renders Latin and Devanagari cleanly at small sizes |
| Officer list row | Borrower name, DPD, and one status dot | The brief asks for a short list and an outcome in three taps |
| Status colours | Dot colour from the score band, always paired with a text label | Colour alone fails colour-blind users and bright sun |
| Spacing | Only the 2/4/8/12/16/24/32/40/48/64/80/96 px tokens | Consistent rhythm, no ad hoc values |
| Motion | `cubic-bezier(0.22,1,0.36,1)`, transform and opacity only, reduced motion respected | Weighted feel without jank on cheap phones |
| States | Hover, active, focus ring, skeleton loading, empty and inline error on every screen | Brief requires loading, empty and error states |
| Rule | No control without working behaviour behind it | Brief: "no dead buttons" |

Copy rules: sentence case, no exclamation marks, errors say what failed and what to do next.
