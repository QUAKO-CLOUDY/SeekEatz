# App Review Notes - Account Deletion (Guideline 5.1.1(v))

Account deletion is available in-app for signed-in users.

## Reviewer Steps

1. Open **Settings**.
2. In the **Account** section, tap **Delete Account**.
3. On the Account page, go to the **Delete Account** section.
4. Type `DELETE` and tap **Delete Account**.
5. Confirm the deletion prompt.
6. The account and associated user data are deleted, the user is signed out, and the app returns to sign-in.
7. The sign-in screen shows: **"Your account has been deleted."**

## Data Handling

- User-associated data is deleted where supported (saved meals, logs, favorites, usage events, chat session/message data, subscription records, and profile rows when present).
- Supabase Auth user deletion runs server-side through a protected API route (`/api/account/delete`) using the service role key.
- The service role key is never exposed to the client.

