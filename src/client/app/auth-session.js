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

export function applyCoreHomeShell(documentRef) {
    if (!documentRef) return;

    documentRef.querySelectorAll?.('header p')?.forEach((node) => {
        if (node.textContent?.trim() === 'Shin-chan Style') node.remove?.();
    });

    const addButton = documentRef.getElementById?.('add-item-btn');
    addButton?.classList?.add('fixed');
    addButton?.classList?.remove('absolute');

    const userPanel = documentRef.getElementById?.('user-panel');
    userPanel?.classList?.add('absolute', 'top-4', 'right-4');
    userPanel?.classList?.remove('relative', 'mt-4');

    documentRef.getElementById?.('user-name')?.classList?.add('hidden');
    documentRef.getElementById?.('sign-out-btn')?.classList?.add('hidden');
}

export function runEnhancementsIndependently(...tasks) {
    if (!tasks.length || tasks.some((task) => typeof task !== 'function')) {
        throw new TypeError('Enhancement tasks must be functions.');
    }

    return Promise.allSettled(tasks.map((task) => Promise.resolve().then(task)));
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    applyCoreHomeShell(document);

    void runEnhancementsIndependently(
        async () => {
            const { initHomeUiEnhancements } = await import('./home-ui-enhancements.js');
            return initHomeUiEnhancements();
        },
        async () => {
            const { installDriveUploadRollbackFetch } = await import('./drive-upload-rollback-fetch.js');
            installDriveUploadRollbackFetch(window);
            const { initShoppingListEnhancements } = await import('./app-enhancements.js');
            await initShoppingListEnhancements();
            const { initPhotoThumbnailPersistence } = await import('../photos/photo-thumbnail-persistence.js');
            return initPhotoThumbnailPersistence();
        },
        async () => {
            const { initPhotoVisibilityEnhancements } = await import('./photo-visibility-enhancements.js');
            return initPhotoVisibilityEnhancements();
        },
        async () => {
            const { initPhotoDetailPreviewEnhancements } = await import('../photos/photo-detail-preview-enhancements.js');
            return initPhotoDetailPreviewEnhancements();
        }
    ).then((results) => {
        const [homeUiResult, appResult, photoVisibilityResult, detailPreviewResult] = results;
        if (homeUiResult.status === 'rejected') {
            console.error('首頁介面增強功能載入失敗:', homeUiResult.reason);
        }
        if (appResult.status === 'rejected') {
            console.error('購物清單增強功能載入失敗:', appResult.reason);
        }
        if (photoVisibilityResult.status === 'rejected') {
            console.error('照片顯示修復功能載入失敗:', photoVisibilityResult.reason);
        }
        if (detailPreviewResult.status === 'rejected') {
            console.error('商品詳情照片功能載入失敗:', detailPreviewResult.reason);
        }
    });
}
