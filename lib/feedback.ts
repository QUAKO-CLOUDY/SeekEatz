import { openExternalUrl } from "@/lib/native-runtime";

/**
 * Feedback form URL constant
 * Update this URL when you have your Google Form link
 */
export const FEEDBACK_FORM_URL = "https://forms.gle/REPLACE_ME";

/**
 * Open feedback form in a new tab
 */
export async function openFeedbackForm(): Promise<void> {
  await openExternalUrl(FEEDBACK_FORM_URL);
}

