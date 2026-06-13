# Python Standards

## Tooling

- Use **uv** for this project: dependency management (`uv add`, `uv sync`), running scripts (`uv run python ...`), and lockfile (`uv.lock`). Do not use `pip` or `requirements.txt` for the backend or Python service.

## PEP

- Follow **PEP 8** (style), **PEP 257** (docstrings), and relevant PEPs for the code you write.
- Use `ruff` or `black` for formatting; prefer type hints (PEP 484) and modern syntax.

```python
# ✅ GOOD: clear naming, docstring, type hints
def get_user_by_id(user_id: int) -> User | None:
    """Return the user for the given id, or None if not found."""
    return session.get(User, user_id)
```

## DRY & SOLID

- **DRY**: Extract shared logic into functions, classes, or modules; avoid copy-paste.
- **SOLID**: Single responsibility, Open/closed, Liskov substitution, Interface segregation, Dependency inversion. Prefer small interfaces and dependency injection over hard-coded dependencies.

```python
# ✅ Prefer injecting dependencies
def __init__(self, repository: UserRepository):
    self._repo = repository
```

## Design Patterns

- Prefer patterns from the [Refactoring.Guru design patterns catalog](https://refactoring.guru/design-patterns): Creational (Factory, Builder, Singleton), Structural (Adapter, Decorator, Facade), Behavioral (Strategy, Observer, Command).
- Use a pattern only when it clearly improves clarity or flexibility; avoid pattern-heavy code when a simple function or class suffices.

## Unit tests

- **Write unit tests** for new and changed behavior. Use **pytest** (`uv add --dev pytest`); place tests in `tests/` with modules named `test_*.py` or `*_test.py`.
- One concern per test; prefer clear names that describe the scenario and expected outcome. Use arrange–act–assert where it helps readability.

```python
# tests/test_main.py
import pytest
from app.main import main

def test_main_prints_greeting(capsys: pytest.CaptureFixture[str]) -> None:
    main()
    out, _ = capsys.readouterr()
    assert "Hello" in out
```
