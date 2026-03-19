export type CutlistLanguage = 'he' | 'th';

export const cutlistTranslations = {
  he: {
    // Main page
    pageTitle: "פקודת יצור - Kostika",
    backToMenu: "חזרה לתפריט",
    savedFiles: "קבצים שמורים",
    newImport: "ייבוא חדש",
    preview: "תצוגה מקדימה",
    
    // Uploads tab
    savedCutlistFiles: "פקודות יצור שמורות",
    loading: "טוען...",
    noSavedFiles: "אין קבצים שמורים",
    importNewFile: "ייבוא קובץ חדש",
    items: "פריטים",
    open: "פתח",
    
    // Parse tab
    importCutlist: "ייבוא פקודת יצור",
    processingPdf: "מעבד את קובץ ה-PDF...",
    mayTakeMinute: "זה עשוי לקחת עד דקה",
    selectAnotherFile: "בחר קובץ אחר",
    uploadPdf: "העלה קובץ PDF",
    clickOrDrag: "לחץ כאן או גרור קובץ",
    
    // Preview tab
    previewTitle: "תצוגה מקדימה",
    project: "פרויקט",
    itemsFound: "פריטים נמצאו",
    fileName: "שם קובץ",
    enterFileName: "הכנס שם לקובץ...",
    confirmAndSave: "אשר ושמור",
    saving: "שומר...",
    itemsFoundTitle: "פריטים שנמצאו",
    itemNumber: "מס' פרט",
    profiles: "פרופילים",
    accessories: "אביזרים",
    glass: "זכוכית",
    
    // Detail page
    back: "חזרה",
    itemsCompleted: "פריטים הושלמו",
    searchPlaceholder: "חפש לפי קוד פרופיל, מס' פרט...",
    noResults: "לא נמצאו תוצאות",
    noItemsToShow: "אין פריטים להצגה",
    fileNotFound: "הקובץ לא נמצא",
    backToList: "חזרה לרשימה",
    
    // CutlistItemCard
    itemRef: "מס' פרט",
    completed: "הושלם",
    problem: "בעיה",
    issues: "תקלות",
    technicalInfo: "מידע טכני",
    quantity: "כמות",
    notes: "הערות",
    confirmItemCompletion: "אישור סיום מס׳ פרט",
    packItem: "אריזה",
    itemPacked: "נארז ומוכן להעמסה",
    itemCompleted: "מס׳ פרט הושלם",
    noItemsInSection: "אין פריטים במס' פרט זה.",
    openIssuesExist: "קיימות {count} תקלות פתוחות. יש לטפל בהן לפני סיום.",
    markAllRowsDone: "יש לסמן את כל {count} השורות כבוצעו לפני סיום.",
    hideRawText: "הסתר טקסט גולמי",
    showRawText: "הצג טקסט גולמי",
    
    // Profile table
    noProfiles: "אין פרופילים",
    profile: "פרופיל",
    role: "תפקיד",
    length: "אורך",
    direction: "כיוון",
    qty: "כמות",
    
    // Misc table
    noAccessories: "אין אביזרים",
    sku: "מק\"ט",
    description: "תיאור",
    
    // Glass table
    code: "קוד",
    dimensions: "מידות",
    
    // Row confirm dialog
    confirmRow: "אישור שורה",
    markDone: "סמן בוצע",
    reportIssue: "דווח תקלה",
    describeIssue: "תאר את התקלה...",
    goBack: "חזור",
    saveIssue: "שמור תקלה",
    cancel: "ביטול",
    
    // Section confirm modal
    finishItem: "סיום מס' פרט",
    chooseFinishStatus: "בחר את סטטוס הסיום עבור פריט זה",
    markAsCompleted: "סמן כהושלם",
    allItemsWillBeMarked: "כל הפריטים יסומנו כבוצעו",
    reportProblem: "דווח על בעיה",
    specifyWhatsWrong: "ציין מה לא תקין",
    issueDescription: "תיאור הבעיה",
    required: "*",
    describeTheProblem: "תאר את הבעיה שנמצאה...",
    sendReport: "שלח דיווח",
    sending: "שולח...",
    close: "סגור",
    
    // Toast messages
    errorLoadingFiles: "שגיאה בטעינת הקבצים",
    selectPdfFile: "יש לבחור קובץ PDF",
    noItemsInFile: "לא נמצאו פריטים בקובץ",
    foundItems: "נמצאו {count} פריטים",
    errorProcessingFile: "שגיאה בעיבוד הקובץ",
    noDataToSave: "אין נתונים לשמירה",
    enterFilename: "הכנס שם קובץ",
    dataSavedSuccess: "הנתונים נשמרו בהצלחה",
    errorSavingData: "שגיאה בשמירת הנתונים",
    fileDeleted: "הקובץ נמחק",
    errorDeleting: "שגיאה במחיקה",
    deleteConfirm: "האם למחוק את הקובץ?",
    errorLoadingData: "שגיאה בטעינת הנתונים",
    rowAlreadyDone: "שורה זו כבר סומנה כבוצעה",
    loginRequired: "יש להתחבר כדי לעדכן פריטים",
    rowMarkedDone: "השורה סומנה כבוצעה",
    errorUpdatingRow: "שגיאה בעדכון השורה",
    issueSaved: "התקלה נשמרה",
    errorSavingIssue: "שגיאה בשמירת התקלה",
    loginToUpdate: "יש להתחבר כדי לעדכן",
    itemMarkedComplete: "מס' פרט {ref} סומן כהושלם",
    errorMarkingComplete: "שגיאה בסימון כהושלם",
    issueReported: "דווחה בעיה במס' פרט {ref}",
    errorReportingIssue: "שגיאה בדיווח הבעיה",
    notConnected: "לא מחובר",
    
    // Language selector
    language: "שפה",
    
    // Chunked parsing progress
    uploadingFile: "מעלה קובץ...",
    analyzingFile: "מנתח קובץ...",
    parsingPages: "מעבד עמודים",
    parseComplete: "העיבוד הושלם",

    // Worker portal
    workerPortalTitle: "פורטל עובדים",
    welcomeWorker: "שלום",
    welcomeToPortal: "ברוך הבא לפורטל העובדים",
    actionsToday: "פעולות היום",
    completedToday: "הושלמו",
    issueReports: "דיווחי בעיות",
    quickActions: "פעולות מהירות",
    quickActionsDesc: "גש לאזורי העבודה השונים",
    productionOrder: "פקודת יצור",
    optimization: "אופטימיזציה",
    recentActivityTitle: "פעילות אחרונה",
    recentActivityDesc: "הפעולות האחרונות שביצעת",
    noActivityYet: "אין פעילות עדיין. התחל לעבוד על רשימות חיתוך!",
    home: "ראשי",
    logout: "יציאה",
    rowCompleted: "שורה הושלמה",
    issueReportedAction: "דיווח בעיה",
    sectionCompleted: "סעיף הושלם",
    sectionIssue: "בעיה בסעיף",
    sectionPacked: "פריט נארז",
    sectionReopened: "סעיף נפתח מחדש",
    rowReopened: "שורה נפתחה מחדש",
  },
  th: {
    // Main page
    pageTitle: "รายการตัด - Kostika",
    backToMenu: "กลับไปเมนู",
    savedFiles: "ไฟล์ที่บันทึก",
    newImport: "นำเข้าใหม่",
    preview: "ดูตัวอย่าง",
    
    // Uploads tab
    savedCutlistFiles: "ไฟล์รายการตัดที่บันทึก",
    loading: "กำลังโหลด...",
    noSavedFiles: "ไม่มีไฟล์ที่บันทึก",
    importNewFile: "นำเข้าไฟล์ใหม่",
    items: "รายการ",
    open: "เปิด",
    
    // Parse tab
    importCutlist: "นำเข้ารายการตัด",
    processingPdf: "กำลังประมวลผลไฟล์ PDF...",
    mayTakeMinute: "อาจใช้เวลาถึงหนึ่งนาที",
    selectAnotherFile: "เลือกไฟล์อื่น",
    uploadPdf: "อัปโหลดไฟล์ PDF",
    clickOrDrag: "คลิกที่นี่หรือลากไฟล์",
    
    // Preview tab
    previewTitle: "ดูตัวอย่าง",
    project: "โปรเจกต์",
    itemsFound: "รายการที่พบ",
    fileName: "ชื่อไฟล์",
    enterFileName: "ป้อนชื่อไฟล์...",
    confirmAndSave: "ยืนยันและบันทึก",
    saving: "กำลังบันทึก...",
    itemsFoundTitle: "รายการที่พบ",
    itemNumber: "หมายเลขรายการ",
    profiles: "โปรไฟล์",
    accessories: "อุปกรณ์เสริม",
    glass: "กระจก",
    
    // Detail page
    back: "กลับ",
    itemsCompleted: "รายการเสร็จสิ้น",
    searchPlaceholder: "ค้นหาตามรหัสโปรไฟล์, หมายเลขรายการ...",
    noResults: "ไม่พบผลลัพธ์",
    noItemsToShow: "ไม่มีรายการที่จะแสดง",
    fileNotFound: "ไม่พบไฟล์",
    backToList: "กลับไปรายการ",
    
    // CutlistItemCard
    itemRef: "หมายเลขรายการ",
    completed: "เสร็จสิ้น",
    problem: "ปัญหา",
    issues: "ปัญหา",
    technicalInfo: "ข้อมูลทางเทคนิค",
    quantity: "จำนวน",
    notes: "หมายเหตุ",
    confirmItemCompletion: "ยืนยันการเสร็จสิ้นรายการ",
    packItem: "บรรจุ",
    itemPacked: "บรรจุแล้วพร้อมจัดส่ง",
    itemCompleted: "รายการเสร็จสิ้น",
    noItemsInSection: "ไม่มีรายการในส่วนนี้",
    openIssuesExist: "มี {count} ปัญหาที่ยังไม่ได้แก้ไข ต้องแก้ไขก่อนเสร็จสิ้น",
    markAllRowsDone: "ต้องทำเครื่องหมายแถวทั้งหมด {count} แถวว่าเสร็จสิ้นก่อน",
    hideRawText: "ซ่อนข้อความดิบ",
    showRawText: "แสดงข้อความดิบ",
    
    // Profile table
    noProfiles: "ไม่มีโปรไฟล์",
    profile: "โปรไฟล์",
    role: "บทบาท",
    length: "ความยาว",
    direction: "ทิศทาง",
    qty: "จำนวน",
    
    // Misc table
    noAccessories: "ไม่มีอุปกรณ์เสริม",
    sku: "รหัสสินค้า",
    description: "คำอธิบาย",
    
    // Glass table
    code: "รหัส",
    dimensions: "ขนาด",
    
    // Row confirm dialog
    confirmRow: "ยืนยันแถว",
    markDone: "ทำเครื่องหมายว่าเสร็จ",
    reportIssue: "รายงานปัญหา",
    describeIssue: "อธิบายปัญหา...",
    goBack: "กลับ",
    saveIssue: "บันทึกปัญหา",
    cancel: "ยกเลิก",
    
    // Section confirm modal
    finishItem: "เสร็จสิ้นรายการ",
    chooseFinishStatus: "เลือกสถานะการเสร็จสิ้นสำหรับรายการนี้",
    markAsCompleted: "ทำเครื่องหมายว่าเสร็จสิ้น",
    allItemsWillBeMarked: "รายการทั้งหมดจะถูกทำเครื่องหมายว่าเสร็จ",
    reportProblem: "รายงานปัญหา",
    specifyWhatsWrong: "ระบุสิ่งที่ผิดปกติ",
    issueDescription: "รายละเอียดปัญหา",
    required: "*",
    describeTheProblem: "อธิบายปัญหาที่พบ...",
    sendReport: "ส่งรายงาน",
    sending: "กำลังส่ง...",
    close: "ปิด",
    
    // Toast messages
    errorLoadingFiles: "เกิดข้อผิดพลาดในการโหลดไฟล์",
    selectPdfFile: "กรุณาเลือกไฟล์ PDF",
    noItemsInFile: "ไม่พบรายการในไฟล์",
    foundItems: "พบ {count} รายการ",
    errorProcessingFile: "เกิดข้อผิดพลาดในการประมวลผลไฟล์",
    noDataToSave: "ไม่มีข้อมูลที่จะบันทึก",
    enterFilename: "ป้อนชื่อไฟล์",
    dataSavedSuccess: "บันทึกข้อมูลสำเร็จ",
    errorSavingData: "เกิดข้อผิดพลาดในการบันทึกข้อมูล",
    fileDeleted: "ลบไฟล์แล้ว",
    errorDeleting: "เกิดข้อผิดพลาดในการลบ",
    deleteConfirm: "ต้องการลบไฟล์นี้หรือไม่?",
    errorLoadingData: "เกิดข้อผิดพลาดในการโหลดข้อมูล",
    rowAlreadyDone: "แถวนี้ถูกทำเครื่องหมายว่าเสร็จแล้ว",
    loginRequired: "ต้องเข้าสู่ระบบเพื่ออัปเดตรายการ",
    rowMarkedDone: "แถวถูกทำเครื่องหมายว่าเสร็จ",
    errorUpdatingRow: "เกิดข้อผิดพลาดในการอัปเดตแถว",
    issueSaved: "บันทึกปัญหาแล้ว",
    errorSavingIssue: "เกิดข้อผิดพลาดในการบันทึกปัญหา",
    loginToUpdate: "ต้องเข้าสู่ระบบเพื่ออัปเดต",
    itemMarkedComplete: "รายการ {ref} ถูกทำเครื่องหมายว่าเสร็จสิ้น",
    errorMarkingComplete: "เกิดข้อผิดพลาดในการทำเครื่องหมายว่าเสร็จสิ้น",
    issueReported: "รายงานปัญหาในรายการ {ref}",
    errorReportingIssue: "เกิดข้อผิดพลาดในการรายงานปัญหา",
    notConnected: "ไม่ได้เชื่อมต่อ",
    
    // Language selector
    language: "ภาษา",
    
    // Chunked parsing progress
    uploadingFile: "กำลังอัปโหลดไฟล์...",
    analyzingFile: "กำลังวิเคราะห์ไฟล์...",
    parsingPages: "กำลังประมวลผลหน้า",
    parseComplete: "การประมวลผลเสร็จสิ้น",

    // Worker portal
    workerPortalTitle: "พอร์ทัลพนักงาน",
    welcomeWorker: "สวัสดี",
    welcomeToPortal: "ยินดีต้อนรับสู่พอร์ทัลพนักงาน",
    actionsToday: "การดำเนินการวันนี้",
    completedToday: "เสร็จสิ้น",
    issueReports: "รายงานปัญหา",
    quickActions: "การดำเนินการด่วน",
    quickActionsDesc: "เข้าถึงพื้นที่ทำงานต่างๆ",
    productionOrder: "คำสั่งผลิต",
    optimization: "การเพิ่มประสิทธิภาพ",
    recentActivityTitle: "กิจกรรมล่าสุด",
    recentActivityDesc: "การดำเนินการล่าสุดของคุณ",
    noActivityYet: "ยังไม่มีกิจกรรม เริ่มทำงานกับรายการตัด!",
    home: "หน้าหลัก",
    logout: "ออกจากระบบ",
    rowCompleted: "แถวเสร็จสิ้น",
    issueReportedAction: "รายงานปัญหา",
    sectionCompleted: "ส่วนเสร็จสิ้น",
    sectionIssue: "ปัญหาในส่วน",
    sectionPacked: "บรรจุแล้ว",
    sectionReopened: "เปิดส่วนใหม่",
    rowReopened: "เปิดแถวใหม่",
  },
} as const;

export type TranslationKey = keyof typeof cutlistTranslations.he;

export function getTranslation(lang: CutlistLanguage, key: TranslationKey): string {
  return cutlistTranslations[lang][key] || cutlistTranslations.he[key] || key;
}

export function formatTranslation(lang: CutlistLanguage, key: TranslationKey, params: Record<string, string | number>): string {
  let text = getTranslation(lang, key);
  Object.entries(params).forEach(([k, v]) => {
    text = text.replace(`{${k}}`, String(v));
  });
  return text;
}
