import { runEnhancementsIndependently } from './auth-session.js';

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  void runEnhancementsIndependently(
    async () => {
      const { initTripContext } = await import('./trip-context.js');
      return initTripContext();
    },
    async () => {
      const { initCountryIsolation } = await import('./country-isolation.js');
      return initCountryIsolation();
    },
    async () => {
      const { initAccountSettings } = await import('./account-settings.js');
      return initAccountSettings();
    },
    async () => {
      const { initTripUi } = await import('./trip-ui.js');
      return initTripUi();
    },
    async () => {
      const { initTripFilterOptions } = await import('./trip-filter-options.js');
      return initTripFilterOptions();
    },
    async () => {
      const { initBackgroundPersonalization } = await import('./background-personalization.js');
      return initBackgroundPersonalization();
    },
    async () => {
      const { initSettingsMergeGuard } = await import('./settings-merge-guard.js');
      return initSettingsMergeGuard();
    },
    async () => {
      const { initTripSaveGuard } = await import('./trip-save-guard.js');
      return initTripSaveGuard();
    },
    async () => {
      const { initItemWorkflowEnhancements } = await import('./item-workflow-enhancements.js');
      return initItemWorkflowEnhancements();
    },
    async () => {
      const { initItemCopyUi } = await import('./item-copy-ui.js');
      return initItemCopyUi();
    },
    async () => {
      const { registerShoppingListServiceWorker } = await import('./pwa-registration.js');
      return registerShoppingListServiceWorker();
    }
  ).then((results) => {
    const labels = ['旅程資料', '國家篩選', '帳號設定', '旅程介面', '旅程篩選選項', '背景個人化', '設定合併保護', '商品旅程儲存', '商品狀態與分頁', '商品跨旅程複製', 'PWA 安裝'];
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`${labels[index]}功能載入失敗:`, result.reason);
      }
    });
  });
}
