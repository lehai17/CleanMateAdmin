# Staff locking and session revocation

Changing staff access now revokes previous sessions permanently. Unlocking allows
the staff member to sign in again; it does not restore an old session. The staff
screen explains this before the action, in Vietnamese and English.

The admin remains responsible for confirming each lock/unlock action. The browser
test creates an isolated staff account, locks it, verifies login is blocked,
unlocks it, verifies the old JWT is still rejected and signs in successfully with
a fresh JWT. See the backend STAFF_SESSION_REVOCATION.md for transaction and
email-code invalidation coverage. No database migration is added by this change.
