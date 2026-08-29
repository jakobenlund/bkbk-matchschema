# BKBK Matchschema

Mobile-first match scheduler for BKBK F18 Svart. It supports 2×15 and 3×15 minute matches with a selectable 3- or 5-minute substitution interval, fair bench rotation, live substitutions, temporary player pauses, return priority, a match timer, and local match history.

**Live app:** https://jakobenlund.github.io/bkbk-matchschema/

The published app stores player names and match history only in the browser on each coach's device. No roster or match data is sent to GitHub.

## Development

Run the scheduler tests with:

```bash
node tests/matchschema.test.js
```

Technical documentation is available in [`matchschema_context.md`](matchschema_context.md).
