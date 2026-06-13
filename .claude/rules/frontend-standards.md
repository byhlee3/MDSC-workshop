# Frontend Standards

## Tooling

- Use **bun** for package management: install deps (`bun install`), add packages (`bun add` / `bun add -D`), run scripts (`bun dev`, `bun build`, `bun test`). Do not use npm, yarn, or pnpm for the frontend.
- Use **Vite** for build and dev server; do not add Create React App or other React CLI.
- Use **React** with functional components and hooks only (no class components).
- Use **TypeScript**. Follow TypeScript and JavaScript language standards: strict mode, explicit types for public APIs and props, avoid `any`; use modern syntax and consistent naming.

## Styling and UI components

- Use **Tailwind CSS** for styling. Prefer utility classes; extract repeated patterns with `@apply` or small components rather than one-off custom CSS. Keep the design system consistent (e.g. shared colors, spacing, typography in `tailwind.config`).
- Use **shadcn/ui** for UI components: Button, Input, Textarea, Card, ScrollArea, etc. Add components with `bunx shadcn@latest add <component>`. Import from `@/components/ui/*`. Use these where they fit (forms, layout, chat chrome) rather than building one-off styled elements.

## Multi-user and sessions

- This is a **multi-user app**. Each user who enters the page must get a **new conversation session** that does not conflict with other users. On app load (e.g. in the main chat view or a root effect), create a new session by calling `POST /sessions` and store the returned `session_id`. Send that `session_id` with every chat request (e.g. `POST /chat` body). Do not share session state across users or tabs unless explicitly intended (e.g. shared links); each tab/visit should have its own session.

## Chat UI (user ↔ LLM)

- Use the **Vercel AI SDK** for chat: **useChat** from `@ai-sdk/react` with **TextStreamChatTransport** (or DefaultChatTransport if the backend returns the SDK stream format). Point the transport at the backend streaming endpoint (e.g. `/chat/stream`). Pass `session_id` in the request body (e.g. `sendMessage({ text }, { body: { session_id } })`) so each user’s conversation stays isolated.
- Model the conversation as **user** and **assistant** (LLM) messages only. Render from the hook’s `messages` (UIMessage with `id`, `role`, `parts`); use `status` for loading (e.g. `submitted` / `streaming`) and to disable the form when not `ready`. Structure: scrollable **message list** (chronological), fixed **input area** (textarea + send). Clearly distinguish user vs assistant bubbles (e.g. alignment, shadcn primary/muted).
- Assistant messages often contain **markdown and code** — use a small, consistent renderer (e.g. react-markdown with code blocks) for assistant content.
- Use semantic markup and ARIA where helpful (e.g. `role="log"` for the message list, focus management after send or when a new message appears).

## React

- One main chat view; split into components such as `MessageList`, `MessageBubble` (with role: user | assistant), and the input area (e.g. form with shadcn Textarea + Button). Use **useChat** for message and stream state; optionally a small `MarkdownMessage` or code-block renderer for assistant content.
- Rely on the AI SDK hook for messages and status; avoid a global state library unless the app grows beyond chat.

## Unit tests

- **Write unit tests** for new and changed behavior. Use **Vitest** and **React Testing Library**; place tests next to source (e.g. `Component.test.tsx`) or in a `__tests__` directory. Test component behavior and what the user sees; avoid testing implementation details. One concern per test; use clear, descriptive test names.

```tsx
// useChat + session_id + shadcn (see ai-sdk.dev/docs/ai-sdk-ui/chatbot)
import { useChat } from '@ai-sdk/react';
import { TextStreamChatTransport } from 'ai';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

function ChatView() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const { messages, sendMessage, status } = useChat({
    transport: new TextStreamChatTransport({ api: '/chat/stream' }),
  });
  useEffect(() => { createSession().then(d => setSessionId(d.session_id)); }, []);
  const isReady = status === 'ready';
  return (
    <>
      <MessageList messages={messages} />
      {(status === 'submitted' || status === 'streaming') && <LoadingIndicator />}
      <form onSubmit={e => { e.preventDefault(); sendMessage({ text: input }, { body: { session_id: sessionId! } }); }}>
        <Textarea value={input} onChange={e => setInput(e.target.value)} disabled={!isReady} />
        <Button type="submit" disabled={!isReady || !input.trim()}>Send</Button>
      </form>
    </>
  );
}
```
