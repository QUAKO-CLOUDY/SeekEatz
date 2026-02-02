/**
 * Feedback form URL constant
 * Update this URL when you have your Google Form link
 */
export const FEEDBACK_FORM_URL = "https://forms.gle/REPLACE_ME";

/**
 * Open feedback form in a new tab
 */
export function openFeedbackForm(): void {
  if (typeof window !== 'undefined') {
    window.open(FEEDBACK_FORM_URL, "_blank", "noopener,noreferrer");
  }
}

