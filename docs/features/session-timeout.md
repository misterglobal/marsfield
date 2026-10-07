# Inactivity Session Timeout

## Product Requirement

Authenticated MarsField users are signed out after 30 minutes without activity. A warning appears after 28 minutes and offers a **Continue session** action that resets the inactivity timer.

If an authenticated API request returns `401`, MarsField clears the local session and shows the same friendly sign-in message instead of exposing the backend token error.

## Acceptance Criteria

- Authenticated users receive a warning after 28 minutes of inactivity.
- Selecting **Continue session** dismisses the warning and restarts the 30-minute timer.
- Users are signed out after 30 minutes of inactivity and see: “Your session expired. Please sign in again.”
- Authenticated API `401` responses trigger the same sign-out experience.
- Session activity and sign-out state are synchronized across browser tabs where supported by browser storage events.
- Manual sign-out does not show the expired-session message.

## Non-Goals

- Changing the seven-day JWT expiry.
- Changing API-key authentication or expiry.
- Modifying billing, provider spend, deployment, Docker, Hetzner, or production secrets.

## Components

- `frontend/src/components/SessionTimeout.tsx` owns inactivity tracking and the warning dialog.
- `frontend/src/lib/session.ts` defines shared session constants and browser events.
- `frontend/src/lib/api.ts` centralizes authenticated `401` handling.
- `frontend/src/app/layout.tsx` clears authentication and presents the sign-in message.

## Verification

Playwright coverage verifies warning, continuation, idle sign-out, and authenticated `401` behavior. The standard frontend lint/build and repository test suites remain required in pull-request CI.
