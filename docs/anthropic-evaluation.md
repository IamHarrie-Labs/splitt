# Anthropic evaluation, 17 October 2026

Configured model: Claude Haiku 5.5 (`claude-haiku-5-5`), with a rule-based fallback and independent validator. The private key is saved only in ignored local settings and the VPS private environment. It is not a frontend variable. Anthropic's official Models API confirmed the model is available. Its [tool-use documentation](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools) documents the forced-tool restriction affecting Sonnet 5.5, Opus 5.5 and Fable 5.1. This release keeps the supported Haiku model and existing tool schema.

## Payment-note regression results

| Run | Literal matcher | Model plus fallback | Accepted Haiku responses | Safety cases rejected |
| --- | --- | --- | --- | --- |
| 1 | 7/10 | 10/10 | 5/10 | 5/5 |
| 2 | 7/10 | 10/10 | 5/10 | 5/5 |

Reports: `payment-note-evaluation-anthropic-1.json` and `payment-note-evaluation-anthropic-2.json`. Each run made ten bounded requests, with at most 500 output tokens per request and no SDK retries. The five invalid or ambiguous cases used fallback; they are not five successful model responses. The earlier Nemotron report remains separate and unchanged.

The parser now compares one complete money token inside a verbatim quote such as `$1,200 received`. It does not select among multiple amounts or accept an invented quote. Wrong-payer, wrong-receipt-amount, invoice ambiguity, chain-invoice and quotation checks remain independent. Rejected model output and provider failures have fixed diagnostic codes; raw SDK errors and credentials are not stored.

These are ten synthetic development regression cases, including the examples used to diagnose the parser. They are not a held-out accuracy benchmark, customer evidence or proof of general improvement. An earlier reported 8/10 result predates this fix; the committed reports above describe the new measurements only.

## Allocation remains a separate limitation

`anthropic-planner-smoke.json` records one synthetic allocation check. Both model attempts were rejected by the validator. The resulting deterministic fallback passed validation and matched the baseline. This does not establish reliable Claude allocation planning or an advantage over the rules engine. Earlier on-chain payout proofs used the deterministic fallback; configuring Haiku does not change their provenance.

## Hosted controls and commands

The self-serve note endpoint is scoped to the signed-in owner's verified vault and indexed receipts. Results do not update project balances, accepted obligations, attribution or payment authorization. The interface explains that notes are sent to the configured provider. Repeating the same receipt/note returns the saved result.

Hosted provider calls are reserved in PostgreSQL before the request. Allocation corrections and payment-note analysis share limits of eight requests per vault per UTC day and forty globally. Failures consume reservations. Exhaustion uses a labelled deterministic fallback. These are request limits, not a fixed dollar-price guarantee.

```sh
npx tsx --env-file=.env --env-file=server/.secrets/anthropic.env scripts/evaluate-payment-notes.ts --live --provider=anthropic --allow-paid --run=1
npx tsx --env-file=.env --env-file=server/.secrets/anthropic.env scripts/check-anthropic-planner.ts --live --allow-paid
```

Anthropic mode requires explicit paid-call acknowledgement. The Vercel Gateway evaluator retains its zero-priced-model check. Default offline evaluation does not call a provider. Public API HTTPS and browser/mobile verification remain separate launch work.
