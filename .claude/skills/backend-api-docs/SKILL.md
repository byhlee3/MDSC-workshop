---
name: backend-api-docs
description: Scans the FastAPI backend, extracts all route definitions, Pydantic models, and dependencies, then generates a structured API reference document that the frontend skill can use to build API calls.
---

# Backend API Documentation Generator

Generates a comprehensive API reference from the FastAPI backend so the frontend knows exactly how to call each endpoint.

## When to Activate

- When the user asks to document the backend API
- When the user asks to generate API docs
- When frontend work needs to know what endpoints exist and how to call them
- After adding, changing, or removing backend endpoints
- When the user says "update api docs", "generate api docs", "document endpoints", or similar

## How to Generate the Docs

### Step 1: Discover all route files

Search the backend for FastAPI router and app definitions:

```
# Find all Python files that define routes
Grep for: @(app|router)\.(get|post|put|patch|delete)\(
Glob for:  backend/**/*.py, app/**/*.py, src/**/*.py, api/**/*.py
```

Also check for:
- The main FastAPI app entry point (usually `main.py` or `app.py`) — look for `FastAPI()` instantiation
- Router includes via `app.include_router(...)` to understand route prefixes and tags
- Any `APIRouter(prefix=...)` declarations

### Step 2: Extract endpoint information

For **each** route decorator found, extract:

1. **HTTP method** — `GET`, `POST`, `PUT`, `PATCH`, `DELETE`
2. **Path** — the full path including any router prefix (e.g. if router has `prefix="/api/v1"` and route is `"/sessions"`, the full path is `/api/v1/sessions`)
3. **Function name** — the handler function name
4. **Path parameters** — from the path string (e.g. `{session_id}`)
5. **Query parameters** — from function signature (`param: str = Query(...)`)
6. **Request body** — the Pydantic model used (e.g. `body: CreateSessionRequest`). Read the model class to get all fields, types, defaults, and validators.
7. **Response model** — from `response_model=` in the decorator or return type annotation
8. **Status code** — from `status_code=` in the decorator (default 200)
9. **Dependencies** — from `Depends(...)` in the function signature (e.g. auth, DB session)
10. **Tags** — from the decorator or router for grouping
11. **Docstring** — the function's docstring if present
12. **Streaming** — whether the endpoint returns `StreamingResponse` or `EventSourceResponse`

### Step 3: Extract Pydantic models

For every Pydantic model referenced by endpoints:

```python
# Look for BaseModel subclasses
class CreateSessionRequest(BaseModel):
    user_name: str | None = None

class ChatRequest(BaseModel):
    session_id: str
    message: str
    stream: bool = True
```

Extract: class name, every field with its type, whether it's required or optional, default value, and any `Field(...)` metadata (description, examples, constraints).

### Step 4: Extract WebSocket endpoints

Also look for WebSocket routes:

```python
@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
```

Document: path, path params, expected message format (JSON schema if available), and connection lifecycle.

### Step 5: Write the documentation file

Write the output to `docs/api-reference.md` in the project root with this exact structure:

```markdown
# API Reference

> Auto-generated from the FastAPI backend. Do not edit manually — re-run the backend-api-docs skill to update.
>
> Last updated: YYYY-MM-DD

Base URL: `http://localhost:<port>` (from uvicorn/config)

## Table of Contents

- [Sessions](#sessions)
- [Chat](#chat)
- [...grouped by tag/router]

---

## Sessions

### POST /api/v1/sessions

Create a new conversation session.

**Request Body** (`CreateSessionRequest`):

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| user_name | string \| null | No | null | Optional display name |

**Response** `201` (`SessionResponse`):

```json
{
  "session_id": "uuid-string",
  "created_at": "2025-01-01T00:00:00Z"
}
```

**Example:**

```bash
curl -X POST http://localhost:8000/api/v1/sessions \
  -H "Content-Type: application/json" \
  -d '{"user_name": "Alice"}'
```

**Frontend usage:**

```typescript
const res = await fetch('/api/v1/sessions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ user_name: 'Alice' }),
});
const { session_id } = await res.json();
```

---

## Chat

### POST /api/v1/chat/stream

Stream a chat response (SSE).

**Request Body** (`ChatRequest`):

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| session_id | string | Yes | — | The session UUID |
| message | string | Yes | — | User's message text |

**Response**: `200` — `text/event-stream` (Server-Sent Events)

**Stream format:**
```
data: {"content": "Hello"}
data: {"content": " world"}
data: [DONE]
```

**Frontend usage:**

```typescript
// With Vercel AI SDK TextStreamChatTransport
const transport = new TextStreamChatTransport({ api: '/api/v1/chat/stream' });
const { messages, sendMessage } = useChat({ transport });
sendMessage({ text: input }, { body: { session_id } });
```

[...repeat for every endpoint]
```

### Documentation rules

- Group endpoints by **tag** or **router file** — use the tag name or router prefix as the section header
- Order within groups: `POST` (create) → `GET` (list) → `GET /:id` (detail) → `PUT`/`PATCH` (update) → `DELETE`
- For every Pydantic model, show all fields in a table
- For streaming endpoints, document the stream format (SSE event shape, delimiter, done signal)
- Include a `Frontend usage` code snippet for every endpoint showing how to call it from TypeScript/React — use `fetch` for simple calls and note Vercel AI SDK usage for streaming chat endpoints
- If an endpoint requires auth (has a `Depends` on an auth function), note it under **Auth:** with the required header/token format
- At the bottom, add a **Models** appendix listing all Pydantic models and their full field tables (so the frontend can derive TypeScript types)

### Step 6: Generate TypeScript types (optional but recommended)

If the user asks or if it would be helpful, also generate a `frontend/src/types/api.ts` file with TypeScript interfaces matching every Pydantic model:

```typescript
// Auto-generated from FastAPI backend models. Do not edit manually.

export interface CreateSessionRequest {
  user_name?: string | null;
}

export interface SessionResponse {
  session_id: string;
  created_at: string;
}

export interface ChatRequest {
  session_id: string;
  message: string;
}
```

## Important Notes

- Always read the actual backend code — do not guess or assume endpoints. If no backend exists yet, tell the user and offer to help create it.
- If the backend uses `docs_url` or has OpenAPI JSON at `/openapi.json`, you can also read that as a cross-reference, but the source code is the primary source of truth.
- Keep `docs/api-reference.md` in sync — when the user modifies endpoints, remind them to re-run this skill.
- The frontend-standards rule references `POST /sessions` and `/chat/stream` — make sure those are documented if they exist.
