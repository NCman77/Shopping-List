export function createAuthSessionController({ startSession, stopSession, resetSession, rejectAnonymous }) {
    let activeUserId = null;

    return {
        handleAuthState(user) {
            if (activeUserId) {
                stopSession(activeUserId);
                activeUserId = null;
            }

            resetSession();

            if (!user) {
                return;
            }

            if (user.isAnonymous) {
                rejectAnonymous(user);
                return;
            }

            activeUserId = user.uid;
            startSession(user);
        },
        getActiveUserId() {
            return activeUserId;
        }
    };
}
