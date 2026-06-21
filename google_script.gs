/**
 * GOOGLE APPS SCRIPT FOR INVENTORY MANAGEMENT APP (STOCKSCAN)
 * 
 * Hướng dẫn triển khai:
 * 1. Mở Google Sheet của bạn.
 * 2. Chọn Tiện ích mở rộng (Extensions) -> Apps Script.
 * 3. Xóa hết code hiện tại, copy toàn bộ nội dung file này dán vào.
 * 4. Nhấn Lưu (Save - biểu tượng đĩa mềm).
 * 5. Nhấn Triển khai (Deploy) -> Triển khai mới (New deployment).
 * 6. Chọn loại triển khai là "Ứng dụng web" (Web app).
 * 7. Cấu hình:
 *    - Thực thi dưới danh nghĩa: "Tôi" (Me)
 *    - Ai có quyền truy cập: "Bất kỳ ai" (Anyone)
 * 8. Nhấn Triển khai, cấp quyền truy cập nếu Google yêu cầu.
 * 9. Copy URL của ứng dụng web được cấp dán vào phần cài đặt trong App.
 */

const SHEET_INV = "Kết quả kiểm kê";
const SHEET_PROD = "Danh mục sản phẩm";
const SHEET_EMP = "Nhân viên";

/**
 * Xử lý yêu cầu GET: Trả về danh sách sản phẩm, nhân viên và kết quả hiện tại
 */
function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    checkAndCreateSheets(ss);
    
    // Nếu yêu cầu lấy dữ liệu JSON từ App
    if (e && e.parameter && e.parameter.action === "read_data") {
      const employees = getEmployeesData(ss);
      const products = getProductsData(ss);
      const records = getInventoryRecords(ss);
      
      return jsonResponse({
        success: true,
        employees: employees,
        products: products,
        records: records
      });
    }
    
    // Mặc định: Phục vụ trang giao diện HTML Web App của ứng dụng
    let template;
    try {
      template = HtmlService.createTemplateFromFile('Index');
    } catch (err) {
      try {
        template = HtmlService.createTemplateFromFile('index');
      } catch (err2) {
        throw new Error("Không tìm thấy tệp HTML có tên 'Index' hoặc 'index' trong dự án Apps Script. Vui lòng tạo tệp HTML mới và đặt tên là Index hoặc index.");
      }
    }
    template.scriptUrl = ScriptApp.getService().getUrl();
    return template.evaluate()
        .setTitle('STOCKSCAN - Minh Phát Co., Ltd')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
  } catch (err) {
    if (e && e.parameter && e.parameter.action === "read_data") {
      return jsonResponse({ success: false, error: err.toString() });
    }
    return HtmlService.createHtmlOutput("<h2>Lỗi khởi chạy hệ thống STOCKSCAN:</h2><p>" + err.toString() + "</p>");
  }
}

/**
 * Xử lý yêu cầu POST: Ghi nhận kiểm kê hoặc lưu ảnh sản phẩm không có trong danh mục
 */
function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    checkAndCreateSheets(ss);
    
    let postData;
    if (e.postData && e.postData.contents) {
      postData = JSON.parse(e.postData.contents);
    } else {
      postData = e.parameter;
    }
    
    const action = postData.action || "save_scan";
    
    if (action === "save_scan") {
      return saveScanRecord(ss, postData);
    } else if (action === "upload_photo") {
      return uploadPhoto(ss, postData);
    } else {
      return jsonResponse({ success: false, error: "Hành động không hợp lệ" });
    }
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

/**
 * Lưu kết quả quét kiểm kê vào Sheet 1 với dữ liệu đã quy đổi về ĐVT mặc định từ Client
 */
function saveScanRecord(ss, data) {
  const lock = LockService.getScriptLock();
  try {
    // Chờ tối đa 30 giây để lấy khóa, tránh xung đột khi nhiều người ghi đồng thời
    lock.waitLock(30000);
    
    const sheet = ss.getSheetByName(SHEET_INV);
    const employeeId = data.employeeId;
    const employeeName = data.employeeName;
    const warehouse = data.warehouse;
    const barcode = data.barcode;
    const productName = data.productName;
    const count1 = data.count1 || "";
    const count2 = data.count2 || "";
    const count3 = data.count3 || "";
    const totalQty = parseFloat(data.totalQty) || 0;
    const defaultUnit = data.defaultUnit || "";
    const note = data.note || "";
    let photoUrl = data.photoUrl || "";
    
    if (data.photoBase64 && !photoUrl) {
      photoUrl = saveImageToDrive(data.photoBase64, barcode + "_" + new Date().getTime());
    }
    
    // Tìm hàng đã tồn tại (Trùng Mã nhân viên, Kho và Mã vạch)
    const rows = sheet.getDataRange().getValues();
    let foundRowIdx = -1;
    
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] == employeeId && rows[i][2] == warehouse && rows[i][3] == barcode) {
        foundRowIdx = i + 1; // 1-based index
        break;
      }
    }
    
    if (foundRowIdx !== -1) {
      // Có bản ghi trùng -> Cập nhật các cột đếm và tổng số lượng
      sheet.getRange(foundRowIdx, 6).setValue(count1); // Cột F (Lần 1)
      sheet.getRange(foundRowIdx, 7).setValue(count2); // Cột G (Lần 2)
      sheet.getRange(foundRowIdx, 8).setValue(count3); // Cột H (Lần 3)
      sheet.getRange(foundRowIdx, 9).setValue(totalQty);                   // Cột I (Tổng)
      sheet.getRange(foundRowIdx, 10).setValue(defaultUnit);               // Cột J (ĐVT Mặc định)
      if (note) sheet.getRange(foundRowIdx, 11).setValue(note);            // Cột K (Ghi chú)
      if (photoUrl) sheet.getRange(foundRowIdx, 12).setValue(photoUrl);    // Cột L (Ảnh)
      sheet.getRange(foundRowIdx, 13).setValue(new Date());                 // Cột M (Thời gian)
    } else {
      // Chưa tồn tại -> Tạo dòng mới
      sheet.appendRow([
        employeeId,       // A
        employeeName,     // B
        warehouse,        // C
        barcode,          // D
        productName,      // E
        count1,           // F (Lần 1)
        count2,           // G (Lần 2)
        count3,           // H (Lần 3)
        totalQty,         // I (Tổng)
        defaultUnit,      // J (ĐVT gốc)
        note,             // K (Ghi chú)
        photoUrl,         // L (Ảnh)
        new Date()        // M (Thời gian)
      ]);
    }
    
    // TỰ ĐỘNG SẮP XẾP: Nhóm theo nhân viên (Cột A tăng dần), lượt mới nhất lên đầu (Cột M giảm dần)
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, 13).sort([
        { column: 1, ascending: true },  // Sắp theo Mã nhân viên (Cột A)
        { column: 13, ascending: false } // Thời gian mới nhất (Cột M)
      ]);
    }
    
    return jsonResponse({ success: true, message: "Lưu dữ liệu quét thành công" });
  } catch (err) {
    return jsonResponse({ success: false, error: "Xung đột ghi đè: " + err.toString() });
  } finally {
    lock.releaseLock(); // Giải phóng khóa cho yêu cầu tiếp theo
  }
}

/**
 * Lưu ảnh chụp sản phẩm không xác định lên Google Drive
 */
function uploadPhoto(ss, data) {
  const lock = LockService.getScriptLock();
  try {
    // Chờ khóa ghi
    lock.waitLock(30000);
    
    const barcode = data.barcode;
    const photoBase64 = data.photoBase64;
    
    if (!photoBase64) {
      return jsonResponse({ success: false, error: "Không tìm thấy dữ liệu ảnh" });
    }
    
    const photoUrl = saveImageToDrive(photoBase64, "UNIDENTIFIED_" + barcode + "_" + new Date().getTime());
    
    // Lưu log vào sheet Kết quả kiểm kê
    const sheet = ss.getSheetByName(SHEET_INV);
    sheet.appendRow([
      data.employeeId || "UNKNOWN",
      data.employeeName || "Chưa rõ",
      data.warehouse || "Không rõ",
      barcode,
      "[HÀNG NGOÀI DANH MỤC]",
      1,          // Lần 1
      "",         // Lần 2
      "",         // Lần 3
      1,          // Tổng số lượng
      "cái",      // ĐVT Mặc định
      data.note || "Hàng không có trong dữ liệu, đã chụp ảnh",
      photoUrl,
      new Date()
    ]);
    
    // TỰ ĐỘNG SẮP XẾP: Nhóm theo nhân viên (Cột A tăng dần), lượt mới nhất lên đầu (Cột M giảm dần)
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, 13).sort([
        { column: 1, ascending: true },  // Sắp theo Mã nhân viên (Cột A)
        { column: 13, ascending: false } // Thời gian mới nhất (Cột M)
      ]);
    }
    
    return jsonResponse({ success: true, photoUrl: photoUrl, message: "Đã tải ảnh lên thành công" });
  } catch (err) {
    return jsonResponse({ success: false, error: "Xung đột tải ảnh: " + err.toString() });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Helper: Lưu ảnh Base64 lên Google Drive
 */
function saveImageToDrive(base64Data, filename) {
  try {
    const folderName = "Inventory_Photos";
    let folder;
    const folders = DriveApp.getFoldersByName(folderName);
    
    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = DriveApp.createFolder(folderName);
    }
    
    const base64Image = base64Data.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Image), "image/jpeg", filename + ".jpg");
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return file.getUrl();
  } catch (err) {
    Logger.log("Lỗi lưu Drive: " + err.toString());
    return "Lỗi lưu file: " + err.toString();
  }
}

/**
 * Helper: Đọc danh sách nhân viên từ Sheet
 */
function getEmployeesData(ss) {
  const sheet = ss.getSheetByName(SHEET_EMP);
  const rows = sheet.getDataRange().getValues();
  const employees = {};
  
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0]) {
      employees[rows[i][0].toString()] = rows[i][1];
    }
  }
  return employees;
}

/**
 * Helper: Đọc danh mục sản phẩm từ Sheet
 */
function getProductsData(ss) {
  const sheet = ss.getSheetByName(SHEET_PROD);
  const rows = sheet.getDataRange().getValues();
  const products = [];
  let currentProduct = null;
  
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const pluVal = row[0] ? row[0].toString().trim() : "";      // Cột A: Mã PLU
    const barcodeVal = row[1] ? row[1].toString().trim() : "";   // Cột B: Mã vạch
    
    // Nếu có Mã PLU hoặc Mã vạch -> Đây là dòng chứa thông tin sản phẩm mới
    if (pluVal || barcodeVal) {
      const name = row[2] ? row[2].toString().trim() : "";       // Cột C: Tên sản phẩm
      const groupCode = row[3] ? row[3].toString().trim() : "";   // Cột D: Nhóm sản phẩm
      const groupDetail = row[4] ? row[4].toString().trim() : ""; // Cột E: Nhóm chi tiết
      const defaultUnit = row[5] ? row[5].toString().trim() : ""; // Cột F: ĐVT mặc định
      
      // Tự động phân loại Kho (category) dựa trên PLU hoặc tên nhóm hàng
      let category = "Thương mại";
      const groupLower = (groupCode + " " + groupDetail).toLowerCase();
      if (pluVal || groupLower.indexOf("trái cây") !== -1 || groupLower.indexOf("fruit") !== -1 || groupLower.indexOf("plu") !== -1) {
        category = "Trái cây";
      } else if (groupLower.indexOf("bao bì") !== -1 || groupLower.indexOf("túi") !== -1 || groupLower.indexOf("bao tải") !== -1) {
        category = "Bao bì";
      } else if (groupLower.indexOf("nguyên vật liệu") !== -1 || groupLower.indexOf("bột") !== -1 || groupLower.indexOf("đường") !== -1) {
        category = "Nguyên vật liệu";
      }
      
      // Mã vạch định danh trên thiết bị (dùng Mã vạch, nếu trống dùng mã PLU)
      const identifier = barcodeVal || pluVal;
      
      currentProduct = {
        plu: pluVal,
        barcode: identifier,
        name: name,
        category: category,
        defaultUnit: defaultUnit,
        units: [],
        group: groupDetail
      };
      
      // Đọc ĐV quy đổi 1 (nếu có ở cột G và H)
      const convUnitStr = row[6] ? row[6].toString().trim() : ""; // Cột G: ĐV quy đổi 1
      const factorVal = row[7] ? parseFloat(row[7]) : 0;          // Cột H: Tỉ lệ quy đổi
      
      if (convUnitStr) {
        const cleanUnitName = convUnitStr.split("(")[0].trim();
        let factor = factorVal;
        if (isNaN(factor) || factor <= 0) {
          const match = convUnitStr.match(/\((\d+)\)/);
          factor = match ? parseFloat(match[1]) : 1;
        }
        currentProduct.units.push({
          name: cleanUnitName,
          factor: factor
        });
      }
      
      products.push(currentProduct);
    } else {
      // Dòng này trống cả PLU và Barcode -> Dòng chứa ĐV quy đổi 2, 3 của sản phẩm dòng trên
      const convUnitStr = row[6] ? row[6].toString().trim() : ""; // Cột G: ĐV quy đổi 1
      const factorVal = row[7] ? parseFloat(row[7]) : 0;          // Cột H: Tỉ lệ quy đổi
      
      if (currentProduct && convUnitStr) {
        const cleanUnitName = convUnitStr.split("(")[0].trim();
        let factor = factorVal;
        if (isNaN(factor) || factor <= 0) {
          const match = convUnitStr.match(/\((\d+)\)/);
          factor = match ? parseFloat(match[1]) : 1;
        }
        
        currentProduct.units.push({
          name: cleanUnitName,
          factor: factor
        });
      }
    }
  }
  return products;
}

/**
 * Helper: Đọc kết quả kiểm kê hiện có từ Sheet
 */
function getInventoryRecords(ss) {
  const sheet = ss.getSheetByName(SHEET_INV);
  const rows = sheet.getDataRange().getValues();
  const records = [];
  
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0]) {
      records.push({
        employeeId: rows[i][0].toString(),
        employeeName: rows[i][1].toString(),
        warehouse: rows[i][2].toString(),
        barcode: rows[i][3].toString(),
        productName: rows[i][4].toString(),
        count1: rows[i][5] ? rows[i][5].toString() : "",
        count2: rows[i][6] ? rows[i][6].toString() : "",
        count3: rows[i][7] ? rows[i][7].toString() : "",
        totalQty: parseFloat(rows[i][8]) || 0,
        defaultUnit: rows[i][9].toString(),
        note: rows[i][10] ? rows[i][10].toString() : "",
        photoUrl: rows[i][11] ? rows[i][11].toString() : "",
        timestamp: rows[i][12]
      });
    }
  }
  return records;
}

/**
 * Helper: Tạo các Sheet nếu chưa tồn tại trong file và thêm dữ liệu mẫu
 */
function checkAndCreateSheets(ss) {
  // 1. Tạo sheet Kết quả kiểm kê
  let sheetInv = ss.getSheetByName(SHEET_INV);
  if (!sheetInv) {
    sheetInv = ss.insertSheet(SHEET_INV);
    sheetInv.appendRow([
      "Mã nhân viên", "Tên nhân viên", "Kho", "Mã vạch", "Tên sản phẩm",
      "Lần 1 (ĐVT Mặc định)", "Lần 2 (ĐVT Mặc định)", "Lần 3 (ĐVT Mặc định)",
      "Tổng số lượng", "ĐVT Mặc định", "Ghi chú", "Ảnh đính kèm", "Thời gian cập nhật"
    ]);
    sheetInv.getRange(1, 1, 1, 13).setFontWeight("bold").setBackground("#e0f2fe");
  }
  
  // 2. Tạo sheet Danh mục sản phẩm (Định dạng rút gọn 8 cột theo yêu cầu)
  let sheetProd = ss.getSheetByName(SHEET_PROD);
  if (!sheetProd) {
    sheetProd = ss.insertSheet(SHEET_PROD);
    sheetProd.appendRow([
      "Mã PLU", "Mã vạch", "Tên sản phẩm", "Nhóm sản phẩm", "Nhóm chi tiết", "ĐVT mặc định", "ĐV quy đổi 1", "Tỉ lệ quy đổi"
    ]);
    sheetProd.getRange(1, 1, 1, 8).setFontWeight("bold").setBackground("#f0fdf4");
    
    // Thêm dữ liệu mẫu
    sheetProd.appendRow(["", "8930000000001", "Bia Heineken Lon 330ml", "Thương mại", "Bia", "lon", "Thùng (24)", 24]);
    sheetProd.appendRow(["", "", "", "", "", "", "Lốc (6)", 6]);
    sheetProd.appendRow(["", "8930000000002", "Nước ngọt Coca Cola Lon 320ml", "Thương mại", "Nước ngọt", "lon", "Thùng (24)", 24]);
    sheetProd.appendRow(["", "", "", "", "", "", "Lốc (6)", 6]);
    sheetProd.appendRow(["101", "FRUIT001", "Táo Fuji Nhật Bản", "Trái cây", "Táo", "kg", "", ""]);
    sheetProd.appendRow(["102", "FRUIT002", "Nho Mẫu Đơn Hàn Quốc", "Trái cây", "Nho", "kg", "", ""]);
    sheetProd.appendRow(["", "BAG001", "Bao tải dứa xanh 60x100", "Bao bì", "Bao tải", "kg", "bao", 50]);
  }
  
  // 3. Tạo sheet Nhân viên
  let sheetEmp = ss.getSheetByName(SHEET_EMP);
  if (!sheetEmp) {
    sheetEmp = ss.insertSheet(SHEET_EMP);
    sheetEmp.appendRow(["Mã nhân viên", "Tên nhân viên"]);
    sheetEmp.getRange(1, 1, 1, 2).setFontWeight("bold").setBackground("#fffbeb");
    sheetEmp.appendRow(["EMP001", "Nguyễn Văn A"]);
    sheetEmp.appendRow(["EMP002", "Trần Thị B"]);
    sheetEmp.appendRow(["EMP003", "Lê Hoàng C"]);
    sheetEmp.appendRow(["USER_PROD_HUNG", "Nguyễn Văn Hùng"]);
  }
}

/**
 * Helper: Trả về JSON cho Web App
 */
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
