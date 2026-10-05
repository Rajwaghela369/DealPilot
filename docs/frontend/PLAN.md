# Frontend plan

The backend is 71 operations across 40 paths and no frontend consumer. This
file is the build plan: one phase per root page, plus two phases for the parts
that are not pages.

Read alongside [`docs/api/README.md`](../api/README.md) for the HTTP
conventions and [`docs/ai/README.md`](../ai/README.md) for what the model layer
produces.

## This is an MVP. Build it accordingly.

Every phase below is scoped to the smallest thing that is **honest and
usable**, and the plan should be read as a ceiling rather than a floor: if a
task can be finished more simply than it is written here, finish it more
simply.

What that means in practice:

- **Single user, no auth, no CRM integration.** No roles, no permissions, no
  sharing, no invitations, no audit trail of who did what -- there is one
  person and no `users` table, deliberately (`docs/ai/README.md` section 6).
- **Libraries are allowed where they earn their place.** A component library,
  a charting library, an animation library, a form library -- reach for any of
  them when a phase is genuinely better for it. The default is still the seven
  primitives plus plain CSS, because that covers all twelve phases and every
  dependency is one more thing to keep working. So the test is not "is this
  forbidden" but "is this doing more work than it costs". Two practical notes:
  prefer one library that owns a concern over three that overlap, and if a
  component library goes in, let it set the look rather than fighting it with
  overrides.
- **Allowed, but nothing below depends on them.** Dark mode, theming, i18n,
  responsive layouts below tablet, keyboard shortcuts, drag and drop,
  virtualised lists, optimistic rendering, offline support, bulk actions,
  export and print, saved views, onboarding tours, richer loading states. Add
  any of them where it makes a screen better. None is a prerequisite for any
  phase, so none should block one, and a phase is finishable without them.
- **Elegance here means restraint,** not polish applied afterwards: consistent
  spacing, one type scale, one accent colour, real empty states, and errors
  that say what happened. That holds whatever is installed -- a component
  library makes consistency cheaper, not automatic. A screen that does four
  things well beats one that gestures at twelve.
- **Correctness is the exception to all of the above.** The evidence drawer
  (phase 5), the refusal messages (4.2), and never presenting a self-reported
  `confidence` as a validation verdict (5.6) are **not** polish and do not get
  deferred. The product's entire claim is that nothing is asserted without a
  link back to what backs it; a UI that breaks that is not a smaller product,
  it is a different and dishonest one.

Where a phase hits missing backend work, prefer **shipping the smaller honest
version** over waiting -- phase 9 (facts, read-only) is the worked example.
Label it for what it is and move on.

## The thesis, in UI terms

> Nothing the system asserts about a deal may exist without a link back to the
> record or the transcript span that backs it.

Every model-written row -- risk, recommendation, fact, commitment -- carries
evidence, and three endpoints expose it. **If a card can be rendered without a
path to its evidence, the UI has broken the product.** That is why the evidence
drawer is its own phase and lands before the pages that assert anything.

## Decisions taken

| | |
| --- | --- |
| Router | `react-router` v7. The deal workspace is seven nested routes; nesting is what it is for, and real URLs mean a citation can be linked to. |
| Data layer | TanStack Query. Server-side pagination, mutations that must invalidate lists, and a worker writing rows behind the UI's back -- hand-rolling that is most of the work. |
| Auth | **Removed.** Delete `AuthForm.tsx`, `AuthContext.tsx`; rewrite `lib/api.ts`. Keep `Sidebar.tsx`, `MainLayout.tsx`, `Layout.css`. |
| Styling | Plain CSS with custom properties, extending `Layout.css`, as the starting point -- six or seven primitives cover every screen below. A component library is permitted if it pays for itself; pick it in phase 0 rather than phase 6, because swapping one in later means rewriting every screen already built. |
| Component library | **Decided in phase 0: none.** `index.css` and `Layout.css` already define a coherent dark theme, and the plan's own rule is that a library should set the look rather than be overridden -- which against an existing theme means discarding this one or fighting the library on every screen. Neither pays for itself across eight primitives that are each under forty lines of CSS. Still open, and neither is a look-and-feel concern: a charting library in phase 12, and virtualisation if a table outgrows a page. |

## Build order, and why it is not nav order

Dependency order, not sidebar order:

```
0  Foundation         nothing works without it
1  Accounts           a fresh install cannot create a deal without one
2  Pipeline           proves the transport end to end on a real table
3  Deal workspace     the shell the next six phases mount into
4  Documents          upload already works; gives later pages something to cite
5  Evidence drawer    shared by 6, 9 and 10 -- before them, not inside one
6  Risks              the product
7  Meetings           brief + analysis + attendee resolution
8  People             stakeholders and the untracked-attendee roll-up
9  Facts              read-only (see Pending backend)
10 Chat               deal-scoped and global
11 Tasks              a flat table, no dependencies
12 Dashboard          last: it summarises what 1-11 establish
```

## Route map

```
/                         Dashboard                       phase 12
/deals                    Pipeline table                  phase 2
/deals/:dealId            Deal workspace                  phase 3
    overview                                              phase 3
    risks                                                 phase 6
    meetings                                              phase 7
      :meetingId                                          phase 7
    people                                                phase 8
    documents                                             phase 4
    facts                                                 phase 9
    chat                                                  phase 10
/tasks                    Task table                      phase 11
/accounts                 Accounts                        phase 1
/accounts/:accountId      Account + contacts              phase 1
/chat                     Global assistant                phase 10
```

---

# Phase 0 -- Foundation

**Goal.** A router, a transport that matches this backend, a cache, and enough
CSS vocabulary that no later phase invents its own button.

**Structure.** `Sidebar` and `MainLayout` survive; `MainLayout` swaps its
`useState<TabKey>` for an `<Outlet/>` and the sidebar's tabs become `NavLink`s.

```
src/
  main.tsx              RouterProvider + QueryClientProvider
  routes.tsx            the route tree, one place
  lib/
    api.ts              rewritten: no credentials, no refresh, no 401 retry
    queries.ts          query keys + typed fetchers
  components/
    MainLayout.tsx      sidebar + <Outlet/>
    Sidebar.tsx         NavLink per root page
    ui/                 Button Card Table Badge Drawer Field EmptyState Spinner
  styles/
    tokens.css          colour, space, radius, type scale
```

**Features.** Route-level error and loading boundaries. One `ApiError` carrying
`status` and `detail`. A single toast for mutation failures.

**API routes.** `GET /health` for a boot check. No others.

**Pending backend.** None.

### Tasks

- [x] **0.1 Strip auth.** Delete `src/components/AuthForm.tsx` and
      `src/context/AuthContext.tsx`. `lib/api.ts` keeps `ApiError` and the
      `apiJson` shape and loses `credentials: 'include'`, `tryRefresh` and the
      401 retry -- this backend has no `/auth/*` and returns no 401s.
- [x] **0.2 Install** `react-router`, `@tanstack/react-query`.
- [x] **0.3 `routes.tsx`.** The tree above, with `/deals/:dealId` as a layout
      route. Index redirect `/deals/:dealId` -> `overview`.
- [x] **0.4 `MainLayout` renders `<Outlet/>`.** Sidebar entries become
      `NavLink`, so the active tab comes from the URL and not from state.
- [x] **0.5 QueryClient.** `staleTime` ~30s. One `queryKey` convention:
      `['deals', dealId, 'risks', filters]`.
- [x] **0.6 `tokens.css` + `ui/` primitives.** Button, Card, Table, Badge,
      Drawer, Field, EmptyState, Spinner. Add more only when a page needs one.
      **If a component library is going to be used, decide here** -- it
      replaces most of this task, and choosing it after a few phases are built
      means rewriting them.
- [x] **0.7 Error + empty states as components,** not per-page markup. Every
      list in this app can be empty on a fresh install.
- [x] **0.8 `vite.config.ts`** already proxies `/api` -- confirm, do not change.

---

# Phase 1 -- Accounts and contacts

**Goal.** Make a fresh install usable. This is the bootstrap screen, not a CRM:
`DealCreate` requires an `account_id` and `DealStakeholderCreate` an existing
`contact_id`, and until this page exists the only way to mint either is psql.

**Structure.** `/accounts` is a paginated table (name, industry, region, deal
count, contact count). `/accounts/:accountId` is the account's fields above its
contact list.

**Features.** Create and edit an account. Create, edit and delete a contact.
Deleting an account with deals is refused -- surface the 409 as a sentence, not
a toast. `email` is optional, because the transcript-resolution path creates
contacts from a spoken name alone; a duplicate email returns 409 naming the
existing contact, and the useful UI is a link to it.

**API routes.**

```
GET    /accounts                                   paginated
POST   /accounts
GET    /accounts/{id}
PATCH  /accounts/{id}
DELETE /accounts/{id}                              409 when it has deals
GET    /accounts/{id}/contacts                     bare array
POST   /accounts/{id}/contacts
GET    /accounts/{id}/contacts/{contact_id}
PATCH  /accounts/{id}/contacts/{contact_id}
DELETE /accounts/{id}/contacts/{contact_id}        204; unresolves attendees
```

**Pending backend.** None. This is the only fully-covered area in the test
suite, so the contract is trustworthy here.

### Tasks

- [x] **1.1 Accounts table** with `?limit`/`?offset` and `?q`.
- [x] **1.2 Create and edit forms.** `name` is required and `min_length=1`, so
      a rename to empty is a 422 -- validate before sending.
- [x] **1.3 Account detail** with its contacts.
- [x] **1.4 Contact create/edit/delete.** No `email` required.
- [x] **1.5 Render the two 409s properly:** account-with-deals, and
      duplicate-email (link to the contact named in `detail`).
- [x] **1.6 Say what deleting a contact does.** `meeting_attendees.contact_id`
      goes NULL and the attendee row survives, by design -- the row records
      that a name spoke in a transcript, which stays true. The confirm dialog
      should say so.

---

# Phase 2 -- Pipeline

**Goal.** The deal list, filtered and paged. The first screen that proves the
transport, the cache and pagination against a real table.

**Structure.** One table: name, account, stage, value, expected close,
last activity, next action. Filter bar above it, pager below.

**Features.** Filters (`q`, `stage`, `stalled`, and the rest of `DealFilters`),
pagination, create a deal, row click into the workspace. Stage as a `Badge`.

**API routes.**

```
GET  /deals            paginated; Page{items,total,limit,offset}
POST /deals            requires account_id (phase 1)
```

**Pending backend.** None.

### Tasks

- [x] **2.1 Table + pager.** `total` counts before the window, so page numbers
      come from one request.
- [x] **2.2 Filter bar bound to `DealFilters`.** A misspelled param is a **422
      naming the field**, not a silently unfiltered list -- surface it rather
      than swallowing it. That 422 is deliberate (`extra="forbid"`).
- [x] **2.3 Create-deal form.** Account picker reads phase 1.
- [x] **2.4 Empty state** for a fresh install, pointing at Accounts.

---

# Phase 3 -- Deal workspace shell and Overview

**Goal.** The container for everything deal-scoped, plus the summary tab. Seven
sub-pages share one header, so the header loads once and the tabs do not
refetch the deal.

**Structure.**

```
+-----------------------------------------------------------+
| Northwind - SecureFlow        [discovery]  $180,000        |
| close 2026-10-15 - last activity 0 days ago   [Analyse]    |
+-----------------------------------------------------------+
| Overview  Risks  Meetings  People  Documents  Facts  Chat  |
+-----------------------------------------------------------+
|  <Outlet/>                                                 |
+-----------------------------------------------------------+
```

**Features.** Deal header from one fetch, shared by every tab. Edit deal
fields. Stage history as a simple vertical list. A "Run analysis" action that
marks the deal dirty, plus the analysis state so the UI can say *queued* or
*last swept 3 hours ago*.

**API routes.**

```
GET   /deals/{id}
PATCH /deals/{id}
GET   /deals/{id}/stage-history        bare array, unpaginated
GET   /deals/{id}/analysis             analysis state
POST  /deals/{id}/analysis             marks dirty; the worker consumes it
```

**Pending backend.** `GET /deals/{id}/timeline` **does not exist.** The chat
agent has a `get_timeline` tool but nothing exposes it over REST -- `activities`
was dropped in migration `0007` because the timeline is derived. A timeline UI
needs a new endpoint; it is not in this plan.

### Tasks

- [x] **3.1 Layout route** at `/deals/:dealId` fetching the deal once.
- [x] **3.2 Sub-nav** as `NavLink`s; index redirects to `overview`.
- [x] **3.3 Overview panel** -- fields, inline edit via `PATCH`.
- [x] **3.4 Stage history list.**
- [x] **3.5 Analyse button + state.** `POST` only marks the deal dirty; the
      worker picks it up on a 2s poll and sweeps each deal at most once per
      24h. So the button means *queued*, never *done* -- label it that way and
      poll `GET /deals/{id}/analysis`.
- [x] **3.6 Show when the worker is off.** `GET /system/ai-status`. If it is
      not running, "Analyse" queues something nothing will consume, and the UI
      should say so rather than appear broken.

---

# Phase 4 -- Documents

**Goal.** Get evidence into the system. Everything the AI layer says is
ultimately grounded in `document_chunks`, so this phase is upstream of the
interesting ones.

**Structure.** Upload card above a table: filename, source type, occurred at,
size, chunk count, preview link.

**Features.** Upload with a required `source_type`. Preview in a new tab.
Delete. Chunk count per document, because a document with zero chunks can
carry no citation -- the API refuses to create one, and showing the count makes
that visible.

**API routes.**

```
GET    /deals/{id}/documents        bare array, NOT paginated
POST   /deals/{id}/documents        multipart/form-data
GET    /documents/{document_id}
DELETE /documents/{document_id}
GET    /documents/{document_id}/preview     302 -> presigned URL
GET    /chunks/{chunk_id}                   used by phase 5
```

**Upload contract, exactly.** `multipart/form-data` with `file`, a **required**
`source_type` form field (`meeting_transcript` | `email` | `proposal` |
`contract` | `note`), and optional `title` / `occurred_at`. Supported today:
`.txt .md .markdown .csv .json .vtt .srt .pdf .docx`. Max 25 MiB.

Four refusals the UI must render as readable sentences, not "Request failed":

| | |
| --- | --- |
| `415` | unsupported type -- the message lists what works |
| `415` | a PDF with no text layer ("it looks scanned") -- OCR is deliberately not supported |
| `415` | legacy `.doc` -- the message says to re-save as `.docx` |
| `422` | the file is readable but empty |

Two more refusals than the four above, found in `services/ingest.py` and
verified live: **413** when the file exceeds `max_upload_bytes`, and **502**
when object storage is unreachable (nothing is saved, so retrying is safe).
The 415 row also covers a damaged PDF/docx and a non-UTF-8 text file. Mapping
by status rather than by message is what makes the set complete.

**Upload is idempotent, and the status code is how you can tell.** `documents`
carries `UNIQUE(content_hash)`, so re-uploading the same bytes answers **200
with the existing document** rather than 201. Not an error case -- but a UI
that reported "uploaded" for a 200 would be claiming a second copy exists, so
the client surfaces the distinction. Verified: the same bytes under a
different filename return the original document's id.

**Pending backend.** Upload is synchronous and parses inside the request, so a
large PDF blocks. There is no `documents.status` and no 202-and-poll path, on
purpose. Fine at 25 MiB; revisit only if the limit rises.

**Broken backend: `source_type=meeting_transcript` returns 500.** Every other
source type uploads cleanly. `upload_document` calls
`activity.touch_deal`, whose ORM `UPDATE` expires `deal.last_activity_at` on
the in-session `Deal`; it then calls `analysis_service.record_change` ->
`detect_service.run` -> `_gone_quiet`, which reads that expired attribute and
triggers a lazy refresh outside the greenlet --
`sqlalchemy.exc.MissingGreenlet`. Only this path chains those two calls on one
`Deal` object, which is why nothing else hits it. A `db.refresh(deal)` between
them, or passing the known value through, is the fix. **This blocks task 7.7**
and the main point of phase 4: the transcript is what makes a meeting
analysable.

### Tasks

- [x] **4.1 Upload control** with the `source_type` select. It is required --
      omitting it is a 422 that reads like a bug.
- [x] **4.2 Map all four refusals** to the API's own `detail` string. The
      backend writes actionable messages; do not replace them.
- [x] **4.3 Document table** with `chunk_count`.
- [x] **4.4 Preview** -- follow the 302; it is a short-lived presigned URL
      signed for the browser's host, so fetch a fresh one per view and never
      cache it.
- [x] **4.5 Delete** with confirmation.
- [x] **4.6 Accept a bare array.** This endpoint has no `Page` envelope.

---

# Phase 5 -- Evidence drawer

**Goal.** One component that answers "why does the system believe this?",
shared by risks, recommendations, facts and chat citations. **The single most
important component in the app.**

**Structure.** A right-hand drawer over the current page. Per evidence row: the
source (meeting, document, record), the quoted span, and a link to the document
preview. Nothing else.

**Features.** Open from any card. Resolve a chat citation handle to its chunk
text. Say plainly when a claim's evidence has gone stale -- Gate 2 marks a claim
`stale` when its newest evidence predates the deal's last activity, and a
grounded claim that is no longer current is a different thing from a wrong one.

**API routes.**

```
GET /deals/{id}/risks/{risk_id}/evidence
GET /deals/{id}/recommendations/{rec_id}/evidence
GET /chunks/{chunk_id}                       resolve a citation handle
GET /documents/{document_id}/preview         "open the source"
```

**Two naming corrections, both verified against the schema.**

*Task 5.5.* `rejected` is not a `verification_status`. That enum is
`unverified | verified | span_missing | value_drifted | stale`, and `rejected`
is a `facts.status` -- a human Gate 3 decision, phase 9. The states that mean
"the source no longer supports this" are **`span_missing`** and
**`value_drifted`**, and those are what must not share a colour with `stale`.
Implemented as: `stale` amber ("was verified, then the deal moved on -- still
grounded, possibly overtaken"), the other two red ("nothing currently backs
this"), `unverified` neutral because *not yet checked* is not a verdict and
most deterministic `record` evidence sits there permanently.

*Task 5.6.* `claim_validations` is **not exposed over HTTP at all** -- no
schema, no route. So there is no verdict available to render, which makes
showing `confidence` as one easier rather than harder. The drawer therefore
renders no confidence number at all; the only trust signal in it is
`verification_status`, which is a real machine check.

**Evidence offsets are chunk-relative.** `EvidenceItem.char_start/char_end`
index into the *chunk's* `content`, not the document's -- verified live, where
a span at 103-152 satisfies `content.slice(103,152) === snippet` exactly.
`ChunkDetail.metadata` carries a second, document-level pair; using those to
highlight would mark the wrong text. The drawer re-checks the slice at render
and distinguishes three outcomes: exact, drifted-but-present, and absent --
the last being Gate 0's `span_missing`, shown as such rather than papered over.

**Pending backend.** None.

### Tasks

- [x] **5.1 `Drawer` primitive** (phase 0) + `EvidenceList`.
- [x] **5.2 Render a `claim_evidence` row:** source kind, span, quote.
- [x] **5.3 Chunk resolution** by id, for chat handles.
- [x] **5.4 "Open source document"** link.
- [x] **5.5 Distinguish `stale` from `rejected`.** They are different states
      and must not share a colour.
- [x] **5.6 Confidence is self-reported.** `confidence` is the generator's own
      guess, not a validation result; verdicts live in `claim_validations`.
      Never render one as the other -- if that is hard to show honestly, show
      neither.

---

# Phase 6 -- Risks and recommendations

**Goal.** The product. Everything before this was plumbing to make this screen
trustworthy.

**Structure.** Two stacked sections: open risks, then recommendations awaiting a
decision. Each card: title, severity badge, description, an evidence button
(phase 5), and the decision controls.

**Features.** Accept a recommendation (creating a task) or dismiss it with a
reason. Change a risk's status. Severity and priority as badges. Risks carry a
`risk_key` when `risk_type` is `other`, so a model-named risk renders like any
other. **Nothing here changes a row without a human pressing something** --
`risk -> recommendation -> [human accepts] -> task` is the product.

**API routes.**

```
GET  /deals/{id}/risks                         bare array, <= ~10 rows
GET  /deals/{id}/risks/{risk_id}
PATCH /deals/{id}/risks/{risk_id}
GET  /deals/{id}/risks/{risk_id}/evidence
GET  /deals/{id}/recommendations
GET  /deals/{id}/recommendations/{rec_id}
POST /deals/{id}/recommendations/{rec_id}/accept     -> creates a task
POST /deals/{id}/recommendations/{rec_id}/dismiss    -> needs a reason
GET  /deals/{id}/recommendations/{rec_id}/evidence
```

**`risk_key` is not exposed.** The Features note above says a model-named
risk (`risk_type = 'other'`) carries a `risk_key` so it renders like any
other. The column exists, but no response schema returns it -- so the
model-written `title` is what identifies such a risk, which reads fine. The
card labels the type "model-named" rather than "Other".

**Response enums are typed by how stable they are,** following the schema's
own storage choice (`app/models/enums.py`): native Postgres enums for sets
that will not churn (`severity`, `priority`, `risk_status`,
`recommendation_status`) get closed TypeScript unions, while the
`text + CHECK` vocabularies that *will* churn as prompts are tuned
(`risk_type`, `action_type`, `dismissal_reason`) stay `string` on responses. A
new `action_type` should render as an unknown-but-harmless label, not break
the build. Request bodies use the closed unions either way, mirroring the
backend typing its request models with the enums.

**Both 409s are real and neither is retryable.** Accepting twice answers 409
naming the task it already created ("edit that task rather than accepting
again"); dismissing something already accepted answers 409 saying to cancel
that task instead. Shown verbatim in the dialog with the submit button
removed -- offering "Accept" under a message saying it is already accepted
would be absurd.

**Pending backend.** None.

### Tasks

- [x] **6.1 Risk list,** severity-ordered, with evidence buttons.
- [x] **6.2 Recommendation cards** with Accept / Dismiss.
- [x] **6.3 Dismiss dialog** carrying `dismissal_reason`. The value feeds the
      detector's suppression logic, so it is a real input and not telemetry.
      **There are five reasons, not three:** `already_handled` |
      `not_relevant` | `wrong` | `bad_timing` | `other`, all accepted by the
      API (verified live). Offering only the first three would push "revisit
      after the security review" into `not_relevant`, which asserts the
      opposite of what it means -- and since these counts drive suppression,
      that misinforms the detector rather than just mislabelling a row. No
      reason is preselected: a default is a reason nobody chose.
- [x] **6.4 Accept** -- invalidate both the recommendation list and
      `['tasks']`, since accepting writes a task.
- [x] **6.5 Risk status edit** via `PATCH`.
- [x] **6.6 `correct_record` reads differently.** Every other `action_type`
      names an action to take; this one is a claim that a row is wrong. Render
      it as "review this record", not as a to-do.
- [x] **6.7 Empty state that is not a failure.** No risks on a healthy deal is
      good news, and the deterministic detector produces risks with no model
      calls at all -- so an empty list never means "AI is off".

---

# Phase 7 -- Meetings

**Goal.** The meeting track, its brief, and the attendee resolution that feeds
the stakeholder map.

**Structure.** `/meetings` is a list (title, type, scheduled, analysis status).
`/meetings/:meetingId` has three panels: details, brief, attendees.

**Features.** Create and edit a meeting. Generate a brief (cached -- a second
request returns the stored one; `force` replaces it). Trigger analysis and show
its state. Resolve an attendee to a contact, or create a contact from a spoken
name.

**API routes.**

```
GET    /deals/{id}/meetings                              bare array
POST   /deals/{id}/meetings
GET    /deals/{id}/meetings/{mid}
PATCH  /deals/{id}/meetings/{mid}
DELETE /deals/{id}/meetings/{mid}
GET    /deals/{id}/meetings/{mid}/brief
POST   /deals/{id}/meetings/{mid}/brief                  generate; force to replace
GET    /deals/{id}/meetings/{mid}/analysis               status
POST   /deals/{id}/meetings/{mid}/analysis               queue
GET    /deals/{id}/meetings/{mid}/attendees
POST   /deals/{id}/meetings/{mid}/attendees
PATCH  /deals/{id}/meetings/{mid}/attendees/{aid}
DELETE /deals/{id}/meetings/{mid}/attendees/{aid}
POST   /deals/{id}/meetings/{mid}/attendees/{aid}/resolve
```

**Pending backend.** Analysis is queued, not awaited, and a run that fails a
critical stage is recorded `failed` and not retried. The UI needs a visible
`failed` state with the reason, or a stuck meeting looks like a slow one.

Four contract details, verified live:

- **`GET .../brief` answers 404 when no brief exists,** and that is the normal
  state of most meetings rather than an error. Caught and rendered as an empty
  state with a generate button; letting it reach `ErrorState` would put a red
  panel on every un-briefed meeting.
- **`analysis_error` is set on `complete` runs too,** not only failed ones -- a
  meeting whose summary stage died still has its facts. So it is rendered
  independently of the status, because keying it to `failed` would make a
  degraded run read as clean.
- **`POST .../analysis` answers 202,** and 409 when already `complete` without
  `force`. A `failed` meeting needs no `force`, so the button says "Re-run"
  for both but only passes the flag when complete.
- **`POST .../brief` answers 503 when the AI layer is disabled.** One of the
  few places a model outage surfaces as a status code rather than inside a 200.
  Unlike the risk detector there is no deterministic fallback, so the button
  is disabled rather than left to fail.

The route module's own comment claiming *"no worker consumes that queue"* is
**stale**: `worker.py` has `poll_queued_meetings` and `run_meeting_analysis`,
so queued meetings genuinely are drained.

### Tasks

- [x] **7.1 Meeting list + create.**
- [x] **7.2 Meeting detail** with the three panels.
- [x] **7.3 Brief panel.** `GET` first; `POST` only when absent. Make
      regenerate explicit -- it replaces the stored brief.
- [x] **7.4 Analysis status,** including `failed` with its reason.
- [x] **7.5 Attendee list** with resolved / unresolved clearly separated.
- [x] **7.6 Resolve flow** -- pick an existing contact or create one from
      `raw_name`. This is the main way contacts get created in practice.
- [x] **7.7 Transcript upload** points at phase 4 with
      `source_type=meeting_transcript`, which is what makes a meeting
      analysable.

---

# Phase 8 -- People

**Goal.** Who is on this deal, and -- more useful -- who is in the room and
not tracked. The participants roll-up is one of two features that deliver real
value with **zero model calls**.

**Structure.** Stakeholders table, then "In meetings but not tracked" below it,
each row with an "Add as stakeholder" action.

**Features.** Add, edit and remove a stakeholder (buying role, influence,
sentiment). Promote an untracked participant. Show meeting attendance count,
which is what makes `single_threaded` and `no_economic_buyer` legible.

**API routes.**

```
GET    /deals/{id}/stakeholders          bare array
POST   /deals/{id}/stakeholders          needs an existing contact_id
PATCH  /deals/{id}/stakeholders/{cid}
DELETE /deals/{id}/stakeholders/{cid}
GET    /deals/{id}/participants          the untracked roll-up
```

**Pending backend.** `deal_contacts` has no `origin` column, so once both a
human and the analyzer can write `buying_role` or `sentiment` there is no way
to tell which did. Do not label these values as either until it exists.

### Tasks

- [ ] **8.1 Stakeholder table** with role, influence, sentiment.
- [ ] **8.2 Add via contact picker** (phase 1).
- [ ] **8.3 Edit and remove.**
- [ ] **8.4 Participants section** with attendance counts.
- [ ] **8.5 "Add as stakeholder"** inline from a participant row.

---

# Phase 9 -- Facts

**Goal.** Show what extraction found and what each fact is grounded in.

**Structure.** A filterable table: type, content, status, confidence, source
meeting, evidence button.

**Features.** Filter by `fact_type` and `status`. Evidence per fact.
`superseded` rows stay visible with their replacement, because contradiction
must never overwrite -- both rows keep their evidence.

**API routes.**

```
GET /deals/{id}/facts        bare array; GET only
```

**Pending backend -- read this before designing the page.** Facts are
**read-only over HTTP.** The schema documents Gate 3 as *"a human accepting a
fact creates the commitments/tasks row"*, recorded in `promoted_to_type` /
`promoted_to_id` -- but **no endpoint does it.** So this page can display,
filter and explain; it cannot be the review queue the design intends.

Two options, and the choice belongs to whoever starts this phase:

1. Ship it read-only, labelled as a view. Honest, and unblocks the phase.
2. Add `PATCH /deals/{id}/facts/{fact_id}` (accept / reject) plus the promotion
   service first, then build the queue. Backend work, not frontend.

`?include_quarantined` is also missing, so quarantined facts cannot be shown
at all.

### Tasks

- [ ] **9.1 Decide read-only vs. add the endpoint.** Do not start the UI first.
- [ ] **9.2 Fact table** with type and status filters.
- [ ] **9.3 Evidence button** (phase 5).
- [ ] **9.4 Render `superseded` beside what replaced it,** not hidden.
- [ ] **9.5 Do not render `confidence` as a verdict.** See 5.6.

---

# Phase 10 -- Chat

**Goal.** Ask questions about a deal and get cited answers. Nine tools back it;
one of them searches documents.

**Structure.** Session list beside a message thread with a composer. Mounted
twice: `/deals/:dealId/chat` (deal scope) and `/chat` (global).

**Features.** Streaming answers. Sessions with auto-titles. Citation handles in
the response resolve through the evidence drawer. Delete and rename sessions.

**API routes.**

```
GET    /chat/sessions
POST   /chat/sessions          {scope: "deal", deal_id} | {scope: "global"}
GET    /chat/sessions/{sid}
PATCH  /chat/sessions/{sid}
DELETE /chat/sessions/{sid}
GET    /chat/sessions/{sid}/messages
POST   /chat/sessions/{sid}/messages      Server-Sent Events
```

**The transport, exactly.** `POST .../messages` returns an SSE stream:

```
data: {"type": "delta", "content": "..."}        many
data: {"type": "error", "detail": "..."}          provider failure
data: {"type": "done",  "message_id": "..."}      terminal
```

**A provider failure arrives inside an HTTP 200.** The status code says nothing;
the client must read the stream. Groq returns 503 under load often enough that
this is the normal path, not an edge case.

`scope` is required and must agree with `deal_id` -- deal scope requires one,
global scope forbids it, and a mismatch is a 422.

**Pending backend.** `chat_messages` is ordered by `created_at` alone, which is
non-deterministic for rows sharing a timestamp. Two messages can swap order
between reads.

### Tasks

- [ ] **10.1 Session list + create,** with the `scope` rule encoded so a
      mismatch cannot be sent.
- [ ] **10.2 SSE consumption.** `fetch` + `ReadableStream`, not `EventSource` --
      this is a POST and `EventSource` cannot do POST.
- [ ] **10.3 Handle `error` inside a 200.** Render it in the thread.
- [ ] **10.4 Append on `done` using `message_id`;** reconcile with the
      optimistic bubble.
- [ ] **10.5 Citation handles** -> evidence drawer (phase 5).
- [ ] **10.6 Rename and delete sessions.**
- [ ] **10.7 Disable the composer when `ai-status` says disabled,** rather than
      letting every message fail.

---

# Phase 11 -- Tasks

**Goal.** One table of work across the whole pipeline, including tasks created
by accepting a recommendation.

**Structure.** A paginated table: title, deal, due date, priority, status.

**Features.** Filters, pagination, create, edit, complete, delete. Show the
source deal, and whether a task came from an accepted recommendation -- that
link is the payoff of phase 6.

**API routes.**

```
GET    /tasks            paginated
POST   /tasks
GET    /tasks/{task_id}
PATCH  /tasks/{task_id}
DELETE /tasks/{task_id}
```

**Pending backend.** None.

### Tasks

- [ ] **11.1 Table + pager + filters.**
- [ ] **11.2 Create and edit.**
- [ ] **11.3 Complete inline.**
- [ ] **11.4 Link to the originating deal.**
- [ ] **11.5 Show provenance** where a task came from a recommendation.

---

# Phase 12 -- Dashboard

**Goal.** Where attention is needed, across deals. Built last because every
number on it is established by an earlier phase.

**Structure.** A small grid: pipeline by stage, deals needing attention, tasks
due, AI status.

**Features.** Counts and the few rows worth surfacing. A stacked bar made of
divs is enough for pipeline-by-stage and will outlive a dependency, so start
there; a charting library is fair game if the dashboard grows past it.

**API routes.**

```
GET /deals             with filters, for the counts
GET /tasks             due soon
GET /system/ai-status  worker and provider state
```

**Pending backend.** There is no aggregate endpoint. Every figure here is
client-side arithmetic over list responses, which is fine at MVP volume and
will not be at scale. If the dashboard needs more than four numbers, ask for an
endpoint instead of fetching more pages.

### Tasks

- [ ] **12.1 Pipeline-by-stage** from a filtered `/deals`.
- [ ] **12.2 "Needs attention"** -- stalled, close date at risk.
- [ ] **12.3 Tasks due soon.**
- [ ] **12.4 AI status card** -- worker running, provider reachable, queue
      depth.
- [ ] **12.5 Replace the placeholder** `MainLayout` content.

---

# API conventions that will bite

Learned by testing the running backend, not by reading the code.

1. **Two envelope shapes.** `/accounts`, `/deals`, `/tasks` return
   `Page{items,total,limit,offset}`. Every deal sub-resource returns a **bare
   array**. Two client patterns; do not write one and assume.
2. **`?limit` / `?offset` work only on the three paginated endpoints.** They
   are fields on those filter models. Sending `?limit=` to an unpaginated
   endpoint is a **422** -- deliberate, because accepting a window it would not
   apply is a lie.
3. **A misspelled query parameter is a 422 naming the field**, never a silently
   unfiltered list (`extra="forbid"`). Surface it; it is the backend doing its
   job.
4. **OpenAPI describes filters as one `$ref` parameter,** not named query
   params, so **generated clients will serialise them wrongly.** Write the
   client by hand, or fix the schema first. There is no codegen step today.
5. **Chat errors arrive inside an HTTP 200** as an SSE event. See phase 10.
6. **`/documents/{id}/preview` is a 302** to a short-lived presigned URL signed
   for the browser's host. Fetch per view; never cache.
7. **Datetimes are timezone-aware with `Z`.** Verified across payloads.
8. **No auth, no 401s.** Single user. Do not reintroduce a token layer.
9. **The worker must be running** for AI features. It polls every 2s and sweeps
   each deal at most once per 24h.
10. **`POST /deals/{id}/analysis` runs the detector synchronously** -- it does
    *not* mark the deal dirty and return. `run_detection` calls
    `detect_service.run` inline, commits, and answers with
    `{risks_detected, recommendations_written, risks_auto_resolved}`. Six of
    the ten risk types are joins over existing tables and need no model call,
    so the work completes inside the request. Verified against the running
    backend. The dirty/debounce path is real but is what `GET .../analysis`
    reports on, and the worker owns it -- so the button means *done*, and
    labelling it *queued* would be its own kind of dishonest.
11. **Convention #2 is not enforced everywhere.** `?limit=` on
    `GET /deals/{id}/stage-history` returns 200 and silently ignores the
    window rather than 422 -- that endpoint's filter model does not inherit
    `ListQuery` and declares no extras to forbid. Harmless today because no
    client sends it, but it is the lie convention #2 exists to prevent.

# Pending backend work, collected

Tracked here so no frontend phase silently waits on one.

| | Blocks | |
| --- | --- | --- |
| Fact accept/reject + promotion (Gate 3) | 9 | No endpoint exists. Decide read-only or build it. |
| `?include_quarantined` on facts | 9 | Quarantined facts cannot be shown. |
| `GET /deals/{id}/timeline` | -- | Does not exist; a chat tool only. No phase depends on it. |
| `chat_messages` ordering | 10 | `created_at` alone is non-deterministic. |
| Alembic `include_object` filter | -- | `alembic check` is red; an accepted autogenerated revision would drop five indexes. Not frontend, but do it before anyone runs autogenerate. |
| Stray-array-element detect failure | 3, 7 | Intermittent Groq `json_validate_failed` fails a whole run; no inter-attempt backoff on the sweep. |
| `origin` on `deal_contacts` / `meetings` | 8 | Cannot attribute a value to human or model. |
| Route tests for 61 of 71 operations | all | Only accounts/contacts are covered; every other contract is unverified. |
| `MissingGreenlet` on transcript upload | 4, 7 | `POST /deals/{id}/documents` with `source_type=meeting_transcript` is a 500: `touch_deal` expires `deal.last_activity_at`, then `detect._gone_quiet` lazy-loads it. Blocks 7.7. |
