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

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    import('./app-enhancements.js')
        .then(({ initShoppingListEnhancements }) => initShoppingListEnhancements())
        .catch((error) => console.error('購物清單增強功能載入失敗:', error));
}
