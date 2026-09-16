import { runEnhancementsIndependently } from './auth-session.js';

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  void runEnhancementsIndependently(
    async () => {
      const { initClientErrorMonitoring } = await import('./error-monitor.js');
      return initClientErrorMonitoring();
    },
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
      const result = await initAccountSettings();
      const { initRetiredLocationFeatures } = await import('./retired-location-features.js');
      initRetiredLocationFeatures();
      return result;
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
      const { initFilterPicker } = await import('./filter-picker.js');
      return initFilterPicker();
    },
    async () => {
      const { initFilterRenameEnhancements } = await import('./filter-rename-enhancements.js');
      return initFilterRenameEnhancements();
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
      const { initPriceComparisonEnhancements } = await import('./price-comparison-enhancements.js');
      return initPriceComparisonEnhancements();
    },
    async () => {
      const { initLocationPickerChips } = await import('./location-picker-chips.js');
      return initLocationPickerChips();
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
      const { initItemModalLayout } = await import('./item-modal-layout.js');
      return initItemModalLayout();
    },
    async () => {
      const { registerShoppingListServiceWorker } = await import('./pwa-registration.js');
      return registerShoppingListServiceWorker();
    }
  ).then((results) => {
    const labels = ['錯誤監控', '旅程資料', '國家篩選', '帳號設定', '旅程介面', '旅程篩選選項', '完整篩選選單', '分類地點重新命名', '背景個人化', '設定合併保護', '商品旅程儲存', '商品比價', '哪裡買下拉選擇', '商品狀態與分頁', '商品照片介面修復', '商品跨旅程複製', '商品表單固定操作列', 'PWA 安裝'];
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`${labels[index]}功能載入失敗:`, result.reason);
      }
    });
  });
}
