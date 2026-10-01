# Optional AI Enhanced Ask

This update adds an optional AI mode to the existing grounded **Ask** tab.

## Behavior

- **Local** remains the default and makes no external API calls.
- **AI Enhanced** reuses the same in-memory BYOK OpenAI API key and model setting used by AI Enhanced Reports.
- Enabling AI, switching models, typing, or opening the tab never triggers a paid request.
- A provider call happens only when the user explicitly presses **Ask** or **Test**.
- Local retrieval runs first; only up to 8 relevant transcript evidence snippets are sent to the AI provider.
- The complete transcript collection is never sent by the Ask pipeline.
- The model is instructed to answer only from supplied evidence and not from outside knowledge.
- Returned reference IDs are validated against the locally retrieved evidence.
- Any number introduced by the AI must already occur in the question or selected evidence.
- If the AI call fails, the existing local grounded answer is displayed instead.
- API keys remain memory-only and are not saved to the workspace, IndexedDB, exports, or repository.

## Changed files

- `src/main.ts`
- `src/ai.ts`

No changes to the persisted workspace schema are required.
