// STOCKSCAN - Logic xử lý chính (app.js)

// --- BIẾN TOÀN CỤC ---
let currentEmployee = null;
let currentWarehouse = null;
let currentProduct = null;
let localRecords = []; // [{employeeId, employeeName, warehouse, barcode, productName, count1, count2, count3, totalQty, defaultUnit, note, photoBase64, synced, timestamp}]
let employeeList = {}; // Mã NV -> Tên NV
let productCatalog = []; // Danh mục sản phẩm

// Quản lý số lượng đang nhập bằng Numpad ảo
let typedQtyStr = "";
let selectedUnit = "";
let selectedFactor = 1;

// Bản ghi đang chỉnh sửa trong popup
let editingRecordIdx = -1;

// Cấu hình URL API Google Sheet
// HƯỚNG DẪN: Bạn có thể dán đường dẫn Google Apps Script Web App (link /exec) của mình vào ô DEFAULT_SHEET_API_URL dưới đây.
// Khi đó mọi thiết bị mở link Netlify sẽ tự động kết nối đến Google Sheets của bạn mà không cần cài đặt lại!
const DEFAULT_SHEET_API_URL = "https://script.google.com/macros/s/AKfycbwZmsMY3Jq4i6q4RdyHDOImVkyDeLhQZ_RDjbl73O5951mlLOdNxsGaLYzjxY-MHkIR/exec"; 

let sheetApiUrl = localStorage.getItem("sheet_api_url") || DEFAULT_SHEET_API_URL;
if (sheetApiUrl === "<?= scriptUrl ?>" || sheetApiUrl.startsWith("<" + "?")) {
  sheetApiUrl = DEFAULT_SHEET_API_URL;
  localStorage.setItem("sheet_api_url", DEFAULT_SHEET_API_URL);
}
let isDataConnected = false;

// Quản lý Camera Streams & Intervals toàn cục để tránh rò rỉ CPU (đơ/lag Chrome)
let activeCameraStream = null;
let activePhotoStream = null;
let html5QrcodeScanner = null;
let loginScanInterval = null;
let barcodeScanInterval = null;

// Quản lý máy quét CipherLab (Keyboard Wedge)
let barcodeBuffer = "";
let lastKeyTime = Date.now();

// --- KHỞI CHẠY ỨNG DỤNG ---
document.addEventListener("DOMContentLoaded", () => {
  // Tự động cấu hình kết nối từ Link chia sẻ (?url=...)
  const urlParams = new URLSearchParams(window.location.search);
  const queryUrl = urlParams.get("url");
  if (queryUrl && queryUrl.startsWith("https://script.google.com/")) {
    localStorage.setItem("sheet_api_url", queryUrl);
    sheetApiUrl = queryUrl;
    
    // Xóa tham số trên thanh địa chỉ để giữ URL ngắn gọn
    const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
    window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
  }

  // Tải dữ liệu mẫu / offline database
  loadInitialData();
  
  // Thiết lập các sự kiện giao diện
  setupEventListeners();
  
  // Kiểm tra kết nối mạng
  updateNetworkStatus();
  
  // Điền cấu hình URL hiện tại
  if (sheetApiUrl) {
    document.getElementById("sheet-api-url").value = sheetApiUrl;
  }
  
  // Tự động tải từ Google Sheet nếu có mạng
  if (navigator.onLine && sheetApiUrl) {
    fetchDataFromGoogleSheet();
  }

  // Khởi động lắng nghe phím CipherLab / máy quét cầm tay
  setupGlobalScannerListener();
});

// --- TẢI VÀ ĐỒNG BỘ DỮ LIỆU ---

function loadInitialData() {
  const localEmployees = localStorage.getItem("inventory_employees");
  const localProducts = localStorage.getItem("inventory_products");
  const storedRecords = localStorage.getItem("inventory_records");

  if (localEmployees) employeeList = JSON.parse(localEmployees);
  if (localProducts) productCatalog = JSON.parse(localProducts);
  if (storedRecords) localRecords = JSON.parse(storedRecords);
  
  cleanupOldRecords();
}

function updateConnectionStatus(status) {
  isDataConnected = status;
  const badge = document.getElementById("network-badge");
  const text = document.getElementById("network-text");
  
  if (!badge || !text) return;
  
  if (status) {
    badge.className = "badge badge-online";
    text.textContent = "Đã kết nối";
  } else {
    badge.className = "badge badge-offline";
    text.textContent = "Chưa kết nối";
  }
}

async function fetchDataFromGoogleSheet() {
  if (!sheetApiUrl) {
    updateConnectionStatus(false);
    return;
  }
  
  showToast("🔄 Đang tải danh mục từ Google Sheet...", "warning");
  try {
    const response = await fetch(sheetApiUrl + (sheetApiUrl.includes("?") ? "&" : "?") + "action=read_data");
    const data = await response.json();
    
    if (data.success) {
      employeeList = data.employees || {};
      productCatalog = data.products || [];
      
      localStorage.setItem("inventory_employees", JSON.stringify(employeeList));
      localStorage.setItem("inventory_products", JSON.stringify(productCatalog));
      
      showToast("✅ Đã kết nối & Cập nhật dữ liệu Google Sheets!", "success");
      updateConnectionStatus(true);
      
      if (currentEmployee) {
        const name = employeeList[currentEmployee] || currentEmployee;
        document.getElementById("current-user-name").textContent = `${name} (${currentEmployee})`;
      }
      
      // Tự động đồng bộ các bản ghi chưa đồng bộ
      const unsynced = localRecords.some(r => !r.synced);
      if (unsynced && navigator.onLine) {
        document.getElementById("btn-sync-offline").style.display = "block";
        syncUnsyncedRecords();
      }
    } else {
      showToast("❌ Lỗi dữ liệu Google Sheet: " + data.error, "danger");
      updateConnectionStatus(false);
    }
  } catch (err) {
    console.error(err);
    showToast("⚠️ Không kết nối được Google Sheet. Đang chạy chế độ Offline.", "warning");
    updateConnectionStatus(false);
  }
}

function updateNetworkStatus() {
  if (!navigator.onLine) {
    updateConnectionStatus(false);
    document.getElementById("btn-sync-offline").style.display = "none";
  } else {
    if (sheetApiUrl) {
      fetchDataFromGoogleSheet();
    } else {
      updateConnectionStatus(false);
    }
  }
}

window.addEventListener("online", updateNetworkStatus);
window.addEventListener("offline", updateNetworkStatus);

async function syncUnsyncedRecords() {
  if (!sheetApiUrl || !navigator.onLine) return;
  
  const unsyncedRecords = localRecords.filter(r => !r.synced);
  if (unsyncedRecords.length === 0) return;
  
  showToast(`🔄 Đang đồng bộ ${unsyncedRecords.length} bản ghi...`, "warning");
  
  let successCount = 0;
  for (let record of unsyncedRecords) {
    try {
      await fetch(sheetApiUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_scan",
          employeeId: record.employeeId,
          employeeName: record.employeeName,
          warehouse: record.warehouse,
          barcode: record.barcode,
          productName: record.productName,
          count1: record.count1,
          count2: record.count2,
          count3: record.count3,
          totalQty: record.totalQty,
          defaultUnit: record.defaultUnit,
          note: record.note,
          photoBase64: record.photoBase64 || ""
        })
      });
      
      record.synced = true;
      successCount++;
    } catch (err) {
      console.error("Lỗi đồng bộ bản ghi:", err);
    }
  }
  
  localStorage.setItem("inventory_records", JSON.stringify(localRecords));
  renderLogHistory();
  
  if (successCount > 0) {
    showToast(`✅ Đã đồng bộ thành công ${successCount} bản ghi!`, "success");
    document.getElementById("btn-sync-offline").style.display = "none";
  }
}

async function syncDeleteRecordOnSheet(record) {
  if (!sheetApiUrl || !navigator.onLine) return;
  
  try {
    await fetch(sheetApiUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_scan",
        employeeId: record.employeeId,
        employeeName: record.employeeName,
        warehouse: record.warehouse,
        barcode: record.barcode,
        productName: record.productName,
        count1: 0,
        count2: 0,
        count3: 0,
        totalQty: 0,
        defaultUnit: record.defaultUnit,
        note: "Đã xóa dòng kiểm kê",
        photoBase64: ""
      })
    });
  } catch (err) {
    console.error("Không đồng bộ xóa được dòng:", err);
  }
}

// --- THIẾT LẬP CÁC SỰ KIỆN GIAO DIỆN ---
function setupEventListeners() {
  // Màn hình 1: Đăng nhập
  document.getElementById("btn-toggle-login-cam").addEventListener("click", toggleLoginCamera);
  document.getElementById("btn-login-manual").addEventListener("click", loginManual);
  document.getElementById("employee-id-input").addEventListener("keypress", (e) => {
    if (e.key === "Enter") loginManual();
  });
  
  // Không tự động mở camera đăng nhập khi tải trang (chờ người dùng click nút)

  // Màn hình 2: Chọn kho
  document.querySelectorAll(".warehouse-card").forEach(card => {
    card.addEventListener("click", () => {
      const wh = card.getAttribute("data-warehouse");
      selectWarehouse(wh);
    });
  });
  
  document.getElementById("btn-logout").addEventListener("click", logout);
  document.getElementById("btn-logout-scan").addEventListener("click", logout);

  // Màn hình 3: Quét kiểm kê chính
  document.getElementById("btn-back-to-wh").addEventListener("click", backToWarehouseSelection);
  document.getElementById("btn-toggle-camera").addEventListener("click", toggleProductCamera);
  
  // Nút Kính lúp mở Modal Tra cứu sản phẩm thủ công
  document.getElementById("btn-manual-search").addEventListener("click", openProductSearchModal);
  
  // Gõ phím Enter trên ô nhập để thực hiện tìm trực tiếp nhanh (CipherLab)
  // Đã loại bỏ vì barcode-input được set readonly, toàn bộ được xử lý bởi setupGlobalScannerListener

  // Sự kiện nút X xóa nhanh mã vạch
  const barcodeInput = document.getElementById("barcode-input");
  
  const clearBarcodeBtn = document.getElementById("btn-clear-barcode");
  
  barcodeInput.addEventListener("input", () => {
    if (barcodeInput.value.length > 0) {
      clearBarcodeBtn.style.display = "block";
    } else {
      clearBarcodeBtn.style.display = "none";
    }
    
    // Xóa lựa chọn dropdown trái cây nếu người dùng nhập tay trong ô tìm kiếm
    if (currentWarehouse === "Kho trái cây") {
      document.getElementById("fruit-group-select").value = "";
      document.getElementById("fruit-item-select").innerHTML = '<option value="">-- Chọn trái cây --</option>';
      document.getElementById("fruit-item-select").disabled = true;
    }
  });

  const clearBarcode = (e) => {
    if (e) e.preventDefault();
    barcodeInput.value = "";
    clearBarcodeBtn.style.display = "none";
    resetCurrentProductScan();
  };
  clearBarcodeBtn.addEventListener("click", clearBarcode);
  clearBarcodeBtn.addEventListener("touchstart", clearBarcode);

  // Nút Thêm sản phẩm ngoài danh mục thủ công (+)
  document.getElementById("btn-add-temp-product").addEventListener("click", openAddTempProductModal);

  // Bảng phím số ảo Numpad cho việc nhập số lượng kiểm kê
  document.querySelectorAll(".btn-num").forEach(btn => {
    btn.addEventListener("click", () => {
      handleNumpadClick(btn.getAttribute("data-val"));
    });
  });

  // Nút Lưu sản phẩm
  document.getElementById("btn-save-record").addEventListener("click", saveCurrentScan);

  // Sự kiện chọn nhóm & chọn sản phẩm Trái cây ngoài màn chính
  document.getElementById("fruit-group-select").addEventListener("change", handleFruitGroupChange);
  document.getElementById("fruit-item-select").addEventListener("change", handleFruitItemChange);

  // Màn hình 4: Cài đặt
  document.getElementById("btn-settings").addEventListener("click", showSettings);
  document.getElementById("btn-close-settings").addEventListener("click", closeSettings);
  document.getElementById("btn-save-api-url").addEventListener("click", saveApiUrl);
  document.getElementById("btn-clear-local").addEventListener("click", clearLocalLogs);
  document.getElementById("btn-export-csv").addEventListener("click", exportCSV);
  document.getElementById("btn-sync-offline").addEventListener("click", syncUnsyncedRecords);

  // Popup sản phẩm không có danh mục
  document.getElementById("btn-close-not-found").addEventListener("click", closeNotFoundModal);
  document.getElementById("btn-open-photo-cam").addEventListener("click", openPhotoCamera);
  document.getElementById("btn-capture-photo").addEventListener("click", captureProductPhoto);
  document.getElementById("btn-recapture").addEventListener("click", recaptureProductPhoto);
  document.getElementById("photo-file-input").addEventListener("change", handlePhotoFileSelect);
  document.getElementById("btn-save-not-found").addEventListener("click", saveUnidentifiedProduct);

  // Popup Sửa số lượng lịch sử đếm (Nút Cancel / Save)
  document.getElementById("btn-close-edit").addEventListener("click", closeEditHistoryModal);
  document.getElementById("btn-save-edit").addEventListener("click", saveEditedHistoryRecord);

  // Nút ảo Numpad của Modal Sửa số lượng
  document.querySelectorAll(".btn-modal-num").forEach(btn => {
    btn.addEventListener("click", () => {
      handleModalNumpadClick(btn.getAttribute("data-val"));
    });
  });

  // Popup Tra cứu sản phẩm thủ công (2 dropdowns liên kết)
  document.getElementById("btn-close-prod-search").addEventListener("click", closeProductSearchModal);
  document.getElementById("btn-cancel-prod-search").addEventListener("click", closeProductSearchModal);
  document.getElementById("modal-group-select").addEventListener("change", handleModalGroupChange);
  document.getElementById("btn-confirm-prod-search").addEventListener("click", confirmProductSearch);

  // Sự kiện chuyển Tab điều hướng (Scan vs. Lịch sử)
  document.getElementById("tab-btn-scan").addEventListener("click", () => switchTab("scan"));
  document.getElementById("tab-btn-history").addEventListener("click", () => switchTab("history"));
}

// --- LOGIC ĐĂNG NHẬP CAMERA QR & CIPHERLAB ---

function toggleLoginCamera() {
  const wrapper = document.getElementById("login-qr-wrapper");
  const btn = document.getElementById("btn-toggle-login-cam");
  
  if (wrapper.style.display === "none" || wrapper.classList.contains("hidden")) {
    wrapper.style.display = "flex";
    wrapper.classList.remove("hidden");
    btn.innerHTML = "📷 Tắt Camera Quét";
    btn.className = "btn btn-secondary";
    startLoginQRScanner();
  } else {
    wrapper.style.display = "none";
    wrapper.classList.add("hidden");
    btn.innerHTML = "📷 Quét mã QR đăng nhập";
    btn.className = "btn btn-primary";
    stopAllCameraStreams();
  }
}

async function startLoginQRScanner() {
  const video = document.getElementById("login-scanner-video");
  const loginInstructions = document.querySelector("#login-panel .scanner-instructions");
  
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    loginInstructions.innerHTML = "⚠️ Trình duyệt chặn camera di động (Yêu cầu kết nối HTTPS).";
    loginInstructions.style.color = "var(--danger)";
    return;
  }

  try {
    // Sử dụng CAMERA TRƯỚC để quét mã thẻ nhân viên (tiện lợi khi tự quét)
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 400 }, height: { ideal: 400 } }
    });
    activeCameraStream = stream;
    video.srcObject = stream;
    loginInstructions.textContent = "Đang quét QR thẻ nhân viên...";
    
    if (typeof jsQR === "undefined") {
      await loadCDNLibrary("https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js");
    }
    
    // Xóa interval giải mã cũ nếu có để tránh lag bộ nhớ CPU
    if (loginScanInterval) clearInterval(loginScanInterval);
    scanLoginQRFromStream(video);
  } catch (err) {
    console.error(err);
    loginInstructions.textContent = "Không mở được camera. Nhập mã thủ công hoặc quét CipherLab.";
  }
}

function scanLoginQRFromStream(video) {
  if (!activeCameraStream) return;
  
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  
  loginScanInterval = setInterval(() => {
    if (video.paused || video.ended || !activeCameraStream) {
      clearInterval(loginScanInterval);
      return;
    }
    
    if (video.videoWidth > 0) {
      canvas.width = Math.min(320, video.videoWidth); // Giảm size vẽ canvas để tăng tốc xử lý CPU
      canvas.height = Math.min(320, video.videoHeight);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      
      if (typeof jsQR !== "undefined") {
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });
        if (code) {
          const checkId = code.data.trim().toUpperCase();
          if (employeeList[checkId]) {
            clearInterval(loginScanInterval);
            handleLoginSuccess(checkId);
          } else {
            showToast("Mã QR nhân viên không tồn tại!", "danger");
          }
        }
      }
    }
  }, 300);
}

function loginManual() {
  const code = document.getElementById("employee-id-input").value.trim().toUpperCase();
  if (!code) {
    showToast("Vui lòng nhập mã nhân viên!", "danger");
    return;
  }
  handleLoginSuccess(code);
}

function handleLoginSuccess(employeeId) {
  const cleanId = employeeId.trim().toUpperCase();
  const employeeName = employeeList[cleanId];
  if (!employeeName) {
    showToast("Mã nhân viên không tồn tại trong hệ thống!", "danger");
    return;
  }
  
  stopAllCameraStreams();
  cleanupOldRecords();
  
  document.getElementById("employee-id-input").value = "";
  currentEmployee = cleanId;
  
  document.getElementById("current-user-name").textContent = `${employeeName} (${cleanId})`;
  
  document.getElementById("panel-login").classList.add("hidden");
  document.getElementById("panel-warehouse").classList.remove("hidden");
  
  showToast(`Chào mừng ${employeeName}!`, "success");
}

function logout() {
  stopAllCameraStreams();
  
  document.getElementById("employee-id-input").value = "";
  
  if (navigator.onLine && sheetApiUrl) {
    syncUnsyncedRecords(); // Đồng bộ chạy ngầm các bản ghi ngày hôm nay khi thoát
  }
  
  currentEmployee = null;
  currentWarehouse = null;
  
  document.getElementById("panel-warehouse").classList.add("hidden");
  document.getElementById("panel-scan").classList.add("hidden");
  document.getElementById("panel-settings").classList.add("hidden");
  document.getElementById("panel-login").classList.remove("hidden");
  
  // Reset camera UI state
  const wrapper = document.getElementById("login-qr-wrapper");
  const btn = document.getElementById("btn-toggle-login-cam");
  wrapper.style.display = "none";
  wrapper.classList.add("hidden");
  btn.innerHTML = "📷 Quét mã QR đăng nhập";
  btn.className = "btn btn-primary";
}

// --- THIẾT LẬP MÁY QUÉT TOÀN CỤC (CIPHERLAB / HAND SCANNER) ---
function setupGlobalScannerListener() {
  window.addEventListener("keydown", (e) => {
    const activeEl = document.activeElement;
    
    // Nếu đang nhập tay ở các ô cấu hình hoặc ghi chú
    if (activeEl) {
      if (activeEl.id === "sheet-api-url" || activeEl.id === "not-found-note" || activeEl.id === "not-found-name-input" || activeEl.id === "not-found-barcode-input") {
        return;
      }
      // Nếu đang focus vào ô mã vạch (hiện tại readonly nên không nhập trực tiếp được)
      // Vẫn cho phép nhận phím từ CipherLab
      if (activeEl.id === "barcode-input") {
        // Do nothing, let global scanner handle it
      }
      else if (activeEl.classList.contains("input-field") && activeEl.id !== "employee-id-input") {
        return;
      }
    }
    
    const currentTime = Date.now();
    if (currentTime - lastKeyTime > 150) {
      barcodeBuffer = "";
    }
    lastKeyTime = currentTime;
    
    if (e.key === "Enter") {
      if (barcodeBuffer.length > 2) {
        const scannedCode = barcodeBuffer.trim();
        barcodeBuffer = "";
        
        e.preventDefault();
        
        if (!currentEmployee) {
          document.getElementById("employee-id-input").value = scannedCode;
          handleLoginSuccess(scannedCode);
        } else {
          document.getElementById("barcode-input").value = scannedCode;
          // Hiển thị nút X xóa nhanh
          document.getElementById("btn-clear-barcode").style.display = "block";
          handleProductScan(scannedCode);
        }
      }
    } else if (e.key.length === 1) {
      barcodeBuffer += e.key;
    }
  });
}

// --- KHO & ĐƠN VỊ TÍNH ---

function selectWarehouse(warehouseName) {
  currentWarehouse = warehouseName;
  document.getElementById("current-warehouse-title").textContent = warehouseName;
  
  document.getElementById("panel-warehouse").classList.add("hidden");
  document.getElementById("panel-scan").classList.remove("hidden");
  
  resetCurrentProductScan();
  renderLogHistory();
  
  const fruitSection = document.getElementById("fruit-picker-section");
  const barcodeInp = document.getElementById("barcode-input");
  if (warehouseName === "Kho trái cây") {
    fruitSection.classList.remove("hidden");
    buildFruitGroupSelect();
    barcodeInp.setAttribute("inputmode", "numeric");
    barcodeInp.placeholder = "Nhập mã PLU hoặc quét...";
  } else {
    fruitSection.classList.add("hidden");
    barcodeInp.setAttribute("inputmode", "text");
    barcodeInp.placeholder = "Quét mã, nhập mã cân PLU hoặc tên...";
  }
}

function backToWarehouseSelection() {
  stopAllCameraStreams();
  currentWarehouse = null;
  document.getElementById("panel-scan").classList.add("hidden");
  document.getElementById("panel-warehouse").classList.remove("hidden");
}

function buildFruitGroupSelect() {
  const groupSelect = document.getElementById("fruit-group-select");
  const itemSelect = document.getElementById("fruit-item-select");
  
  groupSelect.innerHTML = '<option value="">-- Chọn nhóm --</option>';
  itemSelect.innerHTML = '<option value="">-- Chọn trái cây --</option>';
  itemSelect.disabled = true;
  
  const fruits = productCatalog.filter(p => p.category === "Trái cây");
  
  const groups = new Set();
  fruits.forEach(f => {
    const groupName = f.group ? f.group.trim() : f.name.trim().split(" ")[0];
    if (groupName) groups.add(groupName);
  });
  
  groups.forEach(g => {
    const opt = document.createElement("option");
    opt.value = g;
    opt.textContent = g;
    groupSelect.appendChild(opt);
  });
}

function handleFruitGroupChange() {
  const groupSelect = document.getElementById("fruit-group-select");
  const itemSelect = document.getElementById("fruit-item-select");
  const selectedGroup = groupSelect.value;
  
  itemSelect.innerHTML = '<option value="">-- Chọn trái cây --</option>';
  
  if (!selectedGroup) {
    itemSelect.disabled = true;
    return;
  }
  
  const fruits = productCatalog.filter(p => {
    if (p.category !== "Trái cây") return false;
    const groupName = p.group ? p.group.trim() : p.name.trim().split(" ")[0];
    return groupName === selectedGroup;
  });
  
  itemSelect.disabled = false;
  fruits.forEach(fruit => {
    const opt = document.createElement("option");
    opt.value = fruit.barcode;
    opt.textContent = fruit.name;
    itemSelect.appendChild(opt);
  });
}

function handleFruitItemChange() {
  const itemSelect = document.getElementById("fruit-item-select");
  const barcode = itemSelect.value;
  
  if (barcode) {
    const product = productCatalog.find(p => p.barcode === barcode);
    if (product) {
      loadProductToForm(product, true);
    }
  }
}

// --- BẢNG PHÍM SỐ ẢO (NUMPAD) ---

function handleNumpadClick(val) {
  if (val === "backspace") {
    typedQtyStr = typedQtyStr.slice(0, -1);
  } else if (val === ".") {
    if (typedQtyStr === "") {
      typedQtyStr = "0.";
    } else if (!typedQtyStr.includes(".")) {
      typedQtyStr += ".";
    }
  } else {
    // Nhập số 0-9
    if (typedQtyStr === "0") {
      typedQtyStr = val;
    } else {
      typedQtyStr += val;
    }
  }
  
  document.getElementById("qty-display-val").textContent = typedQtyStr === "" ? "" : typedQtyStr;
}

// --- CAMERA QUÉT VẠCH SẢN PHẨM ---

async function toggleProductCamera() {
  const container = document.getElementById("scanner-viewport-container");
  const video = document.getElementById("scanner-video");
  const btnText = document.querySelector("#btn-toggle-camera span");
  
  if (!container.classList.contains("hidden")) {
    stopAllCameraStreams();
    container.classList.add("hidden");
    btnText.textContent = "Bật Camera";
    return;
  }
  
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast("⚠️ Trình duyệt di động của bạn chặn Camera (Yêu cầu HTTPS).", "danger");
    return;
  }

  container.classList.remove("hidden");
  btnText.textContent = "Tắt Camera";
  
  try {
    let stream;
    try {
      // Ưu tiên camera sau (trên điện thoại)
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } }
      });
    } catch (camErr) {
      // Nếu không có camera sau (ví dụ máy tính laptop), dùng webcam/camera mặc định
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } }
      });
    }
    activeCameraStream = stream;
    video.srcObject = stream;
    
    if (typeof Html5Qrcode === "undefined") {
      await loadCDNLibrary("https://unpkg.com/html5-qrcode");
    }
    
    if (barcodeScanInterval) clearInterval(barcodeScanInterval);
    startBarcodeScanner();
  } catch (err) {
    console.error(err);
    showToast("❌ Không thể mở camera. Vui lòng cấp quyền.", "danger");
    container.classList.add("hidden");
    btnText.textContent = "Bật Camera";
  }
}

function startBarcodeScanner() {
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    const video = document.getElementById("scanner-video");
    
    barcodeScanInterval = setInterval(() => {
      if (!activeCameraStream || video.paused || video.ended) {
        clearInterval(barcodeScanInterval);
        return;
      }
      
      if (video.videoWidth > 0) {
        canvas.width = Math.min(320, video.videoWidth);
        canvas.height = Math.min(240, video.videoHeight);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        if ('BarcodeDetector' in window) {
          const barcodeDetector = new BarcodeDetector({ formats: ['code_128', 'ean_13', 'ean_8', 'qr_code', 'upc_a'] });
          barcodeDetector.detect(canvas)
            .then(barcodes => {
              if (barcodes.length > 0) {
                // Quét thành công!
                const code = barcodes[0].rawValue;
                handleProductScan(code);
                
                // TỰ ĐỘNG TẮT CAMERA LẬP TỨC
                stopAllCameraStreams();
                document.getElementById("scanner-viewport-container").classList.add("hidden");
                document.querySelector("#btn-toggle-camera span").textContent = "Bật Camera";
              }
            })
            .catch(err => console.error(err));
        }
      }
    }, 400);
  } catch (e) {
    console.log("Scanner error:", e);
  }
}

// --- TRA CỨU SẢN PHẨM & NẠP FORM ---

// Hàm quickSearchProduct đã bị xóa vì barcode-input là readonly và toàn bộ thao tác do handleProductScan và setupGlobalScannerListener xử lý.

function handleProductScan(barcode) {
  const searchLower = barcode.toLowerCase();
  
  // 1. Tìm chính xác theo mã vạch
  let product = productCatalog.find(p => p.barcode === barcode);
  
  // 2. Tìm theo mã cân PLU (đối với Trái cây)
  if (!product) {
    product = productCatalog.find(p => p.plu === barcode);
  }
  
  // 3. Tìm tương đối theo tên sản phẩm
  if (!product) {
    product = productCatalog.find(p => p.name.toLowerCase().includes(searchLower));
  }
  
  if (product) {
    loadProductToForm(product);
  } else {
    openNotFoundModal(barcode);
  }
}

function loadProductToForm(product, fromDropdown = false) {
  currentProduct = product;
  document.getElementById("barcode-input").blur();
  
  // Hiển thị nhãn thông tin sản phẩm và ẩn placeholder Chờ quét
  document.getElementById("prod-name").textContent = product.name;
  document.getElementById("prod-name").style.color = "var(--text-primary)";
  document.getElementById("prod-barcode").textContent = `${product.plu ? "Mã PLU: " + product.plu + " | " : ""}Mã vạch: ${product.barcode}`;
  
  const categoryBadge = document.getElementById("prod-category");
  categoryBadge.textContent = product.category;
  categoryBadge.classList.remove("hidden");
  
  if (fromDropdown) {
    document.getElementById("barcode-input").value = "";
    document.getElementById("btn-clear-barcode").style.display = "none";
  } else {
    document.getElementById("barcode-input").value = product.plu || product.barcode;
    document.getElementById("btn-clear-barcode").style.display = "block";
  }

  // Build các nút ĐVT xếp dọc bên phải bảng số
  buildUnitButtons(product);

  // Reset phím ảo về rỗng để bắt đầu nhập mới
  typedQtyStr = "";
  document.getElementById("qty-display-val").textContent = "";
  
  // Đồng bộ dropdown Trái cây
  const groupSelect = document.getElementById("fruit-group-select");
  const itemSelect = document.getElementById("fruit-item-select");
  
  if (product.category === "Trái cây" && !fromDropdown) {
    const groupName = product.group ? product.group.trim() : product.name.trim().split(" ")[0];
    groupSelect.value = groupName;
    handleFruitGroupChange();
    itemSelect.value = product.barcode;
  } else if (!fromDropdown) {
    groupSelect.value = "";
    itemSelect.innerHTML = '<option value="">-- Chọn trái cây --</option>';
    itemSelect.disabled = true;
  }
  
  showToast(`🔍 Đã chọn: ${product.name}`, "success");
}

function buildUnitButtons(product) {
  const column = document.getElementById("uom-button-column");
  column.innerHTML = "";
  
  const unitList = [];
  
  // 1. Thêm ĐVT mặc định gốc
  unitList.push({
    name: product.defaultUnit,
    factor: 1,
    displayName: `${product.defaultUnit} *`
  });
  
  // 2. Thêm các ĐVT quy đổi khác và sắp xếp tăng dần theo hệ số factor
  if (product.units && product.units.length > 0) {
    const extraUnits = [...product.units].sort((a, b) => a.factor - b.factor);
    extraUnits.forEach(u => {
      unitList.push({
        name: u.name,
        factor: u.factor,
        displayName: `${u.name} (${u.factor})`
      });
    });
  }
  
  // Quy tắc ưu tiên theo Kho ban đầu:
  let initialSelectIdx = 0;
  if (currentWarehouse === "Kho thương mại" && unitList.length > 1) {
    initialSelectIdx = unitList.length - 1; // Lấy đơn vị lớn nhất ở cuối danh sách đã sắp xếp
  }
  
  // Tạo các nút ĐVT xếp dọc
  unitList.forEach((unit, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-uom";
    btn.textContent = unit.displayName;
    btn.setAttribute("data-unit", unit.name);
    btn.setAttribute("data-factor", unit.factor);
    
    if (idx === initialSelectIdx) {
      btn.classList.add("selected");
      selectedUnit = unit.name;
      selectedFactor = unit.factor;
      document.getElementById("qty-display-unit").textContent = unit.displayName;
    }
    
    btn.addEventListener("click", () => {
      document.querySelectorAll(".btn-uom").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      
      selectedUnit = unit.name;
      selectedFactor = unit.factor;
      document.getElementById("qty-display-unit").textContent = unit.displayName;
      
      showToast(`Đã đổi sang: ${unit.displayName}`, "success");
    });
    
    column.appendChild(btn);
  });
}

// Trả form nhập liệu về trạng thái chờ quét ban đầu (nhưng Numpad vẫn cố định hiện)
function resetCurrentProductScan() {
  currentProduct = null;
  
  // Reset thông tin sản phẩm về trạng thái chờ
  document.getElementById("prod-name").textContent = "Chờ quét sản phẩm...";
  document.getElementById("prod-name").style.color = "var(--text-secondary)";
  document.getElementById("prod-barcode").textContent = "Vui lòng quét hoặc nhập mã vạch để bắt đầu";
  
  const categoryBadge = document.getElementById("prod-category");
  categoryBadge.classList.add("hidden");
  
  // Reset số lượng hiển thị về rỗng
  typedQtyStr = "";
  document.getElementById("qty-display-val").textContent = "";
  document.getElementById("qty-display-unit").textContent = "-";
  
  // Reset cột ĐVT về nút rỗng mặc định
  const column = document.getElementById("uom-button-column");
  column.innerHTML = '<button class="btn-uom selected" data-unit="default" data-factor="1" disabled>-</button>';
  
  // Reset dropdown trái cây nhóm & item
  const groupSelect = document.getElementById("fruit-group-select");
  const itemSelect = document.getElementById("fruit-item-select");
  if (groupSelect && itemSelect) {
    groupSelect.value = "";
    itemSelect.innerHTML = '<option value="">-- Chọn trái cây --</option>';
    itemSelect.disabled = true;
  }
}

// --- LOGIC LƯU LƯỢT ĐẾM VÀ TỰ PHÂN TUYẾN CHẠY NGẦM ---

function parseCountToDefaultQty(product, countStr) {
  if (!countStr) return 0;
  
  const val = parseFloat(countStr) || 0;
  const cleanStr = countStr.toString().trim();
  
  // Lấy phần chữ ở sau số
  const unitMatch = cleanStr.match(/[a-zA-Z\sÀ-ỹ]+$/);
  const unitName = unitMatch ? unitMatch[0].trim().toLowerCase() : "";
  
  if (!unitName || unitName === product.defaultUnit.toLowerCase()) {
    return val;
  }
  
  // Tìm trong product.units
  if (product.units && product.units.length > 0) {
    const unitObj = product.units.find(u => u.name.toLowerCase() === unitName);
    if (unitObj) {
      return val * unitObj.factor;
    }
  }
  
  return val;
}

// --- LOGIC LƯU LƯỢT ĐẾM VÀ TỰ PHÂN TUYẾN CHẠY NGẦM ---

async function saveCurrentScan() {
  if (!currentProduct) {
    showToast("Vui lòng quét hoặc nhập mã sản phẩm trước khi lưu!", "warning");
    return;
  }
  
  if (!currentEmployee || !currentWarehouse) {
    showToast("Lỗi thông tin nhân viên hoặc kho!", "danger");
    return;
  }
  
  if (typedQtyStr === "") {
    showToast("Vui lòng nhập số lượng kiểm kê!", "warning");
    return;
  }
  const quantity = parseFloat(typedQtyStr) || 0;
  if (quantity <= 0) {
    showToast("Số lượng đếm phải lớn hơn 0!", "warning");
    return;
  }
  
  const qtyStr = quantity + " " + selectedUnit;
  
  // Tìm xem sản phẩm đã có lịch sử đếm nào trong phiên của nhân viên tại kho này chưa
  let recordIdx = localRecords.findIndex(r => 
    r.employeeId === currentEmployee && 
    r.warehouse === currentWarehouse && 
    r.barcode === currentProduct.barcode
  );
  
  const employeeName = employeeList[currentEmployee] || currentEmployee;
  let rec;
  
  if (recordIdx !== -1) {
    rec = localRecords[recordIdx];
    
    // Logic tự phân tuyến chạy ngầm vào các slot trống
    if (!rec.count1) {
      rec.count1 = qtyStr;
      rec.timestamp1 = new Date().toISOString();
    } else if (!rec.count2) {
      rec.count2 = qtyStr;
      rec.timestamp2 = new Date().toISOString();
    } else if (!rec.count3) {
      rec.count3 = qtyStr;
      rec.timestamp3 = new Date().toISOString();
    } else {
      // Cả 3 slot đều đã đầy -> Cộng dồn vào Lần 3
      rec.count3 = rec.count3 + " + " + qtyStr;
      rec.timestamp3 = new Date().toISOString();
    }
  } else {
    // Lần đầu đếm sản phẩm này -> Gán vào Lần 1
    rec = {
      employeeId: currentEmployee,
      employeeName: employeeName,
      warehouse: currentWarehouse,
      barcode: currentProduct.barcode,
      productName: currentProduct.name,
      count1: qtyStr,
      timestamp1: new Date().toISOString(),
      count2: "",
      count3: "",
      totalQty: 0,
      defaultUnit: currentProduct.defaultUnit,
      note: "",
      photoBase64: "",
      synced: false,
      timestamp: new Date().toISOString()
    };
    localRecords.push(rec);
  }
  
  // Tính tổng số lượng quy đổi về ĐVT mặc định gốc
  const q1 = parseCountToDefaultQty(currentProduct, rec.count1);
  const q2 = parseCountToDefaultQty(currentProduct, rec.count2);
  let q3 = 0;
  if (rec.count3) {
    const parts = rec.count3.split("+");
    parts.forEach(p => {
      q3 += parseCountToDefaultQty(currentProduct, p.trim());
    });
  }
  rec.totalQty = q1 + q2 + q3;
  rec.synced = false;
  rec.timestamp = new Date().toISOString();
  
  localStorage.setItem("inventory_records", JSON.stringify(localRecords));
  
  // Cập nhật danh sách hiển thị
  renderLogHistory();
  
  showToast(`💾 Đã lưu: ${qtyStr}`, "success");
  
  // Đồng bộ lên Sheets ngay lập tức
  if (navigator.onLine && sheetApiUrl) {
    syncUnsyncedRecords();
  }
  
  // TỰ ĐỘNG RESET FORM VỀ TRẮNG ĐỂ SẴN SÀNG CHO LẦN QUÉT KẾ TIẾP
  const barcodeInp = document.getElementById("barcode-input");
  barcodeInp.value = "";
  document.getElementById("btn-clear-barcode").style.display = "none";
  resetCurrentProductScan();
}

// --- POPUP CHỈNH SỬA SỐ LƯỢNG LỊCH SỬ ---

let editingSlot = null; // 1, 2, 3
let editingSubIdx = undefined;
let editTypedQtyStr = "";

function openEditHistoryModal(barcode, slot, subIdx) {
  editingRecordIdx = localRecords.findIndex(r => 
    r.employeeId === currentEmployee && 
    r.warehouse === currentWarehouse && 
    r.barcode === barcode
  );
  
  if (editingRecordIdx === -1) return;
  const record = localRecords[editingRecordIdx];
  
  editingSlot = slot;
  editingSubIdx = subIdx;
  
  document.getElementById("edit-prod-name").textContent = record.productName;
  document.getElementById("edit-prod-barcode").textContent = `Mã vạch: ${record.barcode}`;
  
  // Lấy giá trị của slot hiện tại
  let currentVal = "Trống";
  if (slot === 1) currentVal = record.count1 || "Trống";
  else if (slot === 2) currentVal = record.count2 || "Trống";
  else if (slot === 3) {
    if (subIdx !== undefined && record.count3) {
      const parts = record.count3.split("+");
      currentVal = parts[subIdx] ? parts[subIdx].trim() : "Trống";
    } else {
      currentVal = record.count3 || "Trống";
    }
  }
  document.getElementById("edit-prod-current-val").textContent = currentVal;
  
  // Tách số lượng và đơn vị từ giá trị hiện tại để đặt mặc định
  let initialQty = "";
  let initialUnit = record.defaultUnit;
  if (currentVal !== "Trống") {
    const parts = currentVal.trim().split(" ");
    if (parts.length >= 1) initialQty = parts[0];
    if (parts.length >= 2) initialUnit = parts[1];
  }
  
  editTypedQtyStr = "";
  document.getElementById("edit-new-qty-input").value = editTypedQtyStr;
  
  // Tạo danh sách đơn vị tính
  const uomSelect = document.getElementById("edit-new-uom-select");
  uomSelect.innerHTML = "";
  
  const product = productCatalog.find(p => p.barcode === barcode) || { defaultUnit: record.defaultUnit, units: [] };
  
  // 1. ĐVT mặc định
  const optDefault = document.createElement("option");
  optDefault.value = product.defaultUnit;
  optDefault.textContent = product.defaultUnit;
  if (product.defaultUnit === initialUnit) optDefault.selected = true;
  uomSelect.appendChild(optDefault);
  
  // 2. Các ĐVT quy đổi khác
  if (product.units) {
    product.units.forEach(u => {
      const opt = document.createElement("option");
      opt.value = u.name;
      opt.textContent = u.name;
      if (u.name === initialUnit) opt.selected = true;
      uomSelect.appendChild(opt);
    });
  }
  
  document.getElementById("modal-edit-history").classList.add("show");
}

function closeEditHistoryModal() {
  document.getElementById("modal-edit-history").classList.remove("show");
  editingRecordIdx = -1;
  editingSlot = null;
  editingSubIdx = undefined;
}

function handleModalNumpadClick(val) {
  if (val === "backspace") {
    editTypedQtyStr = editTypedQtyStr.slice(0, -1);
  } else if (val === ".") {
    if (editTypedQtyStr === "") {
      editTypedQtyStr = "0.";
    } else if (!editTypedQtyStr.includes(".")) {
      editTypedQtyStr += ".";
    }
  } else {
    if (editTypedQtyStr === "0") {
      editTypedQtyStr = val;
    } else {
      editTypedQtyStr += val;
    }
  }
  document.getElementById("edit-new-qty-input").value = editTypedQtyStr;
}

async function saveEditedHistoryRecord() {
  if (editingRecordIdx === -1 || editingSlot === null) return;
  
  const rec = localRecords[editingRecordIdx];
  const newQtyVal = document.getElementById("edit-new-qty-input").value.trim();
  if (newQtyVal === "") {
    showToast("Vui lòng nhập số lượng mới!", "warning");
    return;
  }
  const newUom = document.getElementById("edit-new-uom-select").value;
  
  const isDeletion = parseFloat(newQtyVal) <= 0;
  
  let newQtyStr = isDeletion ? "" : (parseFloat(newQtyVal) + " " + newUom);
  
  if (editingSlot === 1) {
    rec.count1 = newQtyStr;
    if (!newQtyStr) rec.timestamp1 = "";
    else rec.timestamp1 = new Date().toISOString();
  } else if (editingSlot === 2) {
    rec.count2 = newQtyStr;
    if (!newQtyStr) rec.timestamp2 = "";
    else rec.timestamp2 = new Date().toISOString();
  } else if (editingSlot === 3) {
    if (editingSubIdx !== undefined && rec.count3) {
      const parts = rec.count3.split("+").map(p => p.trim());
      if (isDeletion) {
        parts.splice(editingSubIdx, 1);
      } else {
        parts[editingSubIdx] = newQtyStr;
      }
      rec.count3 = parts.join(" + ").trim();
    } else {
      rec.count3 = newQtyStr;
    }
    if (!rec.count3) rec.timestamp3 = "";
    else rec.timestamp3 = new Date().toISOString();
  }
  
  // Quy đổi tổng số lượng về ĐVT mặc định gốc
  const product = productCatalog.find(p => p.barcode === rec.barcode) || { defaultUnit: rec.defaultUnit, units: [] };
  const q1 = parseCountToDefaultQty(product, rec.count1);
  const q2 = parseCountToDefaultQty(product, rec.count2);
  let q3 = 0;
  if (rec.count3) {
    const parts = rec.count3.split("+");
    parts.forEach(p => {
      q3 += parseCountToDefaultQty(product, p.trim());
    });
  }
  
  rec.totalQty = q1 + q2 + q3;
  rec.synced = false;
  rec.timestamp = new Date().toISOString();
  
  // Nếu cả 3 slot đều trống -> Xóa dòng hoàn toàn
  if (!rec.count1 && !rec.count2 && !rec.count3) {
    const deletedRecord = localRecords.splice(editingRecordIdx, 1)[0];
    localStorage.setItem("inventory_records", JSON.stringify(localRecords));
    
    if (currentProduct && currentProduct.barcode === rec.barcode) {
      resetCurrentProductScan();
    }
    
    closeEditHistoryModal();
    renderLogHistory();
    showToast(`🗑️ Đã xóa bản ghi của ${rec.productName}!`, "warning");
    
    if (navigator.onLine && sheetApiUrl) {
      await syncDeleteRecordOnSheet(deletedRecord);
    }
    return;
  }
  
  localStorage.setItem("inventory_records", JSON.stringify(localRecords));
  
  closeEditHistoryModal();
  renderLogHistory();
  showToast("✏️ Đã lưu cập nhật số lượng!", "success");
  
  if (navigator.onLine && sheetApiUrl) {
    syncUnsyncedRecords();
  }
}

async function deleteHistoryRecord(barcode, slot, subIdx) {
  const idx = localRecords.findIndex(r => 
    r.employeeId === currentEmployee && 
    r.warehouse === currentWarehouse && 
    r.barcode === barcode
  );
  
  if (idx === -1) return;
  const rec = localRecords[idx];
  
  let countName = `Lần ${slot}`;
  if (slot === 3 && subIdx !== undefined) countName = `Lần 3 (lượt ${subIdx+1})`;
  
  if (confirm(`Bạn có chắc muốn xóa lượt kiểm kê ${countName} của sản phẩm:\n"${rec.productName}"?`)) {
    if (slot === 1) {
      rec.count1 = "";
      rec.timestamp1 = "";
    } else if (slot === 2) {
      rec.count2 = "";
      rec.timestamp2 = "";
    } else if (slot === 3) {
      if (subIdx !== undefined && rec.count3) {
        const parts = rec.count3.split("+").map(p => p.trim());
        parts.splice(subIdx, 1);
        rec.count3 = parts.join(" + ").trim();
      } else {
        rec.count3 = "";
      }
      if (!rec.count3) rec.timestamp3 = "";
    }
    
    // Quy đổi tổng số lượng về ĐVT mặc định gốc
    const product = productCatalog.find(p => p.barcode === rec.barcode) || { defaultUnit: rec.defaultUnit, units: [] };
    const q1 = parseCountToDefaultQty(product, rec.count1);
    const q2 = parseCountToDefaultQty(product, rec.count2);
    let q3 = 0;
    if (rec.count3) {
      const parts = rec.count3.split("+");
      parts.forEach(p => {
        q3 += parseCountToDefaultQty(product, p.trim());
      });
    }
    
    rec.totalQty = q1 + q2 + q3;
    rec.synced = false;
    rec.timestamp = new Date().toISOString();
    
    // Nếu cả 3 slot đều trống -> Xóa dòng hoàn toàn
    if (!rec.count1 && !rec.count2 && !rec.count3) {
      const deletedRecord = localRecords.splice(idx, 1)[0];
      localStorage.setItem("inventory_records", JSON.stringify(localRecords));
      
      if (currentProduct && currentProduct.barcode === barcode) {
        resetCurrentProductScan();
      }
      
      renderLogHistory();
      showToast(`🗑️ Đã xóa sản phẩm khỏi danh sách!`, "warning");
      
      if (navigator.onLine && sheetApiUrl) {
        await syncDeleteRecordOnSheet(deletedRecord);
      }
      return;
    }
    
    localStorage.setItem("inventory_records", JSON.stringify(localRecords));
    renderLogHistory();
    showToast(`🗑️ Đã xóa lượt kiểm kê ${countName}!`, "warning");
    
    if (navigator.onLine && sheetApiUrl) {
      syncUnsyncedRecords();
    }
  }
}

// --- RENDER DANH SÁCH LỊCH SỬ (MỚI NHẤT TRÊN CÙNG - 1 DÒNG SIÊU GỌN) ---

function renderLogHistory() {
  const logList = document.getElementById("recent-log-list");
  const previewLogList = document.getElementById("preview-log-list");
  const badge = document.getElementById("records-count-badge");
  
  logList.innerHTML = "";
  if (previewLogList) {
    previewLogList.innerHTML = "";
  }
  
  const filtered = localRecords.filter(r => 
    r.employeeId === currentEmployee && 
    r.warehouse === currentWarehouse
  );
  
  // Phân rã (Flatten) các lượt đếm của từng record thành các dòng quét độc lập
  const activeScans = [];
  filtered.forEach(rec => {
    if (rec.count1) {
      activeScans.push({
        barcode: rec.barcode,
        productName: rec.productName,
        qtyStr: rec.count1,
        slot: 1,
        subIdx: null,
        timestamp: rec.timestamp1 || rec.timestamp,
        synced: rec.synced,
        record: rec
      });
    }
    if (rec.count2) {
      activeScans.push({
        barcode: rec.barcode,
        productName: rec.productName,
        qtyStr: rec.count2,
        slot: 2,
        subIdx: null,
        timestamp: rec.timestamp2 || rec.timestamp,
        synced: rec.synced,
        record: rec
      });
    }
    if (rec.count3) {
      const parts = rec.count3.split("+");
      parts.forEach((p, idx) => {
        if (p.trim()) {
          activeScans.push({
            barcode: rec.barcode,
            productName: rec.productName,
            qtyStr: p.trim(),
            slot: 3,
            subIdx: idx,
            timestamp: rec.timestamp3 || rec.timestamp,
            synced: rec.synced,
            record: rec
          });
        }
      });
    }
  });
  
  badge.textContent = `${activeScans.length} lượt`;
  
  if (activeScans.length === 0) {
    const emptyMsg = `<div style="text-align:center; padding: 20px; color: var(--text-secondary); font-size: 0.8rem;">Chưa có sản phẩm nào được kiểm kê trong kho này.</div>`;
    logList.innerHTML = emptyMsg;
    if (previewLogList) {
      previewLogList.innerHTML = emptyMsg;
    }
    return;
  }
  
  // SẮP XẾP: Mới nhất lên đầu (timestamp giảm dần)
  activeScans.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  activeScans.forEach((scan, index) => {
    const isUnsynced = !scan.record.synced;
    const syncIndicator = isUnsynced 
      ? `<span style="color: var(--warning); background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.25); padding: 1px 6px; border-radius: 4px; font-size: 0.65rem; font-weight: 600; white-space: nowrap; flex-shrink: 0;">⏳ Chờ sync</span>` 
      : `<span style="color: var(--success); background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.25); padding: 1px 6px; border-radius: 4px; font-size: 0.65rem; font-weight: 600; white-space: nowrap; flex-shrink: 0;">✓ Đã lưu</span>`;
    
    // Định dạng giờ lưu
    let timeStr = "";
    try {
      const d = new Date(scan.timestamp);
      timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
    } catch (e) {
      timeStr = "Không rõ";
    }
    
    const subIdxParam = scan.subIdx !== null ? scan.subIdx : 'undefined';
    
    const itemHtml = `
      <div style="display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0;">
        <span class="log-item-name" style="font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; font-size: 0.92rem; width: 100%;">${scan.productName}</span>
        <span class="log-item-details" style="font-size: 0.72rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; width: 100%;">Mã: ${scan.barcode} | L${scan.slot}${scan.subIdx !== null ? '-' + (scan.subIdx+1) : ''} | Lúc ${timeStr}</span>
        <div style="display: flex; align-items: center; margin-top: 1px;">
          ${syncIndicator}
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 12px; margin-left: 12px;">
        <div style="text-align: right; min-width: 70px; display: flex; flex-direction: column; justify-content: center; gap: 1px;">
          <span class="log-item-total" style="font-weight: 700; color: var(--success); font-size: 1.05rem; display:block; line-height: 1.1; white-space: nowrap;">${scan.qtyStr}</span>
        </div>
        <div style="display: flex; gap: 4px;">
          <button class="btn-icon-action btn-log-edit" onclick="openEditHistoryModal('${scan.barcode}', ${scan.slot}, ${subIdxParam})" title="Sửa lượt quét" style="background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 8px; width: 34px; height: 34px; display: flex; justify-content: center; align-items: center; cursor: pointer; color: #a5b4fc; font-size: 0.9rem; padding: 0;">✏️</button>
          <button class="btn-icon-action btn-log-delete" onclick="deleteHistoryRecord('${scan.barcode}', ${scan.slot}, ${subIdxParam})" title="Xóa lượt quét" style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 8px; width: 34px; height: 34px; display: flex; justify-content: center; align-items: center; cursor: pointer; color: #fca5a5; font-size: 0.9rem; padding: 0;">🗑️</button>
        </div>
      </div>
    `;
    
    // Thêm vào danh sách tab Lịch Sử (Full)
    const item = document.createElement("div");
    item.className = "log-item";
    item.innerHTML = itemHtml;
    logList.appendChild(item);
    
    // Thêm vào danh sách xem nhanh ở tab Kiểm Kê (tối đa 6 dòng đầu tiên)
    if (previewLogList && index < 6) {
      const previewItem = document.createElement("div");
      previewItem.className = "log-item";
      previewItem.innerHTML = itemHtml;
      previewLogList.appendChild(previewItem);
    }
  });
}

// --- POPUP CHỤP ẢNH HÀNG NGOÀI DANH MỤC ---

let currentUnidentifiedBarcode = "";
let capturedPhotoBase64 = "";

function openNotFoundModal(barcode) {
  capturedPhotoBase64 = "";
  document.getElementById("barcode-input").blur();
  
  // Tiêu đề mặc định
  document.querySelector("#modal-not-found .modal-title").textContent = "🚨 Hàng hóa không có trong dữ liệu";
  
  document.getElementById("not-found-barcode-input").value = barcode || "";
  document.getElementById("not-found-name-input").value = "";
  document.getElementById("not-found-note").value = "";
  
  stopPhotoCamera();
  document.getElementById("photo-placeholder").classList.remove("hidden");
  document.getElementById("photo-capture-video").classList.add("hidden");
  document.getElementById("photo-canvas").classList.add("hidden");
  document.getElementById("photo-preview").classList.add("hidden");
  document.getElementById("btn-capture-photo").classList.add("hidden");
  document.getElementById("btn-open-photo-cam").classList.remove("hidden");
  document.getElementById("btn-recapture").classList.add("hidden");
  
  document.getElementById("modal-not-found").classList.add("show");
}

function openAddTempProductModal() {
  const barcode = document.getElementById("barcode-input").value.trim();
  openNotFoundModal(barcode);
  
  // Thay đổi tiêu đề khi thêm thủ công ngoài danh mục
  document.querySelector("#modal-not-found .modal-title").textContent = "➕ Thêm sản phẩm ngoài danh mục";
}

function closeNotFoundModal() {
  stopPhotoCamera();
  document.getElementById("modal-not-found").classList.remove("show");
  document.getElementById("barcode-input").value = "";
  document.getElementById("btn-clear-barcode").style.display = "none";
}

async function openPhotoCamera() {
  const video = document.getElementById("photo-capture-video");
  const placeholder = document.getElementById("photo-placeholder");
  const captureBtn = document.getElementById("btn-capture-photo");
  const openBtn = document.getElementById("btn-open-photo-cam");
  
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast("⚠️ Trình duyệt di động của bạn chặn Camera (Yêu cầu HTTPS).", "danger");
    return;
  }
  
  try {
    let stream;
    try {
      // Ưu tiên camera sau (trên điện thoại)
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }
      });
    } catch (camErr) {
      // Nếu lỗi (ví dụ chạy trên laptop không có camera sau), dùng camera mặc định/webcam
      stream = await navigator.mediaDevices.getUserMedia({
        video: true
      });
    }
    activePhotoStream = stream;
    video.srcObject = stream;
    
    placeholder.classList.add("hidden");
    video.classList.remove("hidden");
    captureBtn.classList.remove("hidden");
    openBtn.classList.add("hidden");
  } catch (err) {
    console.error(err);
    showToast("Không thể khởi động camera sau để chụp ảnh.", "danger");
  }
}

function captureProductPhoto() {
  const video = document.getElementById("photo-capture-video");
  const canvas = document.getElementById("photo-canvas");
  const preview = document.getElementById("photo-preview");
  const captureBtn = document.getElementById("btn-capture-photo");
  const recaptureBtn = document.getElementById("btn-recapture");
  
  if (!activePhotoStream) return;
  
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  capturedPhotoBase64 = canvas.toDataURL("image/jpeg", 0.75);
  
  preview.src = capturedPhotoBase64;
  preview.classList.remove("hidden");
  video.classList.add("hidden");
  
  captureBtn.classList.add("hidden");
  recaptureBtn.classList.remove("hidden");
  
  stopPhotoCamera();
}

function recaptureProductPhoto() {
  document.getElementById("photo-preview").classList.add("hidden");
  document.getElementById("btn-recapture").classList.add("hidden");
  openPhotoCamera();
}

function handlePhotoFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    capturedPhotoBase64 = e.target.result;
    
    const preview = document.getElementById("photo-preview");
    const placeholder = document.getElementById("photo-placeholder");
    const video = document.getElementById("photo-capture-video");
    const captureBtn = document.getElementById("btn-capture-photo");
    const recaptureBtn = document.getElementById("btn-recapture");
    
    preview.src = capturedPhotoBase64;
    preview.classList.remove("hidden");
    placeholder.classList.add("hidden");
    video.classList.add("hidden");
    captureBtn.classList.add("hidden");
    recaptureBtn.classList.remove("hidden");
    
    stopPhotoCamera();
  };
  reader.readAsDataURL(file);
}

function stopPhotoCamera() {
  if (activePhotoStream) {
    activePhotoStream.getTracks().forEach(track => track.stop());
    activePhotoStream = null;
  }
}

async function saveUnidentifiedProduct() {
  const barcodeText = document.getElementById("not-found-barcode-input").value.trim().toUpperCase();
  const tempName = document.getElementById("not-found-name-input").value.trim();
  const noteText = document.getElementById("not-found-note").value.trim();
  
  if (!barcodeText) {
    showToast("Vui lòng nhập mã vạch sản phẩm!", "danger");
    return;
  }
  
  if (!tempName) {
    showToast("Vui lòng nhập tên tạm sản phẩm!", "danger");
    return;
  }
  
  const employeeName = employeeList[currentEmployee] || currentEmployee;
  
  const rec = {
    employeeId: currentEmployee,
    employeeName: employeeName,
    warehouse: currentWarehouse || "Chưa chọn kho",
    barcode: barcodeText,
    productName: `[TẠM] ${tempName}`,
    count1: "1 cái",
    count2: "",
    count3: "",
    totalQty: 1,
    defaultUnit: "cái",
    note: noteText || "Hàng không có trong dữ liệu, đã chụp ảnh kiểm tra",
    photoBase64: capturedPhotoBase64,
    synced: false,
    timestamp: new Date().toISOString()
  };
  
  localRecords.push(rec);
  localStorage.setItem("inventory_records", JSON.stringify(localRecords));
  
  renderLogHistory();
  closeNotFoundModal();
  
  showToast("🚨 Đã lưu thông tin sản phẩm ngoài danh mục!", "warning");
  
  if (navigator.onLine && sheetApiUrl) {
    syncUnsyncedRecords();
  }
}

// --- TOAST & SETTINGS ---

function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  
  let icon = "🔔";
  if (type === "success") icon = "✅";
  if (type === "warning") icon = "⚠️";
  if (type === "danger") icon = "❌";
  
  toast.innerHTML = `<span class="toast-icon">${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);
  
  container.classList.add("show");
  
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-10px)";
    toast.style.transition = "all 0.5s ease";
    setTimeout(() => {
      toast.remove();
      if (container.children.length === 0) {
        container.classList.remove("show");
      }
    }, 500);
  }, 2500);
}

// --- POPUP TRA CỨU SẢN PHẨM THỦ CÔNG (KÍNH LÚP) ---

function openProductSearchModal() {
  const modal = document.getElementById("modal-product-search");
  const groupSelect = document.getElementById("modal-group-select");
  const itemSelect = document.getElementById("modal-item-select");
  
  groupSelect.innerHTML = '<option value="">-- Chọn nhóm --</option>';
  itemSelect.innerHTML = '<option value="">-- Chọn sản phẩm --</option>';
  itemSelect.disabled = true;
  
  // Xác định nhóm sản phẩm của kho hiện tại
  let targetCategory = "";
  if (currentWarehouse === "Kho thương mại" || currentWarehouse === "Kho bán hàng") {
    targetCategory = "Thương mại";
  } else if (currentWarehouse === "Kho trái cây") {
    targetCategory = "Trái cây";
  } else if (currentWarehouse === "Kho bao bì") {
    targetCategory = "Bao bì";
  } else if (currentWarehouse === "Kho nguyên vật liệu") {
    targetCategory = "Nguyên vật liệu";
  }
  
  // Lọc sản phẩm trong catalog thuộc kho này
  const filteredProducts = productCatalog.filter(p => p.category === targetCategory);
  
  // Tạo danh sách nhóm
  const groups = new Set();
  filteredProducts.forEach(p => {
    const groupName = p.group ? p.group.trim() : p.name.trim().split(" ")[0];
    if (groupName) groups.add(groupName);
  });
  
  groups.forEach(g => {
    const opt = document.createElement("option");
    opt.value = g;
    opt.textContent = g;
    groupSelect.appendChild(opt);
  });
  
  modal.classList.add("show");
}

function closeProductSearchModal() {
  document.getElementById("modal-product-search").classList.remove("show");
}

function handleModalGroupChange() {
  const groupSelect = document.getElementById("modal-group-select");
  const itemSelect = document.getElementById("modal-item-select");
  const selectedGroup = groupSelect.value;
  
  itemSelect.innerHTML = '<option value="">-- Chọn sản phẩm --</option>';
  
  if (!selectedGroup) {
    itemSelect.disabled = true;
    return;
  }
  
  let targetCategory = "";
  if (currentWarehouse === "Kho thương mại" || currentWarehouse === "Kho bán hàng") {
    targetCategory = "Thương mại";
  } else if (currentWarehouse === "Kho trái cây") {
    targetCategory = "Trái cây";
  } else if (currentWarehouse === "Kho bao bì") {
    targetCategory = "Bao bì";
  } else if (currentWarehouse === "Kho nguyên vật liệu") {
    targetCategory = "Nguyên vật liệu";
  }
  
  const products = productCatalog.filter(p => {
    if (p.category !== targetCategory) return false;
    const groupName = p.group ? p.group.trim() : p.name.trim().split(" ")[0];
    return groupName === selectedGroup;
  });
  
  itemSelect.disabled = false;
  products.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.barcode;
    opt.textContent = p.name;
    itemSelect.appendChild(opt);
  });
}

function confirmProductSearch() {
  const itemSelect = document.getElementById("modal-item-select");
  const barcode = itemSelect.value;
  
  if (!barcode) {
    showToast("Vui lòng chọn sản phẩm!", "warning");
    return;
  }
  
  const product = productCatalog.find(p => p.barcode === barcode);
  if (product) {
    loadProductToForm(product);
    closeProductSearchModal();
  }
}

function showSettings() {
  document.getElementById("panel-settings").classList.remove("hidden");
  
  const qrSection = document.getElementById("settings-qr-section");
  const qrImg = document.getElementById("settings-qr-img");
  if (qrSection && qrImg) {
    if (sheetApiUrl && sheetApiUrl.startsWith("https://script.google.com/")) {
      qrImg.src = "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=" + encodeURIComponent(sheetApiUrl);
      qrSection.style.display = "block";
    } else {
      qrSection.style.display = "none";
    }
  }
}

function closeSettings() {
  document.getElementById("panel-settings").classList.add("hidden");
}

function saveApiUrl() {
  const url = document.getElementById("sheet-api-url").value.trim();
  if (url && !url.startsWith("https://script.google.com/")) {
    showToast("URL Google Apps Script không hợp lệ!", "danger");
    return;
  }
  
  sheetApiUrl = url;
  localStorage.setItem("sheet_api_url", url);
  showToast("Đã lưu URL kết nối Google Sheets!", "success");
  
  if (url) {
    fetchDataFromGoogleSheet();
  }
}

function clearLocalLogs() {
  if (confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử kiểm kê trên thiết bị này không?")) {
    localRecords = [];
    localStorage.setItem("inventory_records", JSON.stringify([]));
    renderLogHistory();
    showToast("Đã xóa sạch lịch sử kiểm kê trên máy này.", "success");
  }
}

function exportCSV() {
  if (localRecords.length === 0) {
    showToast("Không có dữ liệu để xuất!", "warning");
    return;
  }
  
  let csvContent = "\ufeff";
  csvContent += "Mã NV,Tên NV,Kho,Mã vạch,Tên sản phẩm,Lần 1 (ĐVT gốc),Lần 2 (ĐVT gốc),Lần 3 (ĐVT gốc),Tổng số lượng,ĐVT gốc,Ghi chú,Ảnh đính kèm,Thời gian\n";
  
  localRecords.forEach(r => {
    const row = [
      r.employeeId,
      `"${r.employeeName.replace(/"/g, '""')}"`,
      r.warehouse,
      r.barcode,
      `"${r.productName.replace(/"/g, '""')}"`,
      `"${(r.count1 || "").toString().replace(/"/g, '""')}"`,
      `"${(r.count2 || "").toString().replace(/"/g, '""')}"`,
      `"${(r.count3 || "").toString().replace(/"/g, '""')}"`,
      r.totalQty,
      r.defaultUnit,
      `"${(r.note || "").replace(/"/g, '""')}"`,
      r.photoBase64 ? "[Đã chụp ảnh]" : "",
      r.timestamp
    ];
    csvContent += row.join(",") + "\n";
  });
  
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `kiemke_kho_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// --- THU DỌN CAMERA STREAMS & INTERVALS TRÁNH NGHẼN CPU ---

function stopAllCameraStreams() {
  // Clear giải mã intervals ngay lập tức để giải phóng CPU
  if (loginScanInterval) {
    clearInterval(loginScanInterval);
    loginScanInterval = null;
  }
  if (barcodeScanInterval) {
    clearInterval(barcodeScanInterval);
    barcodeScanInterval = null;
  }

  // Dừng mọi Camera tracks
  if (activeCameraStream) {
    activeCameraStream.getTracks().forEach(track => track.stop());
    activeCameraStream = null;
  }
  if (html5QrcodeScanner) {
    try {
      html5QrcodeScanner.clear();
    } catch (e) {}
    html5QrcodeScanner = null;
  }
  stopPhotoCamera();
}

function loadCDNLibrary(url) {
  return new Promise((resolve, reject) => {
    const scripts = document.getElementsByTagName("script");
    for (let i = 0; i < scripts.length; i++) {
      if (scripts[i].src === url) {
        resolve();
        return;
      }
    }
    
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = url;
    script.onload = () => resolve();
    script.onerror = (err) => reject(err);
    document.head.appendChild(script);
  });
}

function switchTab(tabName) {
  const scanBtn = document.getElementById("tab-btn-scan");
  const historyBtn = document.getElementById("tab-btn-history");
  const scanContent = document.getElementById("tab-content-scan");
  const historyContent = document.getElementById("tab-content-history");
  
  if (tabName === "scan") {
    scanBtn.classList.add("active");
    historyBtn.classList.remove("active");
    scanContent.classList.remove("hidden");
    historyContent.classList.add("hidden");
  } else {
    scanBtn.classList.remove("active");
    historyBtn.classList.add("active");
    scanContent.classList.add("hidden");
    historyContent.classList.remove("hidden");
    renderLogHistory(); // Cập nhật danh sách lịch sử khi vào tab
  }
}

function cleanupOldRecords() {
  const todayStr = new Date().toLocaleDateString();
  const originalLength = localRecords.length;
  
  localRecords = localRecords.filter(rec => {
    if (!rec.timestamp) return false;
    const recDateStr = new Date(rec.timestamp).toLocaleDateString();
    return recDateStr === todayStr;
  });
  
  if (localRecords.length !== originalLength) {
    localStorage.setItem("inventory_records", JSON.stringify(localRecords));
  }
}
