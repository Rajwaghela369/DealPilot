# AI Layer Implementation — Task List

Scope: **the model layer only.** Design reference: `README.md` in this
directory. Schema reference: `docs/schema/README.md`. Existing migration head:
`0009`.

**Status: Phase 0 and Phase 1 complete except the two things that need a Groq
key** — the live smoke call (0.3) and the live challenger comparison (1.5).
Task 0.9 was declined, not deferred. Phase 2 is next and needs no key for
2.1-2.3.

Files added by Phase 0: `app/ai/{client,governor,pipeline}.py`,
`app/ai/prompts/{__init__,smoke}.py`, `app/services/activity.py`,
`backend/worker.py`, `backend/tests/verify_phase0{,_http}.py`, and a `worker`
compose service.

**32 acceptance checks pass** — 15 in `verify_phase0.py` (no server needed) and
17 in `verify_phase0_http.py` (route -> service -> worker end to end, including
the hard-kill crash test and the `stale_days` filter in both directions).

Dependency order — each phase depends on the one above it, except Phase 8 and
Phase 9 which depend only on Phases 0–5:

```
0  Foundations ......... worker, client, provenance, versioning
1  Eval harness ........ fixtures + labels + metrics        <- no model calls yet
2  Transcript + roster .. meeting_attendees                 <- unblocks the 4 SQL risks
3  Extraction + Gate 0 .. extracted_facts, evidence
4  Gate 1 ............... claim_validations
5  Meeting synthesis .... meetings.summary / .sentiment      (needs 0010)
6  Reconciliation ....... commitments, supersession
7  Risk detection ....... risks, recommendations             (needs 0011, 0012)
8  Meeting briefs ....... meeting_briefs
9  Chat ................. chat_sessions, chat_messages
10 Triggers ............. event invalidation + the nightly sweep    needs 0013
```

Phase 10 is the exception to the order above: **10.1–10.4 can land as soon as
Phase 3 is done** (tier 0 needs Gate 0 to exist, tier 1 needs only the existing
`detect.py`), while 10.5 needs Phase 7. Doing tiers 0 and 1 early is worth it —
tier 0 is what makes the schema's self-invalidation promise real, and nothing
performs it today.

---

## Phase 0 — Foundations

No model calls. Everything here is testable without an API key.

- [x] **0.1 Add the dependencies.** `backend/requirements.txt`: `langchain`,
      `langchain-groq`, `langgraph`. Pin them. No checkpointer package — see
      `README.md` §7.
      *Done when:* `from langchain_groq import ChatGroq` and
      `from langgraph.graph import StateGraph` both import in the venv.

- [x] **0.2 Add AI settings.** `app/core/config.py`, mirrored into
      `backend/.env.example`: `groq_api_key`, `model_primary =
      "openai/gpt-oss-120b"`, `model_cheap = "openai/gpt-oss-20b"`,
      `model_challenger = "qwen/qwen3.8-27b"` (evals only),
      `ai_enabled: bool = False`, per-stage `max_tokens` and a token ceiling.
      *Done when:* the app starts with `ai_enabled=False` and no key present.

- [ ] **0.3 One LLM client module.** `app/ai/client.py` — the only place a
      model is named. Builds a configured `ChatGroq` runnable per role, wires
      `.with_structured_output()` with `strict: true`, and captures usage
      (`input_tokens`, `output_tokens`, `latency_ms`). Every task calls through
      it; no task constructs a client.
      *Done when:* a smoke test returns a parsed Pydantic object and a
      populated usage record, and grepping for a model id finds only this file
      and `config.py`.
      **Built and verified offline** — imports with no provider installed,
      `AIDisabled` when `ai_enabled=False`, `RunBudget` ceiling enforced,
      retry classification correct, and the grep check passes.
      **Outstanding:** the live call. Set `GROQ_API_KEY`, `AI_ENABLED=true`, and
      run the `smoke` prompt through `client.structured()`; that is also the
      first real test of whether `json_schema` works on the account.

- [x] **0.4 Prompt registry with versions.** `app/ai/prompts/` — one module per
      task, each exporting `PROMPT` and `VERSION`. The version string is what
      lands in `claim_validations.validator_version` and (after 0011)
      `risks.detector_version`. A prompt change without a version bump is a bug.
      *Done when:* every prompt is importable by name and carries a version.

- [x] **0.5 The worker.** `backend/worker.py` — poll
      `meetings WHERE analysis_status='queued' ... FOR UPDATE SKIP LOCKED
      LIMIT 1`, run the pipeline, move the status. Write the loop so it can
      carry more than one poll query: Phase 10 adds dirty deals and the nightly
      sweep to the same process, and there is to be no scheduler. Add it to
      `docker-compose.yml` as a separate service sharing the backend image.
      `failed` means stages 0–4 failed; a later stage failure still yields
      `complete` with the stage error logged.
      *Done when:* `POST .../meetings/{id}/analysis` reaches `complete` with a
      no-op pipeline, and killing the worker mid-run leaves the row `queued`.

- [x] **0.6 Write `deals.last_activity_at`.** `services/ingest.py` and
      `services/meeting.py` touch it in the same transaction as the write.
      Blocking for Gate 2 and for the existing `stale_days` filter, which
      currently reads a column nothing sets.
      *Done when:* uploading a document and completing a meeting both advance
      it, and `stale_days` returns the expected deals.

- [x] **0.7 Tracing.** Langfuse (per `docs/schema/README.md` §10, which is why
      there is no `ai_runs` table) or structured logging of
      `(task, model, version, usage, latency, outcome)` from `client.py`.
      *Done when:* one analysis run is inspectable end to end.

- [x] **0.8 Rate-limit governor.** The Developer plan gives 250K TPM / 1K RPM,
      and the parallel extraction fan-out is what hits it first. `client.py`
      needs a global concurrency semaphore plus a token bucket estimated from
      request size, and 429 handling with backoff — not a bare retry.
      *Done when:* firing 50 extraction calls at once completes without a 429
      reaching the caller, and the concurrency ceiling is configurable.

- [ ] **0.9 Resolve the Python version.** ~~Rebuild the venv on 3.12.~~
      **Declined — staying on 3.9, deps left unpinned.** Recorded because it
      has a standing consequence, not because it is still planned.

      `langchain`, `langchain-core`, `langchain-groq` and `langgraph` all
      require `>=3.10`, so from one unpinned `requirements.txt` pip resolves
      **LangChain 0.x on the 3.9 host venv and 1.x in the 3.12 container**.
      The container is therefore the runtime of record for anything importing
      LangChain; the host venv stays useful for Alembic, the existing API, and
      every part of the AI layer that does not import a provider — which is why
      `governor.py` has no LangChain import and `client.py` imports lazily.

      Two places this leaks: `structured_output_method` is a setting because
      `json_schema` postdates the 0.x line, and `_is_retryable` matches on text
      rather than exception classes for the same reason.

      *Revisit when:* a stage behaves differently on host and container, or
      `pip install` on 3.9 stops resolving any compatible version at all.

---

## Phase 1 — Eval harness

Before the extractor, not after. This is the largest debt in the project and
everything downstream is unmeasurable without it.

- [x] **1.1 Three fixture transcripts.** `backend/tests/fixtures/transcripts/`.
      Realistic speaker-labelled text: a discovery call, a security review, a
      negotiation check-in. One should contain a *contradiction* of an earlier
      fact and one an *unfulfilled commitment*, so Phase 6 has something to
      find.
      *Done when:* each ingests through the real upload path and produces chunks.
      **Done** — one deal, three meetings, July/August/September, 8.5KB total →
      4 + 4 + 3 chunks. `manifest.json` records the eight planted cases and the
      expected rosters; `load.py` is idempotent (it deletes the account first,
      because `documents.content_hash` is globally unique and a re-run would
      otherwise 200 and attach chunks to the previous deal).

- [x] **1.2 Hand-labelled expectations.** A JSON file per transcript: expected
      facts with `fact_type`, content, and the exact `char_start`/`char_end` of
      the span that backs each one.
      *Done when:* the labels are machine-readable and offsets resolve verbatim
      against the ingested chunks.
      **Done** — 26 facts across all eight `fact_type` values; 26/26 resolve,
      0 straddling a chunk boundary. Snippets are authored by hand and offsets
      are *derived* by `resolve_labels.py`: `split_into_chunks` decides the
      boundaries, so a hand-written offset is a guess about an implementation
      detail, and Gate 0 compares against a chunk rather than the file.

- [x] **1.3 Metric functions.** `backend/tests/eval/metrics.py` — Gate 0 pass
      rate, fact precision/recall against labels, verdict distribution,
      `confidence × verdict` matrix, risk-key Jaccard across two runs.
      *Done when:* each runs against a recorded output file with no API call.
      **Done** — `tests/eval/metrics.py` plus 13 tests scoring a hand-built
      recording with exact expected numbers, so a scoring bug cannot look like a
      model regression. The matching rule is **(fact_type, span overlap)**,
      never text equality: the model's phrasing varies legitimately between
      runs, the span it cites should not.
      Also absorbed the Phase 0 database checks — `test_worker.py` and
      `test_activity.py`. **28 tests pass**; the subprocess crash test and the
      HTTP round trip stay in `verify_phase0_http.py`.

- [x] **1.4 The missing model-registry test.** `models/__init__.py` already
      references `tests/test_model_registry.py`, which does not exist.
      *Done when:* every table in `Base.metadata.tables` has a mapped class.
      **Done** — and extended to the failure the module docstring actually
      warns about: a mapped class missing from `__all__` is invisible to
      `alembic` autogenerate, so its table silently never gets created.

- [ ] **1.5 Challenger harness.** The metric functions take a model id, so the
      same fixtures can be scored on `openai/gpt-oss-120b`,
      `openai/gpt-oss-20b` and `qwen/qwen3.8-27b`. The Qwen model is Preview
      tier and 5-6x the price, so it belongs here and nowhere else
      (`README.md` §7).
      *Done when:* one command scores all three and prints a comparison.
      **Partly done** — `tests/eval/run_extraction_eval.py`. `--replay DIR`
      scores recorded runs for any number of models today, with no key and no
      network. `--live --model all` is written but refuses to run: it imports
      the real extractor and says so if absent, rather than inventing a
      throwaway prompt — an eval scored against a prompt nothing else uses
      measures nothing. **Outstanding:** the live three-way comparison, which
      needs tasks 3.1/3.2 and a key (wired in 3.6).

---

## Phase 2 — Transcript parse and roster

Unblocks `no_economic_buyer` and `single_threaded`, which today read a table
nothing populates from transcripts.

- [ ] **2.1 Speaker-aware parse.** `services/ingest.py` — for
      `source_type='meeting_transcript'`, populate
      `document_chunks.metadata` with `{speaker, char_start, char_end}` and
      prefer splitting on speaker turns. Deterministic; no model.
      *Done when:* every chunk of a fixture transcript carries a speaker and
      offsets that resolve verbatim.

- [ ] **2.2 Roster extraction.** Distinct speaker labels → `meeting_attendees`
      rows with `raw_name`, `attended=true`, `is_internal` inferred from the
      label or left false.
      *Done when:* a fixture transcript yields one row per distinct speaker and
      a re-run inserts nothing new.

- [ ] **2.3 Entity resolution, deterministic first.** `pg_trgm` similarity of
      `raw_name` against `contacts`. Link only above a high threshold; leave
      `contact_id` NULL otherwise. **Never guess** — a wrong link silently
      corrupts every attendance-based risk, and an unresolved attendee is the
      missing-stakeholder signal.
      *Done when:* exact and near-exact names link, ambiguous ones stay NULL,
      and the migration enabling `pg_trgm` is in place.

- [ ] **2.4 LLM tiebreak on the residue only.** `openai/gpt-oss-20b`, given the
      unresolved label and the deal's candidate contacts, returns a
      `contact_id` or null. Never invents a contact.
      *Done when:* the ambiguous fixture case resolves, and a name with no
      plausible candidate returns null.

---

## Phase 3 — Extraction and Gate 0

- [ ] **3.1 `payload` schemas per `fact_type`.** `app/ai/schemas.py` — one
      Pydantic model per value of `FactType` (budget → `{amount, currency,
      basis}`, deadline → `{date, what}`, ...). These are both the structured
      output schema and what makes the literal rule checkable: you know which
      field holds the money. Strict mode needs every field `required` and
      `additionalProperties: false`, so nullable fields are `["string","null"]`
      unions rather than omitted keys (`README.md` §7).
      *Done when:* each validates a hand-written example, rejects a bad one, and
      its JSON Schema is accepted by Groq with `strict: true`.

- [ ] **3.2 The extractor.** `app/ai/extract.py` — one structured
      `openai/gpt-oss-120b` call per chunk window, run in parallel. Returns facts
      **with their spans in the same output** — `chunk_id` plus the verbatim
      `snippet`. The model never returns character offsets: Python locates the
      quote in the chunk by substring search and computes
      `char_start`/`char_end`, and a quote it cannot find dies at Gate 0. No
      tools, no retrieval.
      *Done when:* a fixture transcript yields facts whose snippets are literal
      substrings of the cited chunks, and a paraphrased snippet is rejected.

- [ ] **3.3 Gate 0.** `services/claims.py` — for each `claim_evidence` link:
      document spans matched verbatim at their offsets; `record_ref` resolved to
      a live row whose field still equals `snippet`; and the **literal rule** —
      any date or monetary amount in the claim text must appear in a cited span
      or resolved value. Writes `verification_status`. Runs *inside the insert*.
      *Done when:* a deliberately corrupted snippet yields `span_missing`, a
      mutated record yields `value_drifted`, and a fabricated date fails.

- [ ] **3.4 Zero-evidence rejection.** A claim with no surviving link is not
      written. Enforced in the service layer, not by the caller.
      *Done when:* inserting a claim with no evidence raises, and nothing lands.

- [ ] **3.5 Wire into the pipeline** as stages 2–4, writing
      `extracted_facts` (`status='pending'`), `evidence`, `claim_evidence`.
      *Done when:* one queued meeting produces pending facts visible through the
      existing API, and a re-run with the same document is a no-op.

- [ ] **3.6 Measure.** Run 1.3 against the three fixtures; record the baseline.
      *Done when:* Gate 0 pass rate and fact precision/recall are written down.

- [ ] **3.7 Convert the pipeline to a LangGraph `StateGraph`.** Design:
      `README.md` §4, *The LangGraph graph*. The payoff is stage 2's fan-out,
      which is why the conversion waits until there are real facts to merge.
      Four parts:
      (a) `PipelineState` becomes a merged state schema with
      `facts: Annotated[List[...], operator.add]` — without the reducer, N
      parallel `extract_window` nodes writing one key is an error;
      (b) stages return partial dicts instead of mutating state;
      (c) the `AsyncSession` moves from the stage signature to graph context,
      since state is merged and may be serialized;
      (d) a `plan_windows` node emitting `Send("extract_window", ...)` per
      window, and a conditional edge after `drop_unevidenced` routing to `END`
      when nothing survived.
      `retry_policy` only on `extract_window` — it writes nothing until gate 0,
      and every other stage would write twice. `compile()` with no checkpointer.
      *Done when:* the graph runs the same 13 stages with identical outcomes to
      the sequential runner, parallel windows merge into one fact list, and
      `get_graph().draw_mermaid()` reproduces the diagram in §4.

- [ ] **3.8 Usage accounting through a callback.** `_usage(raw)` sees only the
      response `client.py` holds, so a model call made inside a graph node or an
      agent loop is invisible to `AIRun` and uncharged to `RunBudget` — which
      under-counts exactly where a runaway is likeliest. Wrap runs in
      `get_usage_metadata_callback()` and charge the budget from the aggregate.
      `README.md` §7, *Governance*.
      *Done when:* a run whose model calls bypass `client.structured()` still
      charges `RunBudget`, and a deliberately uncapped loop trips
      `TokenCeilingExceeded`.

- [ ] **3.9 Expose the governor as a `BaseRateLimiter`.** Needed as soon as a
      graph node invokes a runnable directly, since `ChatGroq(rate_limiter=...)`
      is what reaches calls `client.structured()` never sees. **Only the
      request/concurrency half can move:** `BaseRateLimiter.acquire(*,
      blocking)` takes no request size, so tokens/min is not representable
      there and stays in `client.py` (`README.md` §7, *Governance*).
      *Done when:* a model call made inside a node is subject to the RPM and
      concurrency ceiling, and the TPM bucket still sees it through
      `client.py`.

---

## Phase 4 — Gate 1, the Evidence Validator

- [ ] **4.1 The validator.** `app/ai/validate.py` — one `openai/gpt-oss-120b` call
      per claim, given the claim text and **only** its cited spans. No tools,
      no transcript, no deal record. Returns
      `supported|partial|contradicted|unsupported` plus a rationale.
      *Done when:* a hand-built supported case, a partial case and a
      contradicted case each get the right verdict.

- [ ] **4.2 Persist.** Append a `claim_validations` row per run with `verdict`,
      `method='llm'`, `rationale`, `model`, `validator_version` from 0.4.
      *Done when:* two runs leave two rows, never an update.

- [ ] **4.3 Quarantine policy.** `contradicted` and `unsupported` never render;
      `partial` renders with a caution badge. Enforced in the read path so no
      future route can forget it.
      *Done when:* a contradicted fact is absent from the API response.

- [ ] **4.4 Log the pairs.** `confidence × verdict` into the metrics from 1.3.
      *Done when:* high-confidence contradicted cases are countable.

---

## Phase 5 — Meeting synthesis

- [ ] **5.1 Migration `0010_meeting_analysis_origin`.** `meetings` +
      `analysis_origin`, `confidence`, `model`; `deal_contacts` + `origin`.
      Note the two schema traps in `docs/schema/TASKS.md` — a native enum
      survives `DROP COLUMN`, and `create_check_constraint` runs names through
      the naming convention.
      *Done when:* `alembic upgrade head` then `downgrade -1` both succeed.

- [ ] **5.2 Summary from facts, not the transcript.** `app/ai/synthesize.py` —
      `openai/gpt-oss-120b` over the surviving fact set plus the attendee roster.
      ~1K input tokens, and every sentence traces to a fact that traces to a
      span.
      *Done when:* the summary asserts nothing absent from the fact set.

- [ ] **5.3 Sentiment from the transcript.** `openai/gpt-oss-20b`,
      returning a `Sentiment` value plus two or three illustrative quotes
      attached with `relevance` — explicitly outside the Gate 1 contract.
      *Done when:* `meetings.sentiment` is set and the quotes resolve verbatim.

- [ ] **5.4 Wire as stages 9–11** and set `analyzed_at`,
      `analysis_status='complete'`. A failure here leaves the facts intact and
      logs the stage error.
      *Done when:* the Meeting Analyzer projection returns a real `summary` and
      `sentiment`, and killing the process at stage 9 still leaves facts.

---

## Phase 6 — Reconciliation and supersession

- [ ] **6.1 Commitment reconciliation.** `app/ai/reconcile.py` —
      `openai/gpt-oss-120b` matches new commitment-facts against that deal's open
      `commitments`. Output is a **proposed** status change, written as a
      `recommendation`, never a direct write to `commitments.status`.
      *Done when:* the fixture's fulfilled commitment yields a proposal and an
      unrelated fact yields none.

- [ ] **6.2 Supersession.** Compare new facts against live accepted facts of the
      same `fact_type` for the deal. On contradiction: mark the old
      `superseded`, link the new evidence, **keep both**.
      *Done when:* the fixture's contradicting fact supersedes its predecessor
      and neither row is deleted.

- [ ] **6.3 Staleness (SQL).** Flag claims whose newest `evidence.occurred_at`
      predates `deals.last_activity_at`; write `stale` to
      `claim_evidence.verification_status`.
      *Done when:* an old claim on a recently-active deal reads `stale`.

---

## Phase 7 — AI risk and recommendation detection

Shadow-run before it writes anything. Step 7.4 is the dress rehearsal against
free labels and should not be skipped.

- [ ] **7.1 Migration `0011_detector_provenance`.** `risks`, `recommendations` +
      `model`, `detector_version`. Backfill existing rows with
      `detector_version='deterministic-1'` so there is a labelled "before".
      *Done when:* upgrade/downgrade both succeed and existing rows are tagged.

- [ ] **7.2 Dossier builder.** `app/ai/dossier.py` — pure Python, no model.
      Deal fields, stage history, stakeholder map with attendance counts, open
      commitments, accepted facts, meeting cadence, prior dismissals, and the
      currently-open risks. Every entry is `(handle, source_kind, ref, text)`.
      *Done when:* a unit test asserts every handle resolves to a real record or
      fact, with no API call.

- [ ] **7.3 Handle validation.** Any `evidence_ref` not in `dossier.keys()` is
      rejected before any write. This is what makes a fabricated citation
      structurally impossible.
      *Done when:* a doctored model output with an unknown ref is refused.

- [ ] **7.4 Shadow mode on the four deterministic types.** Run the detector
      call, write **nothing**, and compare against `detect.py`: recall on the
      four overlapping types, and risk-key Jaccard across two runs on an
      unchanged deal.
      *Done when:* recall and stability are recorded and meet your bar.

- [ ] **7.5 Turn on writes.** Stage D reconciliation in Python — upsert by
      `(deal_id, risk_type, risk_key)`, bump `last_seen_at`, never insert a
      duplicate, suppress anything inside a dismissal cooldown. Risk and its
      recommendation from the same call. Gate 0 and Gate 1 applied as in
      Phases 3–4.
      *Done when:* two consecutive runs on one deal leave one row per risk, and
      the six semantic types appear with surviving citations.

- [ ] **7.6 Severity policy.** Compute the band in Python for `stalled_stage`,
      `close_date_at_risk` and `missed_commitment` and clamp the model's
      proposal to it. Hysteresis: raising is immediate, lowering needs new
      evidence or N days.
      *Done when:* two runs on an unchanged deal never change a severity.

- [ ] **7.7 Migration `0012_open_risk_taxonomy`.** `risks` + `risk_key text not
      null default ''`; `RiskType.OTHER` (a CHECK swap); drop and recreate the
      partial unique index as `(deal_id, risk_type, risk_key) WHERE
      status='open'`. Dropping a CHECK by name needs raw SQL — see the trap in
      `docs/schema/TASKS.md`.
      *Done when:* the ten known types behave exactly as before, and two
      distinct `other` keys coexist on one deal.

- [ ] **7.8 Key canonicalization.** Lowercase and strip a proposed `risk_key`,
      then trigram-match it against that deal's open keys and reuse on a hit.
      *Done when:* `champion_going_quiet` and `champion_disengaged` collapse to
      one row.

- [ ] **7.9 Resolution by verdict.** Feed open risks into the dossier; require a
      per-risk `still_present|resolved|unclear`. Resolve only on a
      Gate-0-surviving `resolved` verdict, and only after two consecutive ones
      or a human confirmation. Deterministic types keep their SQL auto-resolve.
      *Done when:* a risk whose cause is gone resolves with an attached
      evidence row, and one omitted from the output is left untouched.

- [ ] **7.10 Dismissal feedback policy.** Enforce the four rules from
      `README.md` §5 in Python, not in the prompt.
      *Done when:* a recommendation dismissed as `already_handled` is not
      re-proposed inside the cooldown, and one dismissed as `bad_timing` is.

---

## Phase 8 — Meeting briefs

- [ ] **8.1 Brief generator.** `app/ai/brief.py` — one `openai/gpt-oss-120b` call over
      prefetched rows: deal, open risks, pending commitments, prior meeting
      summaries, stakeholder map. Structured into `objectives`, `key_risks`,
      `recommended_questions`, `context_summary`.
      *Done when:* a brief persists with `model` and `generated_at`.

- [ ] **8.2 Regenerate only on `force`.** `UniqueConstraint(meeting_id)` already
      enforces one per meeting.
      *Done when:* a second request returns the stored brief without a call.

---

## Phase 9 — Chat

- [ ] **9.1 Read-only tool set.** `app/ai/tools/` — the eight tools in
      `README.md` §6, each returning content **plus evidence handles**.
      *Done when:* every tool result carries a `chunk_id` + offsets or a
      `record_ref`.

- [ ] **9.2 Deal scoping in Python.** When `chat_sessions.scope='deal'`, the
      `deal_id` comes from the session row, never from a model argument.
      *Done when:* a tool call naming another deal's id is refused.

- [ ] **9.3 The loop.** LangGraph's prebuilt ReAct agent, streaming, writing
      into a `chat_messages` row created with `status='streaming'` so a refresh
      mid-answer does not lose the turn.
      *Done when:* an interrupted stream leaves a recoverable row, and the
      turn's usage covers **every** model call the agent made, not just the
      first (task 3.8).

- [ ] **9.4 Citations.** Attach `claim_evidence` with
      `claim_type='chat_message'`, and run Gate 0 over the handles the answer
      actually used.
      *Done when:* an answer renders with clickable citations and an uncited
      assertion is visibly uncited.

- [ ] **9.5 Session titles.** `openai/gpt-oss-20b` after the first turn,
      fire-and-forget.
      *Done when:* `chat_sessions.title` is populated.

---

## Phase 10 — Triggering and cadence

Events invalidate, the clock sweeps. Design: `README.md` §3, Triggers.
**10.1–10.4 need only Phase 3; 10.5 needs Phase 7.**

- [ ] **10.1 Migration `0013_analysis_triggers`.** `deals` +
      `analysis_dirty_first_at`, `analysis_dirty_last_at`,
      `analysis_dirty_reason`, `analysis_swept_at`. Partial index on
      `(analysis_dirty_last_at) WHERE analysis_dirty_first_at IS NOT NULL`, and
      one on `analysis_swept_at`. Debounce and sweep windows go in
      `app/core/config.py`, not in the SQL.
      *Done when:* upgrade and downgrade both succeed and the poll queries in
      `README.md` §3 use an index.

- [ ] **10.2 Dirty marking in the service layer.** One helper —
      `services/analysis.py::mark_dirty(deal_id, reason)` — called from the
      writes in the "Which writes matter" table. Set `first_at` only if null,
      always push `last_at`. **Not** a Postgres trigger: `services/` is already
      the choke point, and a DB trigger fires on migrations and seeders and
      cannot see `origin`.
      *Done when:* changing a deal's stage marks it dirty, editing
      `deals.description` does not, and a unit test covers each row of the table.

- [ ] **10.3 Loop guards.** Writes with `origin='ai'` and recommendation
      dismissals never mark a deal dirty. Without this the detector
      re-triggers itself.
      *Done when:* a full AI detection run leaves the deal clean, and
      dismissing a recommendation does not enqueue anything.

- [ ] **10.4 Tier 0 — eager re-verification.** On any update to a field named by
      some `evidence.record_ref`, re-resolve those links in the same
      transaction and write `value_drifted` where the value moved. No model.
      *Done when:* moving a deal from `discovery` to `negotiation` flips the
      citations on risks that cited the stage, in the same request.

- [ ] **10.5 Tier 1 — eager deterministic detection.** Call `detect.py` from the
      service layer on the tier-1 events, not only from
      `POST /deals/{id}/analysis`. Cheap and exhaustive, so it cannot flicker.
      *Done when:* completing a meeting refreshes the four SQL risks without a
      separate API call.

- [ ] **10.6 Tier 2 — the debounced AI pass.** Second poll query in the worker,
      using the debounce from `README.md` §3, with per-deal single-flight via an
      advisory lock or `FOR UPDATE SKIP LOCKED`. Clear the dirty columns and set
      `analysis_swept_at` on success.
      *Done when:* five field edits inside the debounce window produce exactly
      one AI run, and two concurrent triggers on one deal produce one run.

- [ ] **10.7 The nightly sweep.** Third poll query —
      `analysis_swept_at IS NULL OR < now() - 24h` — on the same loop. No cron,
      no scheduler, no second container.
      *Done when:* a deal untouched for a day is re-analysed, and a
      time-only risk (`missed_commitment` on a commitment that just went
      overdue) is detected with no write having occurred.

- [ ] **10.8 Bulk-import suppression.** A settings flag or context manager that
      suppresses tier 2 marking, for the seeder and any bulk import. Tiers 0 and
      1 stay on — they are cheap and deterministic.
      *Done when:* importing 200 deals enqueues zero AI runs, and the nightly
      sweep picks them up instead.

---

## Out of scope

| Item | Reason |
|---|---|
| Embeddings and similarity retrieval | `README.md` §7 — corpus too small, second vendor not earned; the column and index already exist for a later backfill |
| Cross-deal prioritization | not until single-deal detection is trusted |
| Document classification at upload | five values in a dropdown; ingest is synchronous by design |
| Chat write tools | `propose_task` at most, after the read path is trusted |
| Fine-tuning | the dismissal feedback loop covers adaptation |
| `ai_runs` table | Langfuse or LangSmith covers tracing (`docs/schema/README.md` §10) |
| LangGraph checkpointers | pipeline and chat are already durable in Postgres (`README.md` §7) |

---

## Found during implementation

- **Pydantic reserves the `model_` prefix.** `model_primary` and friends emit a
  protected-namespace warning on a class that also declares `model_config`, so
  the settings are `groq_model_primary` / `_cheap` / `_challenger`.

- **`meetings` has no error column.** A critical stage failure sets
  `analysis_status='failed'` and the reason survives only in the worker log, so
  the Analyzer screen can say *that* it failed but not *why*. Add
  `analysis_error text` to migration `0010_meeting_analysis_origin` (task 5.1).

- **The pipeline is a sequential runner, not a `StateGraph`.** All thirteen
  stages are declared with the critical/degradable split, but a graph whose
  nodes are every one a pass-through is structure with nothing flowing through
  it. Convert in Phase 3, when extraction and Gate 0 give `PipelineState` its
  first real contents.

- **Worker crash semantics chosen: hold the transaction.** The run commits at
  the end, so a crash leaves the row `queued` and self-healing — no reaper, no
  lease. The cost is that `running` is never visible to a polling UI. A
  *handled* critical-stage failure is different and is written as `failed` in a
  second transaction, because it will not succeed on retry.

- **LangChain is installed on the host venv, and it is the 0.x line.**
  `langchain` 0.3.30, `langchain-core` 0.3.86, `langchain-groq` 0.3.8,
  `langgraph` 0.6.11. Narrower a gap than 0.9 warned: `method="json_schema"`,
  `include_raw` and `reasoning_effort` are all present. Installing it also
  downgraded `async-timeout` 5.0.1 -> 4.0.3, which the app tolerates.

- **0.3.8 cannot request Groq's `strict` mode**, so the host venv gets
  best-effort structured output rather than constrained decoding: it builds
  `response_format` without `"strict": true` and exposes no parameter to add
  it. `client.py` probes `with_structured_output` for the argument and passes it
  only where present, so the container is guaranteed and the host is not. The
  consequence to remember when reading extraction results locally: **the
  Pydantic validation is the only guarantee there**, and a schema-shaped
  response is not assured. `README.md` §7 has the table.

- **~~`pytest` is not installed.~~** Done in 1.3: `pytest` + `pytest-asyncio`,
  `backend/pytest.ini` (`pythonpath = .`, `asyncio_mode = auto`), and the Phase
  0 database checks absorbed into `test_worker.py` / `test_activity.py`.

- **The engine must be disposed between tests.** `app.db.session.engine` is a
  module-level singleton whose pool binds each asyncpg connection to the loop
  that first used it, and pytest-asyncio gives every test its own loop — so a
  reused pooled connection raises "attached to a different loop". An autouse
  fixture in `conftest.py` disposes it per test. Same trap made `TestClient`
  unusable for the HTTP checks, which is why those run against a real uvicorn
  subprocess.

- **Chunk overlap means a snippet can be citable from two chunks.** `s7`
  appears in two, because `chunk_overlap_chars` is 150. Either citation passes
  Gate 0; `resolve_labels.py` records the lowest `chunk_index` so the label is
  deterministic, and counts the rest in `appears_in_chunks`. It also detects the
  case that would matter — a snippet present in the file but in **no** single
  chunk, which no extractor could cite within one window. None of the 26 hit
  it, but the check stays.
