# `ts-model-checker` — Tutorial & Template Guide

Welcome to `ts-model-checker`, a visual TLA+-style formal model checker. You can use it to design state machines visually, check safety invariants (`□P`), detect deadlocks, verify temporal liveness properties (`◇P` and `P ~> Q`), replay shortest-path counterexamples step by step, and export `.tla` / `.cfg` files for the official TLC model checker.

---

## 1. Building a System from Scratch (Step-by-Step)

1. **Start a Blank Model:**
   - In the top bar, click **New Blank** (or select **Blank System (Start from Scratch)** from the dropdown).
   - Optionally rename your system in the **Module name** input (e.g., `OrderWorkflow`). Use letters, digits, and underscores only.

2. **Configure State Variables (`Init` Node):**
   - Click the edit button (pencil icon) on the blue **Initial State (Init)** node at the top of the canvas.
   - Add the variables that represent your system state (for example: `balance` of type `number` = `100`, `status` of type `string` = `"PENDING"`).
   - Click **Save Initial State**.

3. **Add Actions (`ActionBox` Nodes):**
   - Click **+ New Action** in the top-left toolbar of the canvas.
   - Each action represents an **atomic transition** with two parts:
     - **When (Guard / Precondition):** A boolean condition built with dropdowns in `ExprBuilder`. The action can only execute when this evaluates to `true`.
     - **Then (Effects / Next-State Assignments):** One or more `variable' = expression` assignments. Any variable you do not assign here automatically stays `UNCHANGED` (just like in TLA+).

4. **Define Properties to Verify (`PropertiesPanel` on the right):**
   - **Safety Invariants (`□P`):** Rules that must be `true` in *every* reachable state (e.g., `balance >= 0`).
   - **Temporal Liveness (`◇P` or `P ~> Q`):**
     - `◇ Eventually`: Every fair execution must eventually reach a state where `P` holds.
     - `P ⇝ Q (Leads-To)`: Whenever `P` becomes true, `Q` must eventually become true.

5. **Run Verification & Inspect Counterexamples:**
   - Click **Verify Model**. The BFS explorer runs in a background Web Worker.
   - If a bug is found (`INVARIANT_VIOLATED`, `DEADLOCK`, or `LIVENESS_VIOLATED`), the **TracePlayer** appears on the right. Use **Play**, **Next**, or **Previous** to watch the exact sequence of actions on the canvas and inspect variable diffs at every step.

6. **Export to TLA+ (`.tla` / `.cfg`):**
   - Click **Export TLA+** in the top bar to preview, copy, or download `.tla` and `.cfg` files ready for TLC.

---

## 2. Built-in Templates Explained

### Template 1: `Concurrent Transfer (With Race Condition)`

* **What it is:** Models two concurrent processes (`P1` and `P2`) attempting to debit `80` from a shared bank account that starts with `balance = 100`. This reproduces the classic *Check-Then-Act* (TOCTOU) concurrency bug.
* **Initial State (`Init`):**
  * `balance = 100` (`number`)
  * `p1 = "IDLE"` (`string`)
  * `p2 = "IDLE"` (`string`)
* **Action Blocks:**
  * **`P1_CheckBalance`** — *Guard:* `p1 == "IDLE" && balance >= 80` → *Effect:* `p1' = "AUTHORIZED"`
  * **`P1_Debit`** — *Guard:* `p1 == "AUTHORIZED"` → *Effects:* `balance' = balance - 80`, `p1' = "COMPLETED"`
  * **`P2_CheckBalance`** — *Guard:* `p2 == "IDLE" && balance >= 80` → *Effect:* `p2' = "AUTHORIZED"`
  * **`P2_Debit`** — *Guard:* `p2 == "AUTHORIZED"` → *Effects:* `balance' = balance - 80`, `p2' = "COMPLETED"`
  * **`P1_RejectInsufficientFunds`** — *Guard:* `p1 == "IDLE" && balance < 80` → *Effect:* `p1' = "REJECTED"`
  * **`P2_RejectInsufficientFunds`** — *Guard:* `p2 == "IDLE" && balance < 80` → *Effect:* `p2' = "REJECTED"`
* **Invariant (`□P`):** `balance >= 0` (*Balance must never become negative*).
* **Expected Result:** **`INVARIANT_VIOLATED`** in 5 steps:
  1. `Init`: `balance = 100, p1 = "IDLE", p2 = "IDLE"`
  2. `P1_CheckBalance`: `p1 = "AUTHORIZED"`
  3. `P2_CheckBalance`: `p2 = "AUTHORIZED"`
  4. `P1_Debit`: `balance = 20, p1 = "COMPLETED"`
  5. `P2_Debit`: `balance = -60, p2 = "COMPLETED"` → **Violation!**

---

### Template 2: `Concurrent Transfer (Fixed)`

* **What it is:** Fixes the race condition from Template 1 by combining balance verification and deduction into a single **atomic** transition per process.
* **Initial State (`Init`):** `balance = 100`, `p1 = "IDLE"`, `p2 = "IDLE"`.
* **Action Blocks:**
  * **`P1_AtomicDebit`** — *Guard:* `p1 == "IDLE" && balance >= 80` → *Effects:* `balance' = balance - 80`, `p1' = "COMPLETED"`
  * **`P1_RejectInsufficientFunds`** — *Guard:* `p1 == "IDLE" && balance < 80` → *Effect:* `p1' = "REJECTED"`
  * **`P2_AtomicDebit`** — *Guard:* `p2 == "IDLE" && balance >= 80` → *Effects:* `balance' = balance - 80`, `p2' = "COMPLETED"`
  * **`P2_RejectInsufficientFunds`** — *Guard:* `p2 == "IDLE" && balance < 80` → *Effect:* `p2' = "REJECTED"`
* **Invariant (`□P`):** `balance >= 0`.
* **Expected Result:** **`PASSED`**. Whichever process runs first debits `80` (leaving `20`), and the second process can only take its `RejectInsufficientFunds` branch.

---

### Template 3: `Mutual Exclusion (Mutex)`

* **What it is:** Models two processes (`P1` and `P2`) competing for a shared exclusive lock before entering a critical section.
* **Initial State (`Init`):** `lock = "FREE"`, `p1 = "IDLE"`, `p2 = "IDLE"`.
* **Action Blocks:**
  * **`P1_RequestLock`** — *Guard:* `p1 == "IDLE"` → *Effect:* `p1' = "WAITING"`
  * **`P1_AcquireLock`** — *Guard:* `p1 == "WAITING" && lock == "FREE"` → *Effects:* `lock' = "P1"`, `p1' = "CRITICAL"`
  * **`P1_ReleaseLock`** — *Guard:* `p1 == "CRITICAL"` → *Effects:* `lock' = "FREE"`, `p1' = "IDLE"`
  * *(Symmetric blocks `P2_RequestLock`, `P2_AcquireLock`, `P2_ReleaseLock` for `P2`)*
* **Invariant (`□P`):** `!(p1 == "CRITICAL" && p2 == "CRITICAL")` (*P1 and P2 never enter the critical section simultaneously*).
* **Expected Result:** **`PASSED`**. Try removing `lock == "FREE"` from `P1_AcquireLock` in the editor to see the model checker immediately catch the mutual exclusion violation!

---

### Template 4: `Two-Phase Commit (2PC)`

* **What it is:** Models a simplified distributed atomic commit protocol with one Transaction Manager (`tmState`) and two Resource Managers (`rm1`, `rm2`). Demonstrates both **Safety** and **Liveness (`◇P`)**.
* **Initial State (`Init`):** `tmState = "INIT"`, `rm1 = "WORKING"`, `rm2 = "WORKING"`.
* **Action Blocks:**
  * **`RM1_Prepare`** — *Guard:* `tmState == "INIT" && rm1 == "WORKING"` → *Effect:* `rm1' = "PREPARED"`
  * **`RM2_Prepare`** — *Guard:* `tmState == "INIT" && rm2 == "WORKING"` → *Effect:* `rm2' = "PREPARED"`
  * **`TM_Commit`** — *Guard:* `tmState == "INIT" && rm1 == "PREPARED" && rm2 == "PREPARED"` → *Effects:* `tmState' = "COMMITTED"`, `rm1' = "COMMITTED"`, `rm2' = "COMMITTED"`
  * **`TM_Abort`** — *Guard:* `tmState == "INIT"` → *Effects:* `tmState' = "ABORTED"`, `rm1' = "ABORTED"`, `rm2' = "ABORTED"`
* **Invariant (`□P`):** `!((rm1 == "COMMITTED" && rm2 == "ABORTED") || (rm1 == "ABORTED" && rm2 == "COMMITTED"))` (*No participant commits while another aborts*).
* **Liveness (`◇P`):** `tmState != "INIT"` (*Transaction eventually reaches a decision*).
* **Expected Result:** **`PASSED`** (both safety and liveness hold across all reachable states).

---

## 3. Real-World Use Cases

### Use Case 1: Payment & Ledger Idempotency
- **Problem:** Concurrent webhook retries or parallel checkout requests can double-charge or overdraw an account.
- **How to model:** Create variables `balance`, `processedKeys` (set), and `req1Status` / `req2Status`. Add an invariant `balance >= 0` and verify that duplicate idempotency keys cannot debit twice.

### Use Case 2: Order / Fulfillment Workflow State Machines
- **Problem:** Complex e-commerce or approval workflows (`PENDING -> PAID -> SHIPPED -> DELIVERED` or `CANCELLED`) often develop hidden deadlocks or invalid state jumps when refunds and shipments race.
- **How to model:** Model each API endpoint or background job as an `ActionBox` with its preconditions (`guard`) and state updates (`effects`). Set `terminalCondition` to `status == "DELIVERED" || status == "CANCELLED"` and run the checker to verify **zero deadlocks** and that **cancelled orders are never shipped**.

### Use Case 3: Distributed Lock / Lease Expiration
- **Problem:** Two workers holding a lease might both believe they are the leader if a lease expires mid-operation.
- **How to model:** Add a `leaseOwner` and `step` counter, add an `ExpireLease` action, and check the mutual exclusion invariant `!(w1 == "WRITING" && w2 == "WRITING")`.

### Use Case 4: Validating Production Logs Against a Formal Spec in CI (`Trace Validation`)
- **Problem:** Even after verifying a design, real TypeScript/Node.js code might drift from the model.
- **How to use:** Export your `VisualSpecIR` JSON from the UI and run `validateExecutionTrace(spec, capturedServiceStates)` inside your Vitest/Jest integration suite to fail CI whenever production code emits a state transition that violates the formal specification.
