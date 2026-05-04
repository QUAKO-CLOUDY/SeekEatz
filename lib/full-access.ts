export function normalizeEmail(email?: string | null): string | null {
  if (!email) {
    return null;
  }

  const normalized = email.trim().toLowerCase();
  return normalized || null;
}

function parseEmailList(value?: string | null): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => normalizeEmail(entry))
    .filter((entry): entry is string => Boolean(entry));
}

export function getFullAccessEmails(): string[] {
  const configured = [
    ...parseEmailList(process.env.NEXT_PUBLIC_MASTER_LOGIN_EMAIL),
    ...parseEmailList(process.env.NEXT_PUBLIC_APP_REVIEW_LOGIN_EMAIL),
    ...parseEmailList(process.env.MASTER_LOGIN_EMAIL),
    ...parseEmailList(process.env.APP_REVIEW_LOGIN_EMAIL),
  ];

  // Keep reviewer access stable even if env wiring is temporarily missing.
  const defaults = ["reviewer@seekeatz.com"];
  return Array.from(new Set([...configured, ...defaults]));
}

export function isFullAccessEmail(email?: string | null): boolean {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return false;
  }

  return getFullAccessEmails().includes(normalizedEmail);
}

