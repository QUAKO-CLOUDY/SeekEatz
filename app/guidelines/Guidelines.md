# Project Guidelines & Coding Standards

## 1. Tech Stack Overview
- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v3
- **UI Library:** Shadcn UI (based on Radix Primitives)
- **Backend:** Supabase
- **AI:** OpenAI API

## 2. Core Architecture Principles
### Server vs. Client Components
- **Default to Server Components:** All new components should be Server Components unless they specifically require interactivity (hooks like `useState`, `useEffect`, `onClick`).
- **Client Boundaries:** Add `'use client'` at the very top of the file when needed. Keep client components small and push them down the component tree (leaf nodes).
- **Data Fetching:** Fetch data in Server Components using async/await and pass data down as props.

### File Structure
- **Routes:** Use the Next.js App Router convention (`app/page.tsx`, `app/layout.tsx`, `app/[id]/page.tsx`).
- **UI Components:** Generic, reusable UI elements (Buttons, Inputs) live in `app/components/ui/`.
- **Feature Components:** Business-logic components (e.g., `AIChat.tsx`, `MealCard.tsx`) live in `app/components/`.
- **Hooks/Utils:** Helper functions go in `lib/` or `utils/`. Custom hooks go in `hooks/` (or `components/hooks` if strictly local).

## 3. Styling & Design System
### Tailwind CSS
- **Utility First:** Use utility classes directly in JSX. Avoid `@apply` in CSS files unless creating a global typography base.
- **Class Merging:** Always use the `cn()` utility (clsx + tw-merge) when allowing custom `className` props or conditional styling.
  ```tsx
  <div className={cn("bg-white p-4 rounded-lg", isActive && "border-blue-500", className)}>