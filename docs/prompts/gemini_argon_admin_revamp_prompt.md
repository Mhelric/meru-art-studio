# Architectural Review & Specification Request: Meru Art Studio Admin Experience & Order Lifecycle Overhaul (Phase 7)

**To:** Gemini Argon (Principal Security & Database Systems Architect)  
**From:** Meru Art Studio Engineering Team  
**Subject:** Architectural Review, Sub-Navigation Hierarchy & Order Lifecycle/Deletion Design for Artist Admin Backoffice  
**Repository State:** Post-Phase 6F (Audit Status: 100% PASS on Phases 6A–6F; Production Live on Vercel + Supabase)

---

## 1. Executive Summary & Objective

Meru Art Studio's core client-facing application, security triggers, price-freeze engines, RLS policies, real-time publications, and accessibility suites have passed senior technical audits (Phases 6A through 6F) and are currently deployed to production.

However, the internal **Artist Admin Backoffice** (`src/components/admin/AdminPanel.tsx`) currently suffers from a severe UX and lifecycle limitation:
1. **Monolithic, Flat UI:** All administrative controls (Studio availability toggles, interactive calendar blocker, live USD/PHP pricing & multipliers, incoming brief approvals, order stage progression, payment verifications, schedule editing, WIP uploading, and order chat) are stacked onto a single, long-scroll page with an unsegmented horizontal list of pills representing every order ever created.
2. **Declined Orders Clutter & Missing Deletion:** When an artist declines an incoming brief, `declineCommissionInDb()` updates `status_stage = 'declined'`. However, `fetchAllCommissionsAdmin()` retrieves all commissions indiscriminately (`order by created_at desc`). The declined order remains permanently embedded in the main order selector alongside active commissions. There is no status-based tab filtering, no archiving mechanism, and **no delete/purge capability** anywhere in the frontend or mutation layer, creating extreme confusion and visual clutter for the artist.

We are preparing **Phase 7: Artist Admin Experience & Lifecycle Hardening**. We request your senior architectural review, feedback, and technical sign-off on the proposed sub-navigation dashboard layout, order filtering taxonomy, and safe deletion/purge specifications.

---

## 2. Current Architecture & Context

### 2.1 Technology Stack
- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS v4, Framer Motion, Lucide React.
- **Data Layer:** `@tanstack/react-query` v5 with optimistic updates and live WebSocket cache invalidation.
- **Backend:** Supabase PostgreSQL 15+ with strict Row-Level Security (RLS), custom `security definer` integrity triggers, and Full Replica Identity on realtime publications.
- **Storage:** Three private buckets with RLS: `commission-references`, `commission-wips`, `commission-receipts`.

### 2.2 Database Schema & Existing RLS Foundations
The PostgreSQL schema already contains robust cascade rules and delete policies:
- **`public.commissions` table:**
  - Status stages: `'pending_review'`, `'awaiting_deposit'`, `'sketching'`, `'sketch_approval'`, `'lineart_coloring'`, `'completed'`, `'declined'`, `'cancelled'`.
  - Delete RLS Policy:
    ```sql
    create policy "commissions_artist_delete"
      on public.commissions for delete
      to authenticated
      using (public.is_artist_admin());
    ```
- **Child Tables with `ON DELETE CASCADE`:**
  - `public.messages(commission_id)` → `references public.commissions(id) on delete cascade`
  - `public.wip_uploads(commission_id)` → `references public.commissions(id) on delete cascade`
  - `public.payments(commission_id)` → `references public.commissions(id) on delete cascade`
  - `public.commission_events(commission_id)` → `references public.commissions(id) on delete cascade`
  - `public.notification_logs(commission_id)` → `references public.commissions(id) on delete cascade`
- **Storage Objects:**
  - Files exist in Supabase storage buckets under path prefixes:
    - References: `commission-references/{client_id}/{commission_id}/*`
    - WIP previews: `commission-wips/previews/{commission_id}/*`
    - WIP masters: `commission-wips/masters/{commission_id}/*`
    - Receipts: `commission-receipts/{client_id}/{commission_id}/*`
  - *Note:* While PostgreSQL foreign keys cascade automatically, Supabase Storage objects are *not* automatically deleted by Postgres row deletions unless an explicit trigger or storage API call deletes the files.

### 2.3 Current Admin Limitations in Code
- **`src/lib/supabase.ts`:**
  - Has `fetchAllCommissionsAdmin()`, `updateCommissionStageInDb()`, `declineCommissionInDb()`, `toggleCommissionPaymentInDb()`.
  - **Missing:** Any `deleteCommissionInDb(commissionId)` function.
- **`src/lib/queries.ts`:**
  - **Missing:** `useDeleteCommissionMutation()`.
- **`src/context/StudioContext.tsx`:**
  - Flat `submittedOrders` array passed directly from React Query to the admin panel.
  - **Missing:** Filtered selectors or category-specific order views.
- **`src/components/admin/AdminPanel.tsx`:**
  - 839 lines of monolithic code containing everything from date math to multi-tier price inputs and chat boxes.
  - Single flat row: `{submittedOrders.map(o => <button>#{o.orderCode} · {o.tier}</button>)}`.
  - No sub-tabs, no search bar, no status filtering.

---

## 3. Proposed Phase 7 Architecture & Specifications

### 3.1 Dedicated Admin Sub-Navigation & Tabbed Workspace
We propose decomposing the monolithic `AdminPanel.tsx` into a modular, dedicated administrative dashboard equipped with its own internal sub-navigation bar:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  ARTIST ADMIN DASHBOARD                                              [Live / Dev Mode] │
│                                                                                        │
│  [ Pipeline & Queue ]  [ Incoming Briefs (3) ]  [ Payments ]  [ Settings ]  [ Archive ]│
└────────────────────────────────────────────────────────────────────────────────────────┘
```

1. **Sub-Tab 1: `Pipeline & Production` (Active Work)**
   - **Scope:** Active commissions currently in progress (`awaiting_deposit`, `sketching`, `sketch_approval`, `lineart_coloring`).
   - **Features:** 
     - Clean order selector cards showing client handle, character name, progress %, and delivery countdown.
     - Interactive milestone advancement controls.
     - Watermarked WIP preview uploader + 300 DPI master upload.
     - Direct order chat box with client.
     - Schedule date adjustment (start date, estimated delivery).

2. **Sub-Tab 2: `Incoming Briefs` (Intake Queue)**
   - **Scope:** Commissions with status `pending_review`.
   - **Features:**
     - Triage queue highlighting new submissions with badge counts.
     - Full brief inspection (character name, reference URLs, pose/vibe, add-ons breakdown, terms acceptance timestamp).
     - **Accept Brief** action: Moves order to `awaiting_deposit`, calculates slot reservation, notifies client.
     - **Decline Brief** action: Opens reason modal, updates status to `declined`, moves order to Archive.

3. **Sub-Tab 3: `Payments & Invoices` (Financial Gate)**
   - **Scope:** Orders awaiting deposit or final payment verification.
   - **Features:**
     - Deposit receipt inspection (direct link to view uploaded proof of payment in `commission-receipts`).
     - One-click payment verification stamp (`verified_by`, `verified_at`, auto-advancement of stage).
     - Financial breakdown (USD/PHP conversion, 50/50 vs 100% upfront).

4. **Sub-Tab 4: `Studio & Availability Settings`**
   - **Scope:** Global storefront configurations.
   - **Features:**
     - Status switcher: `OPEN`, `WAITLIST`, `CLOSED`.
     - Max active slot cap slider with live occupancy counter.
     - Interactive calendar date blocker (click-to-block vacation/busy dates).
     - Dynamic pricing editor: USD base rates, add-on percentage multipliers (+50% NSFW/Furry, +200% Commercial), and PHP exchange rate.

5. **Sub-Tab 5: `Archive & Deletion Management` (The Resolution for Declined/Completed Orders)**
   - **Scope:** Inactive orders: `declined`, `cancelled`, and `completed`.
   - **Features:**
     - Segmented filters: All Archived | Declined Only | Completed Deliveries | Cancelled.
     - Full historical audit trail inspection (`commission_events`).
     - **Safe Deletion / Purge Workflow:**
       - **"Delete from Studio"** button with a two-step confirmation modal (`"Type DELETE to confirm"`).
       - Evaluates against security constraints (preventing deletion of active in-progress commissions with unverified payments).
       - Triggers database deletion + storage cleanup.

---

### 3.2 Order Lifecycle & Deletion Architecture: Key Questions for Argon

We request your specific guidance and architectural rulings on the following questions:

#### Question 1: Soft-Delete vs. Permanent Purge (Hard Delete)
* For an art commission studio governed by statutory audit requirements (e.g. Philippine Data Privacy Act RA 10173 and payment record-keeping):
  - Is it preferable to maintain a soft-delete column (`is_archived boolean default false` or `deleted_at timestamptz`), OR allow the artist admin to perform hard `DELETE` queries on `public.commissions`?
  - If hard `DELETE` is used for declined briefs, how should the system handle the cascading cleanup of uploaded reference images from the private `commission-references` storage bucket to prevent orphan file accumulation?

#### Question 2: Cascade Storage Cleanup Implementation
* PostgreSQL's `ON DELETE CASCADE` cleanly purges child database rows (`messages`, `wip_uploads`, `payments`, `commission_events`), but does **not** delete Supabase Storage objects in S3/MinIO.
* What is the recommended, audit-approved pattern for cleaning up storage objects when an order is deleted?
  - **Option A:** Client-side orchestration via `supabase.storage.from(...).remove(...)` prior to executing the `DELETE` mutation.
  - **Option B:** A Supabase Database Webhook or `pg_net` trigger on `BEFORE DELETE` / `AFTER DELETE` on `public.commissions` calling an Edge Function with `SUPABASE_SERVICE_ROLE_KEY`.
  - **Option C:** A scheduled Supabase Edge Function or cron job that sweeps orphan storage paths.

#### Question 3: Security & State Invalidation Gates for Deletion
* What RLS policy or database trigger checks should be added to prevent accidental deletion of active orders? (e.g. Should `DELETE` only be permissible if `status_stage IN ('declined', 'cancelled', 'completed')` and rejected if in `awaiting_deposit`, `sketching`, etc.?)
* How should React Query cache invalidation be structured across `adminCommissions`, `myCommissions`, and `publicQueue` to ensure instant zero-latency UI updates without race conditions?

#### Question 4: Component Modularization & File Hierarchy
* To maintain production maintainability, we plan to refactor `src/components/admin/AdminPanel.tsx` into a modular folder structure:
  ```
  src/components/admin/
  ├── AdminDashboard.tsx         // Main shell & sub-navigation tab bar
  ├── AdminNav.tsx               // Sub-nav pill bar with badge counters
  ├── tabs/
  │   ├── PipelineTab.tsx        // In-progress orders & milestone advancement
  │   ├── IncomingBriefsTab.tsx  // Pending review triage & accept/decline actions
  │   ├── PaymentsTab.tsx        // Deposit & final payment receipt verification
  │   ├── StudioSettingsTab.tsx  // Availability, slot cap, pricing & calendar blocker
  │   └── ArchiveTab.tsx         // Filtered historical orders & deletion dialogs
  └── dialogs/
      ├── DeleteOrderDialog.tsx  // Two-step destructive confirmation modal
      └── DeclineReasonModal.tsx // Quick note attached to declined brief event
  ```
  Does this component hierarchy satisfy accessibility (WCAG 2.1 AA focus trapping and ARIA roles for tablists), performance (lazy loading), and separation of concerns?

---

## 4. Verification Deliverables Requested from Argon

Please provide:
1. **Architectural Evaluation & Ruling:** Verdict on the proposed sub-navigation hierarchy, deletion model, and storage cleanup strategy.
2. **PostgreSQL Migration Plan (Phase 7):** Any required SQL schema adjustments (e.g., `commissions_artist_delete` safety constraints, storage helper functions, or archive flags).
3. **Data Layer Contract:** TypeScript mutation definitions for `deleteCommissionInDb`, `archiveCommissionInDb`, and React Query cache invalidation rules.
4. **Implementation Roadmap:** Step-by-step guidance for safe, non-breaking execution against the live Vercel/Supabase environment.
