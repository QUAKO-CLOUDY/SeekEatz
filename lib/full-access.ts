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
  return [
    ...parseEmailList(process.env.NEXT_PUBLIC_MASTER_LOGIN_EMAIL),
    ...parseEmailList(process.env.NEXT_PUBLIC_APP_REVIEW_LOGIN_EMAIL),
  ];
}

export function isFullAccessEmail(email?: string | null): boolean {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return false;
  }

  return getFullAccessEmails().includes(normalizedEmail);
}

