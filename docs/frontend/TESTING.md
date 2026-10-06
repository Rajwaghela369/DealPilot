# Frontend manual test pass

Everything in `PLAN.md` is built and verified against the live API. What has
**not** been verified is the browser: every automated check rendered components
server-side, which proves they execute and emit the right markup with real data,
and proves nothing about clicking.

So this pass deliberately does not re-test data correctness. It tests the things
only a browser can show: **interaction, focus, live updates, scrolling and
layout.**

Work in order — round B depends on nothing, but round A is free because the
seeded data already exists.

---

## 0. Preflight

```
http://localhost:5174          the app (5173 was taken, hence 5174)
http://127.0.0.1:8000/health   should be {"status":"ok","database":"ok"}
```

All six containers should be up (`docker ps`). The worker matters for rounds A6
and B5; `docker logs -f dealpilot-worker-1` in a spare terminal is worth having
open.

Open the browser devtools **console** and leave it open for the whole pass. A
React key warning, a failed request or an unhandled rejection is a finding even
if the screen looks fine.

---

## Round A — the seeded deal (~10 min, no setup)

Base: `/deals/cf0f34a7-4ac0-4557-8984-00ac087be83d`

It has 5 open risks, 3 meetings, 3 documents, 43 facts and 2 stakeholders.

### A1. The shell and the header

- [ ] Go to `/deals`. The table lists deals; the sidebar shows **Pipeline**
      highlighted, not Dashboard.
- [ ] Click the **SecureFlow Enterprise** row anywhere except a button. It opens
      the workspace.
- [ ] The header shows the name, `Discovery`, `$180,000`, close date and days in
      stage. The Risk column on the table said **"not assessed"** — the header
      should show no risk badge at all, not a grey "low".
- [ ] Browser **back** returns to the pipeline with filters intact.
- [ ] Reload on the workspace URL. It stays put — it must not bounce to the
      dashboard.
- [ ] Tab counts appear beside Risks (5), Meetings (3), People (2),
      Documents (3). Facts and Chat have none — that is correct, the payload
      carries no count for them.

### A2. The evidence drawer — the most important check in this pass

- [ ] Risks tab. Find **"No stage movement in 68 days"** and click its
      **1 source** button.
- [ ] The drawer slides in from the right. Behind it, the page must **not**
      scroll when you use the wheel.
- [ ] It shows a `Record` badge, `deal_stage_history.changed_at` and the value
      read. Badge reads **"Not re-checked"** in grey — *not* green.
- [ ] Press **Escape**. The drawer closes **and focus returns to the button you
      opened it from** — press Enter immediately and it should reopen.
- [ ] Close it by clicking the dark scrim instead. Same result.
- [ ] Now open **"2 sources"** on the unresolved-objection risk.
- [ ] The first row is expanded; the second is collapsed. Both show green
      **"Verified"**.
- [ ] In the expanded row the transcript paragraph appears with **one phrase
      highlighted in purple**. Read around it — the highlight should sit on the
      quoted sentence, not a line off.
- [ ] Click **Show in context** on the second row. It expands too.
- [ ] Click **Open source document**. A new tab opens the raw transcript from
      MinIO. Close it.

### A3. Documents

- [ ] Documents tab. Three transcripts, each with a chunk count (3, 5, 5) and a
      size. None should show a red **"none"** chunk badge.
- [ ] Click **Preview** on one. New tab, the `.txt` renders. The URL is
      `localhost:9000` with a long signature — that is correct, it is a
      presigned link.
- [ ] Press **Delete** on a document, read the dialog, then **Cancel**. It must
      mention that claims survive their evidence. Do not confirm.

### A4. Meetings and attendees

- [ ] Meetings tab → open **Negotiation check-in**.
- [ ] Three panels: Details, Brief, Analysis, then Attendees below.
- [ ] Brief panel says **"No brief yet"** with a Generate button — *not* a red
      error. (A 404 here is the normal state.)
- [ ] Analysis shows green **Analysed** and a Re-run button.
- [ ] Attendees are split: **Unresolved** (Dana Whitfield, Tom Alvarez) above
      **Known** (Marcus Webb, Priya Raman, and Maya Chen tagged `internal`).
- [ ] The unresolved group has a sentence explaining why it matters.
- [ ] Because the meeting is `completed`, rows read **"attended"** — not
      "invited".
- [ ] Click **Resolve** on Dana Whitfield. The dialog opens on "Someone already
      on this account" with a contact dropdown. Switch to **A new person** — the
      first/last name should be **pre-filled as "Dana" / "Whitfield"**. Cancel.
- [ ] Click **Resolve** on Maya Chen — she is internal, so there should be *no*
      Resolve button at all, only the `internal` badge.

### A5. Facts — the honesty check

- [ ] Facts tab. Blue banner at the top: **"This is a view, not a review
      queue."**
- [ ] Every row shows a grey **"Not validated"** badge.
- [ ] Below each, smaller: **"Self-reported confidence 1.00 — … not a validation
      result."**
- [ ] **Nothing anywhere should read as "100% confident" or green.** All 43 facts
      genuinely have confidence 1.00 and no verdict; if this screen makes that
      look like validation, that is the single worst bug in the product.
- [ ] Filter by type `Objection`, then `All types`. Rows change, no console error.
- [ ] Footer note says quarantined facts are filtered out by the API.

### A6. The analysis panel and the worker

- [ ] Back on Overview, press **Run checks**.
- [ ] A toast reports counts ("N risks detected, N recommendations written") —
      *results*, not "queued". It should resolve in a second or two.
- [ ] The badge/explanation under it should match what the worker log shows.

---

## Round B — write paths (~15 min, throwaway data)

Prefix everything you create with **ZZ** so it is easy to find and delete after.

### B1. Account and contact

- [ ] `/accounts` → **New account** → name `ZZ Manual Test` → create. It should
      navigate straight into the detail page.
- [ ] **Add contact** → `Ada Lovelace`, email `ada@zz.test` → add.
- [ ] Add a second contact with **the same email**. Expect a red message naming
      Ada and a **"Jump to that contact"** link. Click it — the page should jump
      to Ada's row.
- [ ] Edit the account, clear the **Name**, save. Expect an inline "A name is
      required." with **no network request** (check the Network tab).
- [ ] Remove a contact. The dialog must explain that meeting-attendee rows
      survive with the link cleared. Confirm.

### B2. Deal

- [ ] `/deals` → **New deal** → pick `ZZ Manual Test`, name `ZZ Deal`, stage
      `Discovery`, value `50000`, close date next week → create. It should land
      in the new workspace.
- [ ] Overview → **Edit**. Change the stage. A **"Why the stage changed"** box
      should *appear only once the stage differs* from the current one.
- [ ] Pick `Closed won` — an amber warning about the close date appears. Change
      back to something open. Save.
- [ ] Stage history now has two entries, the newest marked **"still here, N
      days"**, with your note.

### B3. Risks and the accept flow

- [ ] Overview → **Run checks** → Risks tab. Risks and nested suggestions appear.
- [ ] On a suggestion press **Accept**. The due date is pre-filled a week out and
      the title is pre-filled from the suggestion.
- [ ] Clear the due date and submit. Expect an inline error, no request sent.
- [ ] Restore the date, edit the title to `ZZ accepted task`, create. Toast
      confirms; the card now reads **"Became a task — see it in Tasks"**.
- [ ] Press **Accept** on that same card again if still offered — expect the 409
      message naming the task, **and no Accept button** in that dialog.
- [ ] On another suggestion press **Dismiss**. Five reasons, **none
      pre-selected**. Submit with none chosen → inline error. Pick
      **Bad timing**, add a note, dismiss. The card shows the reason and note.
- [ ] Press **Change status** on a risk → `Resolved`. Each option carries an
      explanation. Save. The card recedes; a **"Show 1 decided"** toggle appears.

### B4. Tasks and provenance — the newest change

- [ ] `/tasks`. `ZZ accepted task` is there.
- [ ] Its sub-line reads **"from a suggestion"** and is a **link**. Click it.
- [ ] You land on that deal's Risks tab, the recommendation is **scrolled into
      view and briefly outlined in purple**. If its risk was resolved in B3, the
      decided risks must be **revealed automatically** — the card must not be
      hidden behind the toggle.
- [ ] Back on `/tasks`, tick the task's **checkbox**. It strikes through and the
      status flips to Done without a page reload.
- [ ] Untick it. Back to Open.
- [ ] Create a task by hand (**New task**). Its sub-line reads **"added by
      hand"** — not "from a suggestion".
- [ ] Set the status filter to **Done or cancelled**, then back to **Open**.
- [ ] Open a deal's Overview — its **Next action** should now show your task.

### B5. Documents and the known-broken path

- [ ] Documents tab on `ZZ Deal`. Upload a small `.txt` with `source_type` =
      **Note**. It should succeed and report a chunk count.
- [ ] Upload **the same file again**. Expect "already stored … nothing was
      duplicated" — and the table must still show **one** row.
- [ ] Upload a `.exe` or similar → expect **"That file cannot be read"** listing
      the supported extensions.
- [ ] Upload an empty file → **"Nothing to store"**.
- [ ] ⚠️ Now upload a `.txt` with `source_type` = **Meeting transcript**. **This
      will fail with a 500.** That is the known backend bug, not a UI fault. The
      UI should say the server failed and that the document was *probably not
      stored*. Confirm it says that rather than showing a raw error.

### B6. Chat and streaming

- [ ] `/deals/<ZZ deal>/chat` → **New conversation**.
- [ ] Type `What stage is this deal in?` and press **Enter** (not the button).
- [ ] A "Thinking…" spinner appears, then text **streams in visibly, word by
      word**. This is the check SSR could not do.
- [ ] The **Send** button becomes **Stop** while streaming.
- [ ] If the answer carries sources, a **Sources** block lists them with
      handles. Click **In context** → a drawer resolves the chunk.
- [ ] Send a second message. Both turns persist in order.
- [ ] **Rename** the conversation, then **Delete** it.
- [ ] Try `/chat` (global) and send one message there too — it must not show the
      deal's sessions.
- [ ] If Groq returns an error, the answer bubble should show **"The answer
      failed"** with whatever text arrived — not an empty bubble or a crash.
      This is the normal path under load, so it is worth seeing at least once.

### B7. Dashboard

- [ ] `/` — stacked bar, legend with counts and values per stage.
- [ ] **Needs attention**, **Tasks due** and **AI status** all populated.
- [ ] AI status says the token budget is **the API's own bucket, not the
      worker's**.
- [ ] Click through a deal link and a task link.

### B8. Teardown

- [ ] Delete the `ZZ` tasks, then `ZZ Deal`, then `ZZ Manual Test`.
- [ ] Try deleting the account **before** its deal to see the 409 — it should be
      a readable sentence naming the deal count, inside the dialog.

---

## Round C — cross-cutting (~5 min)

- [ ] **Narrow the window** to ~800px and then ~500px on the pipeline, a deal
      workspace and chat. Tables should scroll sideways *inside their card*
      without the sidebar sliding off.
- [ ] **Keyboard only** on `/accounts`: Tab to a row, press **Enter** — it should
      open. Tab into a drawer, Escape out.
- [ ] **Stop the backend** (`docker stop dealpilot-backend-1`) and reload. A red
      banner should say the API is unreachable with a concrete command. Start it
      again; the banner clears on its own within ~30s.
- [ ] Visit `/nonsense` → "No such page", with the sidebar still present.

---

## Known issues — do not report these

| | |
| --- | --- |
| Transcript upload returns 500 | Backend bug. `touch_deal` expires `deal.last_activity_at`, then `detect._gone_quiet` lazy-loads it outside the greenlet. Two-line fix, not yet applied. |
| All facts show confidence 1.00 / "Not validated" | True of the data. Gate 1 has not validated this corpus. The UI is reporting it correctly. |
| Risk level shows "not assessed" | The rollup is null until an analysis sets it. Correct, not a blank. |
| Facts cannot be accepted or rejected | No endpoint exists. Phase 9 is read-only by design. |
| Chat message order can shift between reads | `chat_messages` orders by `created_at` alone. Known backend gap. |
| No timeline on Overview | `GET /deals/{id}/timeline` does not exist. |

---

## Reporting a finding

For anything that looks wrong, note: **the URL**, **what you clicked**, **what
you expected**, **what happened**, and **anything in the console**. A screenshot
of layout problems saves a lot of back-and-forth.

Worth separating as you go:

- **Broken** — it does not work, or it lies about the data.
- **Rough** — it works but looks or feels wrong.
- **Missing** — the plan allows it and it is not there (dark-mode toggle, i18n,
  keyboard shortcuts, bulk actions and similar are explicitly out of scope, so
  these are not bugs).
