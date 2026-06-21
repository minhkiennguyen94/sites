// Dữ liệu danh mục sản phẩm và nhân viên mặc định phục vụ kiểm thử offline
const MOCK_DATA = {
  employees: {
    "EMP001": "Nguyễn Văn A",
    "EMP002": "Trần Thị B",
    "EMP003": "Lê Hoàng C",
    "USER_PROD_HUNG": "Nguyễn Văn Hùng"
  },
  
  products: [
    // Kho thương mại & Kho bán hàng
    {
      barcode: "8930000000001",
      name: "Bia Heineken Lon 330ml",
      category: "Thương mại",
      defaultUnit: "lon",
      units: [
        { name: "thùng", factor: 24 },
        { name: "lốc", factor: 6 }
      ],
      group: "Bia"
    },
    {
      barcode: "8930000000002",
      name: "Nước ngọt Coca Cola Lon 320ml",
      category: "Thương mại",
      defaultUnit: "lon",
      units: [
        { name: "thùng", factor: 24 },
        { name: "lốc", factor: 6 }
      ],
      group: "Nước ngọt"
    },
    {
      barcode: "8930000000003",
      name: "Sữa tươi Vinamilk Ít Đường 180ml",
      category: "Thương mại",
      defaultUnit: "hộp",
      units: [
        { name: "thùng", factor: 48 },
        { name: "lốc", factor: 4 }
      ],
      group: "Sữa"
    },
    {
      barcode: "8930000000004",
      name: "Mì Hảo Hảo Tôm Chua Cay 75g",
      category: "Thương mại",
      defaultUnit: "gói",
      units: [
        { name: "thùng", factor: 30 }
      ],
      group: "Mì ăn liền"
    },
    
    // Kho trái cây (Táo)
    {
      barcode: "FRUIT001",
      plu: "101",
      name: "Táo Fuji Nhật Bản",
      category: "Trái cây",
      defaultUnit: "kg",
      units: [],
      group: "Táo"
    },
    {
      barcode: "FRUIT001_2",
      plu: "1012",
      name: "Táo Envy Mỹ",
      category: "Trái cây",
      defaultUnit: "kg",
      units: [],
      group: "Táo"
    },
    {
      barcode: "FRUIT001_3",
      plu: "1013",
      name: "Táo Gala New Zealand",
      category: "Trái cây",
      defaultUnit: "kg",
      units: [],
      group: "Táo"
    },
    // Kho trái cây (Nho)
    {
      barcode: "FRUIT002",
      plu: "102",
      name: "Nho Mẫu Đơn Hàn Quốc",
      category: "Trái cây",
      defaultUnit: "kg",
      units: [],
      group: "Nho"
    },
    {
      barcode: "FRUIT002_2",
      plu: "1022",
      name: "Nho Đen Không Hạt Mỹ",
      category: "Trái cây",
      defaultUnit: "kg",
      units: [],
      group: "Nho"
    },
    {
      barcode: "FRUIT002_3",
      plu: "1023",
      name: "Nho Đỏ Ninh Thuận",
      category: "Trái cây",
      defaultUnit: "kg",
      units: [],
      group: "Nho"
    },
    // Kho trái cây (Cam)
    {
      barcode: "FRUIT003",
      plu: "103",
      name: "Cam Sành Hàm Yên",
      category: "Trái cây",
      defaultUnit: "kg",
      units: [],
      group: "Cam"
    },
    {
      barcode: "FRUIT003_2",
      plu: "1032",
      name: "Cam Cao Phong",
      category: "Trái cây",
      defaultUnit: "kg",
      units: [],
      group: "Cam"
    },
    {
      barcode: "FRUIT003_3",
      plu: "1033",
      name: "Cam Vàng Úc",
      category: "Trái cây",
      defaultUnit: "kg",
      units: [],
      group: "Cam"
    },
    // Kho trái cây (Xoài)
    {
      barcode: "FRUIT004",
      plu: "104",
      name: "Xoài Cát Hòa Lộc",
      category: "Trái cây",
      defaultUnit: "kg",
      units: [],
      group: "Xoài"
    },
    {
      barcode: "FRUIT004_2",
      plu: "1042",
      name: "Xoài Keo Campuchia",
      category: "Trái cây",
      defaultUnit: "kg",
      units: [],
      group: "Xoài"
    },
    // Kho trái cây (Bơ)
    {
      barcode: "FRUIT005",
      plu: "105",
      name: "Bơ Sáp Đắk Lắk",
      category: "Trái cây",
      defaultUnit: "kg",
      units: [],
      group: "Bơ"
    },
    {
      barcode: "FRUIT005_2",
      plu: "1052",
      name: "Bơ Booth",
      category: "Trái cây",
      defaultUnit: "kg",
      units: [],
      group: "Bơ"
    },

    // Kho bao bì (bao tải lớn, túi nilon)
    {
      barcode: "BAG001",
      name: "Bao tải dứa xanh 60x100 (bao tải lớn)",
      category: "Bao bì",
      defaultUnit: "kg",
      units: [
        { name: "bao", factor: 50 },
        { name: "kiện", factor: 100 }
      ],
      group: "Bao tải"
    },
    {
      barcode: "BAG002",
      name: "Túi nilon quai xách nhựa PE 5kg",
      category: "Bao bì",
      defaultUnit: "kg",
      units: [
        { name: "kiện lớn", factor: 20 }
      ],
      group: "Túi nilon"
    },
    
    // Kho nguyên vật liệu
    {
      barcode: "MAT001",
      name: "Bột mì đa dụng Hoa Ngọc Lan",
      category: "Nguyên vật liệu",
      defaultUnit: "kg",
      units: [
        { name: "bao", factor: 25 }
      ],
      group: "Bột"
    },
    {
      barcode: "MAT002",
      name: "Đường tinh luyện Biên Hòa 1kg",
      category: "Nguyên vật liệu",
      defaultUnit: "cái",
      units: [
        { name: "bao", factor: 50 },
        { name: "kiện", factor: 10 }
      ],
      group: "Đường"
    },
    {
      barcode: "MAT003",
      name: "Hộp nhựa tròn đựng thực phẩm 500ml",
      category: "Nguyên vật liệu",
      defaultUnit: "cái",
      units: [
        { name: "thùng", factor: 500 }
      ],
      group: "Hộp nhựa"
    }
  ]
};

// Hàm lưu dữ liệu vào localStorage nếu chưa có
function initializeMockData() {
  if (!localStorage.getItem("inventory_employees")) {
    localStorage.setItem("inventory_employees", JSON.stringify(MOCK_DATA.employees));
  }
  if (!localStorage.getItem("inventory_products")) {
    localStorage.setItem("inventory_products", JSON.stringify(MOCK_DATA.products));
  }
  if (!localStorage.getItem("inventory_records")) {
    localStorage.setItem("inventory_records", JSON.stringify([]));
  }
  if (!localStorage.getItem("unidentified_photos")) {
    localStorage.setItem("unidentified_photos", JSON.stringify([]));
  }
}

// Khởi chạy dữ liệu mẫu
initializeMockData();
