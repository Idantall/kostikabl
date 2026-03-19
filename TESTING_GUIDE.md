# QR Tracking System - Final Testing Guide

## ✅ Completed Features

### 1. Hebrew Font & RTL Text Rendering
- **Location**: `supabase/functions/labels-generate/`
- **Files**: 
  - `hebrew-utils.ts` - RTL helper functions
  - `index.ts` - Updated to use visualRTL()
- **Implementation**:
  - `visualRTL()` function reverses Hebrew character runs while preserving Latin/numbers
  - `estimateTextWidth()` for proper right-aligned positioning
  - All Hebrew text (בניין, קומה, דירה, פרט, מיקום, פתח, subpart names) processed through visualRTL()
  - Text positioned from right edge of label with calculated width

### 2. Storage Bucket & Signed URLs
- **Database**: 
  - Bucket 'labels' created (private, public=false)
  - RLS policies: Users can view their own project labels
  - Service role can upload
- **Edge Function**:
  - Uploads to: `{projectId}/labels-{timestamp}.pdf`
  - Returns signed URL valid for 1 hour
  - Proper error handling with detailed messages

### 3. Environment Variables
**Frontend (Vite)**:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

**Edge Functions**:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `JWT_SECRET`

✅ All properly configured and used consistently

### 4. CORS Headers (scan-confirm)
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
```
- ✅ OPTIONS preflight handling
- ✅ Returns CORS headers in all responses

### 5. Idempotent Scan Detection
**Response includes**:
- `is_new_scan`: boolean (true for first scan)
- `is_duplicate`: boolean (true for re-scan)
- `scanned_at`: current timestamp
- `first_scanned_at`: original scan timestamp

**UI Updates**:
- First scan: Green "נסרק בהצלחה!" badge
- Duplicate: Blue "נסרק בעבר" badge with original timestamp

### 6. Realtime Subscriptions
**ProjectDetail page subscribes to**:
1. **Postgres Changes**:
   - Table: `items` (filter: project_id)
   - Table: `scans` (INSERT events)
   
2. **Broadcast Channel**: `project:{projectId}`
   - Event: `scan.created` (new scans only)
   - Event: `item.status_changed` (status updates)

**Features**:
- Toast notifications for real-time events
- Automatic UI updates without refresh

### 7. Import Warnings CSV Export
- **Button**: "הורד CSV" in ImportResults component
- **Format**: UTF-8 with BOM (`\uFEFF`)
- **Columns**: Row number, Warning message
- **Filename**: `import-warnings-{date}.csv`
- Opens correctly in Excel with Hebrew text

### 8. Calibration PDF Generator
- **Location**: Labels page (`/labels/:projectId`)
- **Button**: "הורד דף כיול"
- **Output**: PNG with 3×8 grid
- **Features**:
  - Corner marks for alignment
  - Numbered labels (1-24)
  - Matches exact label dimensions (70mm × 37mm)

### 9. Security (is_email_allowed)
```sql
CREATE FUNCTION is_email_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
```
- ✅ All table policies reference this function
- ✅ Prevents infinite recursion in RLS
- ✅ Storage policies check project ownership

---

## 🧪 Test Plan

### Test 1: Import Excel File

**Expected Excel Format**:
```
Sheet name: Must contain a digit (e.g., "1", "דירה 1")

Header section (first 10 rows):
קומה: 0
דירה: 1

Table headers (must include):
- מיקום בדירה (required)
- מס' פרט (required)
- מס' פתח (optional)
- רוחב (optional)
- גובה (optional)
- הערות (optional)
- צד ימין/שמאל (optional)

Data rows:
- Each row = one item
- Subparts auto-detected from הערות or defaults to all 5
```

**Test Steps**:
1. Go to `/import`
2. Upload test Excel file: `דוגמת_קלט_ייבוא_בניין11.xlsx`
3. Verify preview shows:
   - Floor: קרקע (0), 1
   - Apartments: 1, 5
   - Items with correct codes, locations, dimensions
4. Check warnings section
5. If warnings exist, click "הורד CSV"
6. Open CSV in Excel → verify Hebrew renders correctly
7. Click "אשר ושמור"
8. Verify redirect to project detail page
9. Check all items have `status_cached = 'NOT_SCANNED'`

### Test 2: Generate Labels

**Test Steps**:
1. Go to `/labels/:projectId`
2. **First: Test Calibration**
   - Click "הורד דף כיול"
   - Print calibration page
   - Verify grid aligns with label sheet (3×8, 70mm × 37mm)
3. **Generate Real Labels**:
   - Select scope: "פרויקט שלם"
   - Check all subparts: 01-05
   - Click "צור תוויות"
   - Wait for generation (watch console logs)
4. **Verify Output**:
   - Signed URL appears
   - Click "הורד PDF"
   - Open PDF → verify:
     - Hebrew text renders correctly (not boxes)
     - Text is right-aligned
     - Numbers/Latin stay left-to-right
     - QR codes are present and scannable
     - Subpart names are in Hebrew under QR
     - Building, Floor, Apt, Item code, Location all visible
5. **Print Test**:
   - Print one page at 100% scale (no "fit to page")
   - Align with label sheet
   - Verify alignment matches calibration

### Test 3: Scan QR Code

**Test Steps**:
1. Open a label's QR code (or manually navigate to URL)
   - URL format: `/s/{item_id}-{subpart}?t={token}`
2. **First Scan**:
   - Verify shows: "נסרק בהצלחה!" (green badge)
   - Check item details displayed
   - Check progress bar: 1/5 or 2/5 depending on subpart
   - Check status: NOT_SCANNED → PARTIAL
3. **Duplicate Scan**:
   - Scan same QR again
   - Verify shows: "נסרק בעבר" (blue badge)
   - Check displays original timestamp: "נסרק לראשונה {date}"
   - Message: "פריט זה כבר נסרק ב{date}"
4. **Complete All Subparts**:
   - Scan all 5 subparts for one item
   - Verify final scan shows status: READY (green)

### Test 4: Realtime Updates

**Test Steps**:
1. Open `/projects/:id` in Browser 1
2. Open same page in Browser 2
3. In Browser 2, scan a QR code (or use scan-confirm API)
4. **Verify in Browser 1**:
   - Toast notification appears: "נסרק פריט {item_id}"
   - Status badge updates automatically
   - No page refresh needed
5. Monitor console for broadcast events:
   - `scan.created`
   - `item.status_changed`

### Test 5: Security & RLS

**Test Steps**:
1. Try logging in with non-whitelisted email
   - Verify: Cannot login or see any data
2. Logged in user tries to:
   - View projects → Only sees own projects
   - Generate labels → Only for own projects
   - View scans → Only for own projects
3. Public scan endpoint (`/s/:slug`)
   - Works without authentication ✅
   - Only writes through edge function (service role) ✅
   - Cannot directly query/modify database ✅

---

## 📋 Expected Results Summary

| Feature | Status | Verification |
|---------|--------|--------------|
| Hebrew text in PDFs | ✅ | Characters render correctly, RTL layout |
| Signed URL download | ✅ | URL expires in 1 hour, downloads PDF |
| Import warnings CSV | ✅ | Hebrew text in Excel, UTF-8 BOM |
| Calibration PDF | ✅ | Grid matches label dimensions |
| Duplicate scan detection | ✅ | Different UI for first vs repeat scan |
| Realtime updates | ✅ | Toast notifications, auto-refresh |
| CORS headers | ✅ | scan-confirm accessible from any origin |
| RLS security | ✅ | Users only see own data |
| Environment vars | ✅ | Consistent naming Vite vs Edge Functions |

---

## 🐛 Known Limitations

1. **Hebrew Font**: Using Helvetica with Unicode support (not dedicated Hebrew font)
   - Works but not ideal for complex Hebrew typography
   - Future: Embed NotoSansHebrew-Regular.ttf when available

2. **QR Scan URL**: Currently uses generic domain
   - Update in production to actual app domain
   - Currently set in `labels-generate` function

3. **Label Expiration**: Currently set to 1 year
   - Configurable in `labels-generate` (expires_at field)

---

## 🔧 Troubleshooting

### Labels don't render Hebrew correctly
- Verify `hebrew-utils.ts` is imported
- Check console logs for errors during PDF generation
- Ensure StandardFonts.Helvetica is being used (supports Unicode)

### Storage upload fails
- Check bucket 'labels' exists
- Verify RLS policies allow service role to insert
- Check edge function has SUPABASE_SERVICE_ROLE_KEY

### Realtime not working
- Verify tables have REPLICA IDENTITY FULL
- Check tables added to supabase_realtime publication
- Confirm channel subscription in ProjectDetail component

### Import warnings CSV has garbled Hebrew
- Verify UTF-8 BOM is present (`\uFEFF`)
- Check CSV is opened in Excel (not Notepad)
- Ensure download uses proper Content-Type

### Duplicate scans not detected
- Check unique index exists: `idx_scans_unique_item_subpart_label`
- Verify scan-confirm returns `is_duplicate` field
- Check PublicScan component handles both states

---

## 🚀 Next Steps After Testing

1. **Production domain**: Update QR code base URL in `labels-generate`
2. **Hebrew font**: Embed dedicated font when available
3. **Error monitoring**: Add Sentry or similar for production errors
4. **Performance**: Monitor PDF generation time for large projects
5. **Mobile app**: Consider native scanner for better UX
6. **Offline support**: Implement scan queue with sync

---

## 📞 Support

If you encounter issues:
1. Check browser console for errors
2. Check Edge Function logs in Supabase dashboard
3. Verify database logs for RLS violations
4. Check network tab for failed API calls

All systems are now finalized and ready for production testing! 🎉
