import { DEFAULT_COUNTRY } from './travel-country.js';
import { detectLocationDuplicate } from './brand-dictionary-core.js';

const APP_ID = 'japan-shopping-app';

function clean(value) {
  return String(value ?? '').normalize('NFKC').trim();
}

function waitFor(predicate, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const value = predicate();
      if (value) {
        clearInterval(timer);
        resolve(value);
      } else if (Date.now() - started > timeout) {
        clearInterval(timer);
        reject(new Error('等待地點重複檢查初始化逾時。'));
      }
    }, 40);
  });
}

function notify(title, message, type = 'warning') {
  if (typeof window.showMsg === 'function') window.showMsg(title, message, type);
  else console[type === 'error' ? 'error' : 'warn'](`${title}: ${message}`);
}

function ensureConfirmModal(documentRef) {
  if (documentRef.getElementById('location-duplicate-confirm-modal')) return;
  const modal = documentRef.createElement('div');
  modal.id = 'location-duplicate-confirm-modal';
  modal.className = 'fixed inset-0 z-[130] hidden bg-warmBrown/50 backdrop-blur-sm px-4 items-center justify-center';
  modal.innerHTML = `
    <div class="w-full max-w-sm bg-white border-4 border-warmBrown rounded-[2rem] p-5 shadow-[8px_8px_0_rgba(92,64,51,0.3)]">
      <div class="w-11 h-11 rounded-full bg-pastelYellow border-2 border-warmBrown flex items-center justify-center text-warmBrown text-lg mb-3"><i class="fas fa-clone"></i></div>
      <h3 id="location-duplicate-title" class="text-lg font-bold text-warmBrown">可能已存在</h3>
      <p id="location-duplicate-message" class="text-sm text-gray-600 mt-2 leading-relaxed"></p>
      <p id="location-duplicate-reason" class="text-[11px] text-warmBrown/60 mt-2"></p>
      <div class="flex gap-3 mt-5">
        <button id="location-duplicate-cancel" type="button" class="flex-1 py-2.5 rounded-xl border-2 border-warmBrown text-warmBrown font-bold bg-white">取消</button>
        <button id="location-duplicate-confirm" type="button" class="flex-1 py-2.5 rounded-xl border-2 border-warmBrown text-warmBrown font-bold bg-pastelOrange">仍然新增</button>
      </div>
    </div>`;
  documentRef.body.appendChild(modal);
}

export async function initLocationDuplicateGuard({
  documentRef = typeof document !== 'undefined' ? document : null,
  windowRef = typeof window !== 'undefined' ? window : null
} = {}) {
  if (!documentRef || !windowRef) return () => {};
  if (windowRef.__shoppingListLocationDuplicateGuardInitialized) return () => {};
  windowRef.__shoppingListLocationDuplicateGuardInitialized = true;

  await waitFor(() => typeof window.handleAddLocation === 'function');
  const originalAddLocation = window.handleAddLocation;
  ensureConfirmModal(documentRef);

  const [appSdk, authSdk, firestoreSdk] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js')
  ]);
  const app = appSdk.getApps()[0] || appSdk.getApp();
  const auth = authSdk.getAuth(app);
  const db = firestoreSdk.getFirestore(app);
  const { collection, doc, onSnapshot } = firestoreSdk;

  const modal = documentRef.getElementById('location-duplicate-confirm-modal');
  const state = {
    userId: '',
    locations: [],
    brands: [],
    pendingLocation: '',
    settingsUnsub: null,
    brandsUnsub: null
  };

  function activeCountry() {
    return clean(windowRef.shoppingListActiveTrip?.country)
      || clean(windowRef.shoppingListActiveCountry)
      || DEFAULT_COUNTRY;
  }

  function closeWarning() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    state.pendingLocation = '';
  }

  function openWarning(rawLocation, result) {
    state.pendingLocation = rawLocation;
    const location = clean(rawLocation);
    const existing = clean(result.existing) || '既有地點';
    documentRef.getElementById('location-duplicate-title').textContent = `可能已存在「${existing}」`;
    documentRef.getElementById('location-duplicate-message').textContent = `你輸入的是「${location}」。如果確定要保留兩個名稱，仍可繼續新增。`;
    documentRef.getElementById('location-duplicate-reason').textContent = result.kind === 'dictionary'
      ? `品牌字典顯示這兩個名稱屬於同一品牌（${activeCountry()}）。`
      : '日文假名與羅馬字名稱高度相似。';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  function guardedAddLocation(rawLocation) {
    const location = clean(rawLocation);
    if (!location) return originalAddLocation(rawLocation);
    const result = detectLocationDuplicate({
      input: location,
      existingLocations: state.locations,
      brands: state.brands,
      country: activeCountry()
    });

    if (result.kind === 'exact') {
      notify('地點已存在', `「${clean(result.existing) || location}」已經在地點清單中，不會重複新增。`, 'warning');
      return;
    }

    if (result.kind === 'dictionary' || result.kind === 'similar') {
      openWarning(rawLocation, result);
      return;
    }

    originalAddLocation(rawLocation);
  }

  windowRef.handleAddLocation = guardedAddLocation;

  documentRef.getElementById('location-duplicate-cancel')?.addEventListener('click', closeWarning);
  documentRef.getElementById('location-duplicate-confirm')?.addEventListener('click', () => {
    const rawLocation = state.pendingLocation;
    closeWarning();
    if (clean(rawLocation)) originalAddLocation(rawLocation);
  });
  modal.addEventListener('click', (event) => { if (event.target === modal) closeWarning(); });
  documentRef.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.classList.contains('hidden')) closeWarning();
  });

  function subscribeUser(user) {
    state.settingsUnsub?.();
    state.brandsUnsub?.();
    state.settingsUnsub = null;
    state.brandsUnsub = null;
    state.userId = user?.uid || '';
    state.locations = [];
    state.brands = [];
    closeWarning();
    if (!user) return;

    const settingsRef = doc(db, 'artifacts', APP_ID, 'users', user.uid, 'settings', 'preferences');
    const brandCollection = collection(db, 'artifacts', APP_ID, 'users', user.uid, 'brands');
    state.settingsUnsub = onSnapshot(settingsRef, (snapshot) => {
      if (state.userId !== user.uid) return;
      const data = snapshot.exists() ? snapshot.data() : {};
      state.locations = Array.isArray(data.locations) ? [...data.locations] : [];
    }, (error) => console.error('Location duplicate settings listener failed:', error));
    state.brandsUnsub = onSnapshot(brandCollection, (snapshot) => {
      if (state.userId !== user.uid) return;
      state.brands = snapshot.docs.map((brandDoc) => ({ id: brandDoc.id, ...brandDoc.data() }));
    }, (error) => console.error('Location duplicate brand listener failed:', error));
  }

  authSdk.onAuthStateChanged(auth, subscribeUser);
  return () => {
    state.settingsUnsub?.();
    state.brandsUnsub?.();
    if (windowRef.handleAddLocation === guardedAddLocation) windowRef.handleAddLocation = originalAddLocation;
  };
}
