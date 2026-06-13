---
name: tdd
description: Guide test-driven development for the backend using the red-green-refactor cycle with pytest and uv.
user_invocable: true
---

# Test-Driven Development (Backend)

Drive backend development through the red-green-refactor cycle. Every piece of behavior starts as a failing test.

## When to Activate

- User invokes `/tdd`
- User asks to build a backend feature using TDD

## Instructions

### 0. Setup check

Before the first cycle, verify pytest is available:

```bash
cd backend && uv run pytest --version
```

If pytest is not installed, run `uv add --dev pytest` first. Also check if `tests/` exists; create it (with `__init__.py`) if missing.

If the user provided arguments (e.g. `/tdd user registration endpoint`), use that as the feature context. Otherwise, ask what behavior they want to build.

### 1. RED — Write a failing test

Ask the user: **"What behavior should we test first?"** (skip if already clear from context).

Then:

1. Write a focused test in `backend/tests/test_<module>.py` following these rules:
   - One concern per test.
   - Clear name: `test_<scenario>_<expected_outcome>` (e.g. `test_create_user_returns_201`).
   - Arrange–Act–Assert structure.
   - Use type hints on fixtures and parameters.
   - Inject dependencies rather than patching internals when possible.
2. Run the test and **confirm it fails**:
   ```bash
   cd backend && uv run pytest tests/test_<module>.py::<test_name> -v
   ```
3. Show the user the failure output. If it fails for the wrong reason (import error, syntax, etc.), fix the test first — the failure must be about the **missing behavior**, not broken test code.

Tell the user: **"RED — test fails as expected. Ready to make it green."**

### 2. GREEN — Write the minimal code to pass

1. Write the **simplest implementation** that makes the failing test pass. No extra features, no premature abstractions. Resist the urge to write "good" code — just make it work.
2. Run the test again:
   ```bash
   cd backend && uv run pytest tests/test_<module>.py::<test_name> -v
   ```
3. If it passes, also run the full test suite to make sure nothing else broke:
   ```bash
   cd backend && uv run pytest -v
   ```
4. If anything fails, fix it before moving on.

Tell the user: **"GREEN — test passes. Want to refactor, or move to the next behavior?"**

### 3. REFACTOR — Clean up while green

Only if the user wants to refactor (or if the code clearly needs it):

1. Improve the implementation: extract functions, rename, remove duplication, apply SOLID principles — but **do not change behavior**.
2. After every change, re-run the tests to confirm they still pass:
   ```bash
   cd backend && uv run pytest -v
   ```
3. If a refactor breaks a test, undo it and try a different approach.

Tell the user: **"REFACTOR done — all tests still green. What's the next behavior?"**

### 4. Repeat

Loop back to step 1 (RED) for the next piece of behavior. Keep cycles small — each test should cover one narrow behavior, not an entire feature at once.

## Guidelines

- **Small steps**: If a behavior feels too big for one test, break it down. It's better to have 5 tiny cycles than 1 big one.
- **Test behavior, not implementation**: Tests should assert what the code does (outputs, side effects, status codes), not how it does it (internal method calls, private state).
- **Don't skip RED**: Always see the test fail first. A test that has never failed tells you nothing.
- **Don't gold-plate in GREEN**: The refactor step exists for a reason — keep GREEN minimal.
- **Run tests from `backend/`**: Always `cd backend` before `uv run pytest` so the virtualenv and paths resolve correctly.
- **Follow project standards**: Use type hints, PEP 8, dependency injection per the Python standards rule.
