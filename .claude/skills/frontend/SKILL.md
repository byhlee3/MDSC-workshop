---
name: frontend
description: Build frontend features using bun, shadcn/ui components, and TanStack Query for data fetching and caching. Guides component creation, API integration, and state management.
user_invocable: true
---

# Frontend Development

Build frontend features using bun for tooling, shadcn/ui for components, and TanStack Query for server state management and caching.

## When to Activate

- User invokes `/frontend`
- User asks to build a frontend feature, page, or component

## Instructions

### 0. Setup check

Verify the frontend toolchain is ready:

```bash
cd frontend/my-bun-app && bun --version
```

Check that core dependencies are installed:

```bash
cd frontend/my-bun-app && bunx shadcn@latest --help > /dev/null 2>&1 && echo "shadcn: ok" || echo "shadcn: needs setup"
cat package.json | grep -E "@tanstack/react-query" || echo "tanstack-query: not installed"
```

If TanStack Query is missing, install it:

```bash
cd frontend/my-bun-app && bun add @tanstack/react-query
```

If the user provided arguments (e.g. `/frontend user profile page`), use that as the feature context. Otherwise, ask what they want to build.

### 1. Plan the feature

Before writing code, identify:

1. **What components are needed** — break the UI into small, reusable pieces.
2. **What shadcn/ui components to use** — check if a suitable component exists before building custom UI. Common ones: Button, Input, Textarea, Card, Dialog, Select, Table, Tabs, Badge, ScrollArea, Skeleton, Toast.
3. **What data the feature needs** — identify API endpoints to call and what TanStack Query hooks to create.
4. **What state is local vs server** — use TanStack Query for server state (fetched data); use React `useState`/`useReducer` for local UI state only.

Present the plan to the user before proceeding.

### 2. Add shadcn/ui components

Add any needed shadcn/ui components that aren't already in the project:

```bash
cd frontend/my-bun-app && bunx shadcn@latest add <component>
```

Import from `@/components/ui/*`:

```tsx
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
```

Rules:
- Always check if a shadcn/ui component fits before creating custom styled elements.
- Use shadcn/ui primitives for forms (Input, Textarea, Select, Checkbox, etc.).
- Use Card for content containers, Dialog for modals, Sheet for side panels.
- Use Skeleton for loading states.
- Compose shadcn/ui components together rather than overriding their styles.

### 3. Create TanStack Query hooks

For every API endpoint the feature consumes, create a dedicated query or mutation hook:

```tsx
// hooks/use-plants.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Query keys — colocate and make them a factory
export const plantKeys = {
  all: ["plants"] as const,
  lists: () => [...plantKeys.all, "list"] as const,
  list: (filters: PlantFilters) => [...plantKeys.lists(), filters] as const,
  details: () => [...plantKeys.all, "detail"] as const,
  detail: (id: string) => [...plantKeys.details(), id] as const,
};

// Fetch hook
export function usePlants(filters: PlantFilters) {
  return useQuery({
    queryKey: plantKeys.list(filters),
    queryFn: () => fetchPlants(filters),
  });
}

// Detail hook
export function usePlant(id: string) {
  return useQuery({
    queryKey: plantKeys.detail(id),
    queryFn: () => fetchPlant(id),
    enabled: !!id,
  });
}

// Mutation hook with cache invalidation
export function useCreatePlant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createPlant,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: plantKeys.lists() });
    },
  });
}
```

Rules:
- **Query key factory**: Define a `*Keys` object per resource for consistent key management.
- **One hook per operation**: `useX` for reads, `useCreateX` / `useUpdateX` / `useDeleteX` for writes.
- **Invalidation over manual cache updates**: After a mutation, invalidate relevant queries so TanStack refetches fresh data. Only use optimistic updates when the UX demands it (e.g. toggling a like).
- **`enabled` flag**: Use `enabled: !!id` (or similar) to prevent queries from running with missing parameters.
- **Error and loading states**: Always handle `isPending`, `isError`, and `data` in the component.
- **Stale time**: Set `staleTime` when data doesn't change often (e.g. `staleTime: 5 * 60 * 1000` for 5 minutes).
- **Place hooks in `hooks/`** directory, one file per resource (e.g. `hooks/use-plants.ts`, `hooks/use-sessions.ts`).

### 4. Build the component

Compose shadcn/ui components with TanStack Query hooks:

```tsx
"use client";

import { usePlants } from "@/hooks/use-plants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function PlantList() {
  const { data: plants, isPending, isError, error } = usePlants({});

  if (isPending) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return <p className="text-destructive">Error: {error.message}</p>;
  }

  return (
    <div className="space-y-3">
      {plants.map((plant) => (
        <Card key={plant.id}>
          <CardHeader>
            <CardTitle>{plant.name}</CardTitle>
          </CardHeader>
          <CardContent>{plant.description}</CardContent>
        </Card>
      ))}
    </div>
  );
}
```

Rules:
- **Loading**: Use `Skeleton` from shadcn/ui, not spinners or plain text.
- **Errors**: Show user-friendly messages styled with `text-destructive`.
- **Empty state**: Handle when `data` is an empty array — show a message or CTA.
- **Tailwind**: Use utility classes for layout. Use `space-y-*`, `gap-*`, `flex`, `grid` for spacing.
- **"use client"**: Add at the top of any component that uses hooks (TanStack Query, useState, etc.).
- **Component size**: If a component exceeds ~80 lines, split it into smaller subcomponents.

### 5. Wire up the QueryClientProvider

If this is the first time TanStack Query is used, ensure the provider is set up in the app layout:

```tsx
// app/providers.tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute default
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

```tsx
// app/layout.tsx — wrap children with Providers
import { Providers } from "./providers";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

### 6. Verify

Run the dev server and check for errors:

```bash
cd frontend/my-bun-app && bun dev
```

Run lint:

```bash
cd frontend/my-bun-app && bun lint
```

Run type check:

```bash
cd frontend/my-bun-app && bunx tsc --noEmit
```

If the project has tests:

```bash
cd frontend/my-bun-app && bun test
```

## Guidelines

- **bun for everything**: `bun add`, `bun dev`, `bun build`, `bun test`, `bunx` for one-off commands. Never use npm/yarn/pnpm.
- **shadcn/ui first**: Always prefer a shadcn/ui component over building custom UI. Add new components with `bunx shadcn@latest add <name>`.
- **TanStack Query for server state**: Never store fetched data in `useState` — always use `useQuery`. Use `useState` only for local UI state (form inputs, toggles, modals open/closed).
- **Collocate query keys**: Keep key factories in the same file as the hooks that use them.
- **Type everything**: Define TypeScript types/interfaces for API responses, props, and query hook returns. Avoid `any`.
- **Tailwind for styling**: No CSS modules, no styled-components. Use Tailwind utilities and shadcn/ui's built-in variants.
- **Small components**: One responsibility per component. If it does data fetching AND rendering AND form handling, split it.
- **Follow project conventions**: Check existing code for patterns before creating new ones.
