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

export function runEnhancementsIndependently(homeUiTask, appEnhancementsTask) {
    if (typeof homeUiTask !== 'function' || typeof appEnhancementsTask !== 'function') {
        throw new TypeError('Enhancement tasks must be functions.');
    }

    return Promise.allSettled([
        Promise.resolve().then(homeUiTask),
        Promise.resolve().then(appEnhancementsTask)
    ]);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    void runEnhancementsIndependently(
        async () => {
            const { initHomeUiEnhancements } = await import('./home-ui-enhancements.js');
            return initHomeUiEnhancements();
        },
        async () => {
            const { installDriveUploadRollbackFetch } = await import('./drive-upload-rollback-fetch.js');
            installDriveUploadRollbackFetch(window);
            const { initShoppingListEnhancements } = await import('./app-enhancements.js');
            return initShoppingListEnhancements();
        }
    ).then((results) => {
        const [homeUiResult, appResult] = results;
        if (homeUiResult.status === 'rejected') {
            console.error('首頁介面增強功能載入失敗:', homeUiResult.reason);
        }
        if (appResult.status === 'rejected') {
            console.error('購物清單增強功能載入失敗:', appResult.reason);
        }
    });
}
