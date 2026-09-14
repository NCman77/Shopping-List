import { runEnhancementsIndependently } from './auth-session.js';

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  void runEnhancementsIndependently(
    async () => {
      const { initCountryIsolation } = await import('./country-isolation.js');
      return initCountryIsolation();
    },
    async () => {
      const { initAccountSettings } = await import('./account-settings.js');
      return initAccountSettings();
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
      const { initCountrySaveGuard } = await import('./country-save-guard.js');
      return initCountrySaveGuard();
    },
    async () => {
      const { initItemWorkflowEnhancements } = await import('./item-workflow-enhancements.js');
      return initItemWorkflowEnhancements();
    },
    async () => {
      const { registerShoppingListServiceWorker } = await import('./pwa-registration.js');
      return registerShoppingListServiceWorker();
    }
  ).then((results) => {
    const labels = ['國家篩選', '帳號設定', '背景個人化', '設定合併保護', '商品國家儲存', '商品狀態與分頁', 'PWA 安裝'];
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`${labels[index]}功能載入失敗:`, result.reason);
      }
    });
  });
}
