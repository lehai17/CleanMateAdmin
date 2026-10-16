# Customer and cleaner accounts

Admins can open **Account** to search and filter customer/cleaner accounts, view
unfinished order counts and lock/unlock access with a required reason and explicit
confirmation. Staff cannot access this area. Staff administration stays separate.

An access change signs out previous sessions permanently; unlocked users must
sign in again. It does not cancel/reassign jobs or change cash receipts. Review
unfinished work and coordinate with both parties before locking an account.
The reason is retained in the backend audit log. Stale forms refresh the list
without overwriting another administrator's action.

Vietnamese/English and appearance settings apply to this area. Private names,
email addresses and typed reasons retain their original contents. Playwright
covers customer/cleaner lock/unlock, fresh versus old sessions, required reasons,
unfinished-job warnings, staff/direct-route restrictions and stale forms using
the real API and generated test database. See backend/ACCOUNT_MODERATION.md for
the API contract, privacy fields, concurrency and transaction rollback tests.
