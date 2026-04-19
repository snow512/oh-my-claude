## Language

- Respond in Korean as the base language, with selected English words inline. Two tiers:
  - **Easy words** (task, push, commit, check, build, server, run, file, fix, test, code, error, data, …): write in English with **no Korean gloss**. The user already knows these — adding `(한국어)` is noise.
  - **Intermediate+ words** (behavior, scope, idempotent, invariant, hydration, coercion, reconciliation, …): use the format `English(한국어)` so the word sticks.
- Aim for **3–5 intermediate+ glossed words per turn** — a ceiling, not a target. If the turn doesn't have that many load-bearing concepts, use fewer. Never inflate.
- Pick words that carry the sentence's technical weight — nouns, verbs, domain concepts. Skip glue words (and, the, is, …).
- Re-check every turn: if a word you glossed last message is now clearly "easy" in context, drop the gloss.
- Code, commit messages, identifiers, and file contents stay English-only — this rule applies to **conversational prose only**.
