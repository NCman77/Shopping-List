import { runEnhancementsIndependently } from './auth-session.js';
import { initMapsModeEnhancements, installMapsSettingsRuntimeGuard } from './maps-mode-enhancements.js';

installMapsSettingsRuntimeGuard();

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
    async () => initMapsModeEnhancements(),
    async () => {
      const { initTripUi } = await import('./trip-ui.js');
      return initTripUi();
    },
    async () => {
      const { initTripFilterOptions } = await import('./trip-filter-options.js');
      return initTripFilterOptions();
    },
    async () => {
      const { initFilterPicker } = await import('./filter-picker.js');
      return initFilterPicker();
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
      await initTripSaveGuard();
      const { initStoreLocationEnhancements } = await import('./store-location-enhancements.js');
      return initStoreLocationEnhancements();
    },
    async () => {
      const { initPriceComparisonEnhancements } = await import('./price-comparison-enhancements.js');
      return initPriceComparisonEnhancements();
    },
    async () => {
      const { initLocationPickerChips } = await import('./location-picker-chips.js');
      return initLocationPickerChips();
    },
    async () => {
      const { initNearbySort } = await import('./nearby-sort.js');
      return initNearbySort();
    },
    async () => {
      const { initItemWorkflowEnhancements } = await import('./item-workflow-enhancements.js');
      return initItemWorkflowEnhancements();
    },
    async () => {
      const { initPhotoUiFixes } = await import('./photo-ui-fixes.js');
      return initPhotoUiFixes();
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
    const labels = ['旅程資料', '國家篩選', '帳號設定', 'Maps 模式', '旅程介面', '旅程篩選選項', '完整篩選選單', '背景個人化', '設定合併保護', '商品旅程儲存與商店位置', '商品比價', '哪裡買下拉選擇', '附近排序', '商品狀態與分頁', '商品照片介面修復', '商品跨旅程複製', 'PWA 安裝'];
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`${labels[index]}功能載入失敗:`, result.reason);
      }
    });
  });
}
