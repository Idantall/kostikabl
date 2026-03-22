import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const SYSTEM_PROMPT = `אתה עוזר AI מומחה ואינטואיטיבי עבור Kostika - מערכת ניהול פרויקטים לחלונות ודלתות.

**תפקידך:** לעזור למשתמשים לקבל מידע ותובנות על הפרויקטים שלהם בצורה טבעית ופשוטה.

**כלים זמינים לפי קטגוריות:**

📁 **פרויקטים:**
- get_projects: רשימת פרויקטים עם סטטיסטיקות
- get_project_details: פרטי פרויקט ספציפי
- search_projects: חיפוש פרויקטים לפי שם/קוד
- get_project_folders: תיקיות פרויקטים

🏢 **מבנה (קומות/דירות):**
- get_floors: קומות של פרויקט
- get_apartments: דירות של פרויקט/קומה
- get_floor_details: פרטי קומה ספציפית
- get_apartment_details: פרטי דירה ספציפית

📦 **פריטים:**
- get_items: פריטים עם אפשרויות סינון מתקדמות
- get_item_by_code: חיפוש פריט לפי קוד
- get_item_details: פרטי פריט ספציפי
- get_item_stats: סטטיסטיקות פריטים
- search_items: חיפוש פריטים

⚠️ **תקלות ובעיות:**
- get_recent_issues: תקלות אחרונות
- get_issue_statistics: ניתוח סוגי תקלות
- get_load_issues: בעיות טעינה

📊 **פעילות וסריקות:**
- get_recent_activity: פעילות אחרונה
- get_scan_events: אירועי סריקה
- get_daily_activity: סיכום יומי

✂️ **חיתוך (Cutlist):**
- get_cutlist_uploads: רשימת קבצי חיתוך
- get_cutlist_sections: סקשנים של קובץ חיתוך
- get_cutlist_progress: התקדמות חיתוך

🔧 **אופטימיזציה:**
- get_optimization_jobs: עבודות אופטימיזציה
- get_optimization_patterns: תבניות חיתוך

📏 **מדידות:**
- get_measurement_rows: שורות מדידה

👷 **עובדים ותחנות:**
- get_workers: רשימת עובדים
- get_worker_stats: סטטיסטיקות עובדים
- get_station_performance: ביצועי תחנות
- get_top_workers: עובדים מובילים
- get_worker_activity: פעילות עובד ספציפי

📈 **ניתוחים מתקדמים:**
- get_ai_insights: תובנות חכמות
- get_productivity_trends: מגמות פרודוקטיביות
- get_progress_velocity: מהירות התקדמות
- get_bottleneck_analysis: צווארי בקבוק
- get_comparative_analysis: השוואת פרויקטים

🏷️ **תוויות:**
- get_label_jobs: עבודות הדפסת תוויות

**כללים חשובים:**
1. **תמיד ענה בעברית**
2. **הבן את הכוונה:** אם המשתמש אומר "מה קורה בפרויקט X" - תשתמש ב-get_project_details
3. **שאלות על מספרים:** "כמה פריטים יש" - השתמש ב-get_item_stats
4. **שאלות על בעיות:** "מה לא עובד", "איפה יש בעיות" - השתמש ב-get_recent_issues או get_bottleneck_analysis
5. **שאלות על התקדמות:** "מתי נסיים", "כמה נשאר" - השתמש ב-get_progress_velocity
6. **שאלות על עובדים:** "מי עבד היום", "מי הכי טוב" - השתמש בכלי העובדים
7. **חיפוש חופשי:** אם המשתמש מחפש משהו - נסה search_projects או search_items
8. **שלב מספר כלים:** אם צריך, השתמש בכמה כלים כדי לתת תמונה מלאה
9. **היה תמציתי** אבל מלא - תן את המידע החשוב בצורה ברורה
10. **תן המלצות** כשרלוונטי - מה לעשות עם המידע

**דוגמאות להבנה:**
- "מה המצב?" → get_projects + get_ai_insights
- "ספר לי על רמת השרון" → search_projects("רמת השרון") + get_project_details
- "יש בעיות?" → get_recent_issues
- "מי עבד היום?" → get_worker_stats + get_daily_activity
- "איפה תקועים?" → get_bottleneck_analysis
- "כמה הספקנו השבוע?" → get_productivity_trends
- "תראה לי את הקומה השלישית" → get_floor_details
- "מה עם הדירה 5?" → get_apartment_details`;

// Define all tools
const tools = [
  // === PROJECT TOOLS ===
  {
    type: "function",
    function: {
      name: "get_projects",
      description: "מביא רשימת כל הפרויקטים עם סטטיסטיקות מלאות. טוב לשאלות כלליות כמו 'מה הפרויקטים שלנו', 'תראה פרויקטים'",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["active", "completed", "measurement", "all"], description: "סינון לפי סטטוס" },
          limit: { type: "number", description: "מספר פרויקטים להחזיר (ברירת מחדל: 20)" },
          folder_id: { type: "string", description: "סינון לפי תיקייה" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_project_details",
      description: "מביא פרטים מלאים על פרויקט ספציפי כולל קומות, דירות וסטטוסים. טוב ל'ספר לי על פרויקט X', 'מה קורה בפרויקט'",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "number", description: "מזהה הפרויקט" },
          project_name: { type: "string", description: "שם הפרויקט או חלק ממנו לחיפוש" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_projects",
      description: "חיפוש פרויקטים לפי שם או קוד בניין. טוב כשהמשתמש מחפש פרויקט ספציפי",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "מילת חיפוש (שם או קוד)" }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_project_folders",
      description: "מביא רשימת תיקיות פרויקטים עם מספר הפרויקטים בכל תיקייה",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  
  // === FLOORS TOOLS ===
  {
    type: "function",
    function: {
      name: "get_floors",
      description: "מביא רשימת קומות של פרויקט עם סטטיסטיקות",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "number", description: "מזהה הפרויקט" },
          project_name: { type: "string", description: "שם הפרויקט" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_floor_details",
      description: "מביא פרטים מלאים על קומה ספציפית כולל כל הדירות והפריטים",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "number", description: "מזהה הפרויקט" },
          floor_code: { type: "string", description: "קוד/מספר הקומה" },
          floor_id: { type: "number", description: "מזהה הקומה" }
        },
        required: []
      }
    }
  },
  
  // === APARTMENTS TOOLS ===
  {
    type: "function",
    function: {
      name: "get_apartments",
      description: "מביא רשימת דירות עם סטטיסטיקות. ניתן לסנן לפי פרויקט או קומה",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "number", description: "מזהה הפרויקט" },
          floor_id: { type: "number", description: "מזהה הקומה" },
          floor_code: { type: "string", description: "קוד הקומה" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_apartment_details",
      description: "מביא פרטים מלאים על דירה ספציפית כולל כל הפריטים וסטטוסים",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "number", description: "מזהה הפרויקט" },
          apt_number: { type: "string", description: "מספר הדירה" },
          apartment_id: { type: "number", description: "מזהה הדירה" }
        },
        required: []
      }
    }
  },
  
  // === ITEMS TOOLS ===
  {
    type: "function",
    function: {
      name: "get_items",
      description: "מביא רשימת פריטים עם סינון מתקדם. טוב לשאלות על פריטים ספציפיים",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "number", description: "סינון לפי פרויקט" },
          floor_id: { type: "number", description: "סינון לפי קומה" },
          apt_id: { type: "number", description: "סינון לפי דירה" },
          loading_status: { type: "string", enum: ["LOADED", "PARTIAL", "NOT_LOADED"], description: "סינון לפי סטטוס טעינה" },
          install_status: { type: "string", enum: ["INSTALLED", "PARTIAL", "NOT_INSTALLED", "ISSUE"], description: "סינון לפי סטטוס התקנה" },
          limit: { type: "number", description: "מספר פריטים להחזיר (ברירת מחדל: 50)" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_items",
      description: "חיפוש פריטים לפי קוד פריט, מיקום, או הערות",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "מילת חיפוש" },
          project_id: { type: "number", description: "הגבלה לפרויקט ספציפי" }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_item_details",
      description: "מביא פרטים מלאים על פריט ספציפי כולל היסטוריית סריקות",
      parameters: {
        type: "object",
        properties: {
          item_id: { type: "number", description: "מזהה הפריט" },
          item_code: { type: "string", description: "קוד הפריט" },
          project_id: { type: "number", description: "מזהה הפרויקט (נדרש אם מחפשים לפי קוד)" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_item_stats",
      description: "מביא סטטיסטיקות מסכמות על פריטים לפי סטטוס טעינה והתקנה",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "number", description: "סינון לפי פרויקט" }
        },
        required: []
      }
    }
  },
  
  // === ISSUES TOOLS ===
  {
    type: "function",
    function: {
      name: "get_recent_issues",
      description: "מביא תקלות ובעיות אחרונות שדווחו. טוב לשאלות 'מה נשבר', 'איפה יש בעיות', 'תקלות'",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "מספר תקלות להחזיר (ברירת מחדל: 15)" },
          project_id: { type: "number", description: "סינון לפי פרויקט" },
          issue_code: { type: "string", description: "סוג תקלה ספציפי" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_issue_statistics",
      description: "מביא ניתוח סטטיסטי של סוגי תקלות - כמה מכל סוג, מהי הנפוצה ביותר",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "number", description: "סינון לפי פרויקט" },
          days: { type: "number", description: "מספר ימים לניתוח (ברירת מחדל: 30)" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_load_issues",
      description: "מביא בעיות טעינה ספציפיות מטבלת load_issues",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "number", description: "סינון לפי פרויקט" },
          limit: { type: "number", description: "מספר בעיות להחזיר" }
        },
        required: []
      }
    }
  },
  
  // === ACTIVITY TOOLS ===
  {
    type: "function",
    function: {
      name: "get_recent_activity",
      description: "מביא פעילות אחרונה - סריקות, טעינות והתקנות. טוב ל'מה קרה', 'פעילות אחרונה'",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "מספר פעולות (ברירת מחדל: 20)" },
          mode: { type: "string", enum: ["loading", "install", "all"], description: "סוג פעילות" },
          project_id: { type: "number", description: "סינון לפי פרויקט" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_scan_events",
      description: "מביא אירועי סריקה מפורטים עם אפשרויות סינון מתקדמות",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "number", description: "סינון לפי פרויקט" },
          item_id: { type: "number", description: "סינון לפי פריט" },
          mode: { type: "string", enum: ["loading", "install"], description: "סוג סריקה" },
          from_date: { type: "string", description: "מתאריך (ISO format)" },
          to_date: { type: "string", description: "עד תאריך (ISO format)" },
          limit: { type: "number", description: "מספר אירועים להחזיר" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_daily_activity",
      description: "מביא סיכום פעילות יומי - כמה סריקות, כמה הושלמו, כמה בעיות",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "תאריך ספציפי (ברירת מחדל: היום)" },
          project_id: { type: "number", description: "סינון לפי פרויקט" }
        },
        required: []
      }
    }
  },
  
  // === CUTLIST TOOLS ===
  {
    type: "function",
    function: {
      name: "get_cutlist_uploads",
      description: "מביא רשימת קבצי חיתוך (cutlist) שהועלו למערכת",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["active", "archived", "all"], description: "סינון לפי סטטוס" },
          limit: { type: "number", description: "מספר קבצים להחזיר" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_cutlist_sections",
      description: "מביא סקשנים של קובץ חיתוך ספציפי עם פרטי פרופילים וזכוכיות",
      parameters: {
        type: "object",
        properties: {
          upload_id: { type: "string", description: "מזהה הקובץ" },
          status: { type: "string", enum: ["open", "done", "issue", "all"], description: "סינון לפי סטטוס" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_cutlist_progress",
      description: "מביא סיכום התקדמות של קבצי חיתוך - כמה הושלם, כמה נשאר",
      parameters: {
        type: "object",
        properties: {
          upload_id: { type: "string", description: "מזהה קובץ ספציפי (אופציונלי)" }
        },
        required: []
      }
    }
  },
  
  // === OPTIMIZATION TOOLS ===
  {
    type: "function",
    function: {
      name: "get_optimization_jobs",
      description: "מביא עבודות אופטימיזציה (חיתוך מוטות) של פרויקט",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "number", description: "סינון לפי פרויקט" },
          status: { type: "string", description: "סינון לפי סטטוס" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_optimization_patterns",
      description: "מביא תבניות חיתוך של עבודת אופטימיזציה ספציפית",
      parameters: {
        type: "object",
        properties: {
          job_id: { type: "string", description: "מזהה העבודה" }
        },
        required: ["job_id"]
      }
    }
  },
  
  // === MEASUREMENT TOOLS ===
  {
    type: "function",
    function: {
      name: "get_measurement_rows",
      description: "מביא שורות מדידה של פרויקט במצב מדידה",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "number", description: "מזהה הפרויקט" },
          floor_label: { type: "string", description: "סינון לפי קומה" },
          apartment_label: { type: "string", description: "סינון לפי דירה" }
        },
        required: []
      }
    }
  },
  
  // === WORKER TOOLS ===
  {
    type: "function",
    function: {
      name: "get_workers",
      description: "מביא רשימת עובדים עם התחנות שלהם",
      parameters: {
        type: "object",
        properties: {
          station: { type: "string", description: "סינון לפי תחנה" },
          role: { type: "string", enum: ["worker", "manager", "owner", "viewer"], description: "סינון לפי תפקיד" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_worker_stats",
      description: "מביא סטטיסטיקות עובדים - ביצועים, פעילות, תפוקה",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "מספר ימים לניתוח (ברירת מחדל: 7)" },
          worker_email: { type: "string", description: "סינון לפי עובד ספציפי" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_worker_activity",
      description: "מביא פעילות מפורטת של עובד ספציפי",
      parameters: {
        type: "object",
        properties: {
          worker_email: { type: "string", description: "אימייל העובד" },
          worker_id: { type: "string", description: "מזהה העובד" },
          days: { type: "number", description: "מספר ימים להצגה" },
          limit: { type: "number", description: "מספר פעולות להחזיר" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_station_performance",
      description: "מביא ביצועי תחנות עבודה - השוואה בין תחנות, תפוקה, בעיות",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "מספר ימים לניתוח (ברירת מחדל: 7)" },
          station: { type: "string", description: "תחנה ספציפית" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_top_workers",
      description: "מביא רשימת העובדים המובילים לפי תפוקה והשלמות",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "מספר עובדים להחזיר (ברירת מחדל: 5)" },
          days: { type: "number", description: "מספר ימים לניתוח (ברירת מחדל: 7)" }
        },
        required: []
      }
    }
  },
  
  // === ANALYTICS TOOLS ===
  {
    type: "function",
    function: {
      name: "get_ai_insights",
      description: "מייצר תובנות וטיפים חכמים על בסיס ניתוח כל הנתונים",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_productivity_trends",
      description: "מנתח מגמות פרודוקטיביות - קצב עבודה, שעות שיא, ממוצעים",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "number", description: "סינון לפי פרויקט" },
          days: { type: "number", description: "מספר ימים לניתוח (ברירת מחדל: 14)" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_progress_velocity",
      description: "מחשב מהירות התקדמות וזמן משוער לסיום. טוב ל'מתי נסיים', 'כמה נשאר'",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "number", description: "מזהה הפרויקט (אופציונלי - אם לא ניתן, יחזיר לכל הפרויקטים)" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_bottleneck_analysis",
      description: "מזהה צווארי בקבוק - קומות/דירות עם התקדמות איטית, פריטים תקועים",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "number", description: "מזהה הפרויקט" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_comparative_analysis",
      description: "משווה ביצועים בין פרויקטים - איזה הכי מהיר, הכי יעיל",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  
  // === LABELS TOOLS ===
  {
    type: "function",
    function: {
      name: "get_label_jobs",
      description: "מביא עבודות הדפסת תוויות",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "number", description: "סינון לפי פרויקט" },
          status: { type: "string", enum: ["running", "done", "error", "all"], description: "סינון לפי סטטוס" }
        },
        required: []
      }
    }
  }
];

// Issue code translations
const ISSUE_CODES: Record<string, string> = {
  "GLASS_BROKEN": "זכוכית שבורה",
  "MOTOR_FAULT": "תקלה במנוע",
  "SHUTTER_DAMAGED": "תריס פגום",
  "RAILS_MISSING": "מסילות חסרות",
  "ANGLES_MISSING": "זוויות חסרות",
  "BOX_SILL_MISSING": "ארגז/אדן חסר",
  "FRAME_DAMAGED": "מסגרת פגומה",
  "MECHANISM_ISSUE": "בעיה במנגנון",
  "WRONG_SIZE": "מידה לא נכונה",
  "MISSING_PARTS": "חלקים חסרים"
};

// Helper: format date to Hebrew
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' }) + 
    ' ' + date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

// Execute a tool call
async function executeTool(name: string, args: any): Promise<string> {
  console.log(`Executing tool: ${name}`, args);

  try {
    switch (name) {
      // === PROJECT TOOLS ===
      case "get_projects": {
        const status = args.status || "all";
        const limit = args.limit || 20;
        
        let query = supabase.from("v_project_totals").select("*");
        
        if (status === "active") query = query.eq("status", "active");
        else if (status === "completed") query = query.eq("status", "completed");
        else if (status === "measurement") query = query.eq("status", "measurement");
        
        const { data, error } = await query.order("project_id", { ascending: false }).limit(limit);
        if (error) throw error;
        
        if (!data || data.length === 0) return "לא נמצאו פרויקטים במערכת.";
        
        const summary = data.map(p => {
          const progress = p.total_items ? Math.round(((p.ready_items || 0) / p.total_items) * 100) : 0;
          return `• **${p.name}** (${p.building_code || '-'}): ${p.total_items || 0} פריטים, ${progress}% הושלמו`;
        }).join("\n");
        
        return `📁 נמצאו ${data.length} פרויקטים:\n\n${summary}`;
      }

      case "get_project_details": {
        let projectQuery = supabase.from("v_project_totals").select("*");
        
        if (args.project_id) {
          projectQuery = projectQuery.eq("project_id", args.project_id);
        } else if (args.project_name) {
          projectQuery = projectQuery.ilike("name", `%${args.project_name}%`);
        } else {
          return "נדרש לציין שם או מזהה פרויקט.";
        }
        
        const { data: project, error: projectError } = await projectQuery.limit(1).maybeSingle();
        if (projectError) throw projectError;
        if (!project) return "לא נמצא פרויקט תואם.";
        
        // Get floors
        const { data: floors } = await supabase
          .from("v_floor_totals")
          .select("*")
          .eq("project_id", project.project_id)
          .order("floor_code");
        
        const progress = project.total_items ? Math.round(((project.ready_items || 0) / project.total_items) * 100) : 0;
        
        let details = `📊 **${project.name}** (${project.building_code || '-'})\n\n`;
        details += `**סטטוס כללי:**\n`;
        details += `• סה"כ פריטים: ${project.total_items || 0}\n`;
        details += `• מוכנים: ${project.ready_items || 0} (${progress}%)\n`;
        details += `• חלקיים: ${project.partial_items || 0}\n`;
        details += `• טרם נסרקו: ${project.not_scanned_items || 0}\n\n`;
        details += `**מבנה:** ${project.total_floors || 0} קומות, ${project.total_apartments || 0} דירות\n`;
        
        if (floors && floors.length > 0) {
          details += "\n**פירוט קומות:**\n";
          floors.forEach(f => {
            const floorProgress = f.total_items ? Math.round(((f.ready_items || 0) / f.total_items) * 100) : 0;
            details += `• קומה ${f.floor_code}: ${f.total_items || 0} פריטים, ${floorProgress}% מוכן\n`;
          });
        }
        
        return details;
      }

      case "search_projects": {
        const query = args.query;
        if (!query) return "נדרשת מילת חיפוש.";
        
        const { data, error } = await supabase
          .from("v_project_totals")
          .select("*")
          .or(`name.ilike.%${query}%,building_code.ilike.%${query}%`)
          .limit(10);
        
        if (error) throw error;
        if (!data || data.length === 0) return `לא נמצאו פרויקטים התואמים ל-"${query}".`;
        
        const results = data.map(p => {
          const progress = p.total_items ? Math.round(((p.ready_items || 0) / p.total_items) * 100) : 0;
          return `• **${p.name}** (ID: ${p.project_id}): ${p.total_items || 0} פריטים, ${progress}%`;
        }).join("\n");
        
        return `🔍 נמצאו ${data.length} פרויקטים:\n\n${results}`;
      }

      case "get_project_folders": {
        const { data: folders, error } = await supabase
          .from("project_folders")
          .select("id, name, created_at")
          .order("name");
        
        if (error) throw error;
        if (!folders || folders.length === 0) return "אין תיקיות פרויקטים.";
        
        // Count projects per folder
        const { data: projects } = await supabase
          .from("projects")
          .select("folder_id");
        
        const folderCounts: Record<string, number> = {};
        projects?.forEach(p => {
          if (p.folder_id) folderCounts[p.folder_id] = (folderCounts[p.folder_id] || 0) + 1;
        });
        
        const uncategorized = projects?.filter(p => !p.folder_id).length || 0;
        
        const list = folders.map(f => 
          `• 📁 ${f.name}: ${folderCounts[f.id] || 0} פרויקטים`
        ).join("\n");
        
        return `תיקיות פרויקטים:\n\n${list}\n• ללא תיקייה: ${uncategorized} פרויקטים`;
      }

      // === FLOORS TOOLS ===
      case "get_floors": {
        let projectId = args.project_id;
        
        if (!projectId && args.project_name) {
          const { data: p } = await supabase
            .from("projects")
            .select("id")
            .ilike("name", `%${args.project_name}%`)
            .limit(1)
            .maybeSingle();
          if (p) projectId = p.id;
        }
        
        if (!projectId) return "נדרש לציין פרויקט.";
        
        const { data: floors, error } = await supabase
          .from("v_floor_totals")
          .select("*")
          .eq("project_id", projectId)
          .order("floor_code");
        
        if (error) throw error;
        if (!floors || floors.length === 0) return "לא נמצאו קומות בפרויקט.";
        
        const list = floors.map(f => {
          const progress = f.total_items ? Math.round(((f.ready_items || 0) / f.total_items) * 100) : 0;
          return `• קומה ${f.floor_code}: ${f.total_apartments || 0} דירות, ${f.total_items || 0} פריטים (${progress}% מוכן)`;
        }).join("\n");
        
        return `🏢 ${floors.length} קומות:\n\n${list}`;
      }

      case "get_floor_details": {
        let floorId = args.floor_id;
        
        if (!floorId && args.project_id && args.floor_code) {
          const { data: f } = await supabase
            .from("floors")
            .select("id")
            .eq("project_id", args.project_id)
            .eq("floor_code", args.floor_code)
            .maybeSingle();
          if (f) floorId = f.id;
        }
        
        if (!floorId) return "נדרש לציין קומה (מזהה או פרויקט + קוד קומה).";
        
        const { data: floor } = await supabase
          .from("v_floor_totals")
          .select("*")
          .eq("floor_id", floorId)
          .maybeSingle();
        
        if (!floor) return "קומה לא נמצאה.";
        
        const { data: apartments } = await supabase
          .from("v_apartment_totals")
          .select("*")
          .eq("floor_id", floorId)
          .order("apt_number");
        
        const floorProgress = floor.total_items ? Math.round(((floor.ready_items || 0) / floor.total_items) * 100) : 0;
        
        let details = `🏢 **קומה ${floor.floor_code}**\n\n`;
        details += `• סה"כ פריטים: ${floor.total_items || 0}\n`;
        details += `• מוכנים: ${floor.ready_items || 0} (${floorProgress}%)\n`;
        details += `• דירות: ${floor.total_apartments || 0}\n`;
        
        if (apartments && apartments.length > 0) {
          details += "\n**דירות:**\n";
          apartments.forEach(a => {
            const aptProgress = a.total_items ? Math.round(((a.ready_items || 0) / a.total_items) * 100) : 0;
            details += `• דירה ${a.apt_number}: ${a.total_items || 0} פריטים (${aptProgress}%)\n`;
          });
        }
        
        return details;
      }

      // === APARTMENTS TOOLS ===
      case "get_apartments": {
        let query = supabase.from("v_apartment_totals").select("*");
        
        if (args.project_id) query = query.eq("project_id", args.project_id);
        if (args.floor_id) query = query.eq("floor_id", args.floor_id);
        
        const { data: apartments, error } = await query.order("apt_number").limit(50);
        if (error) throw error;
        if (!apartments || apartments.length === 0) return "לא נמצאו דירות.";
        
        const list = apartments.map(a => {
          const progress = a.total_items ? Math.round(((a.ready_items || 0) / a.total_items) * 100) : 0;
          return `• דירה ${a.apt_number}: ${a.total_items || 0} פריטים (${progress}%)`;
        }).join("\n");
        
        return `🏠 ${apartments.length} דירות:\n\n${list}`;
      }

      case "get_apartment_details": {
        let aptId = args.apartment_id;
        
        if (!aptId && args.project_id && args.apt_number) {
          const { data: a } = await supabase
            .from("apartments")
            .select("id")
            .eq("project_id", args.project_id)
            .eq("apt_number", args.apt_number)
            .maybeSingle();
          if (a) aptId = a.id;
        }
        
        if (!aptId) return "נדרש לציין דירה.";
        
        const { data: apt } = await supabase
          .from("v_apartment_totals")
          .select("*")
          .eq("apartment_id", aptId)
          .maybeSingle();
        
        if (!apt) return "דירה לא נמצאה.";
        
        const { data: items } = await supabase
          .from("items")
          .select("id, item_code, loading_status_cached, install_status_cached, location, notes")
          .eq("apt_id", aptId)
          .order("item_code");
        
        const aptProgress = apt.total_items ? Math.round(((apt.ready_items || 0) / apt.total_items) * 100) : 0;
        
        let details = `🏠 **דירה ${apt.apt_number}**\n\n`;
        details += `• סה"כ פריטים: ${apt.total_items || 0}\n`;
        details += `• מוכנים: ${apt.ready_items || 0} (${aptProgress}%)\n`;
        details += `• חלקיים: ${apt.partial_items || 0}\n`;
        details += `• ממתינים: ${apt.not_scanned_items || 0}\n`;
        
        if (items && items.length > 0) {
          details += "\n**פריטים:**\n";
          items.slice(0, 15).forEach(i => {
            const loadStatus = i.loading_status_cached === 'LOADED' ? '✓' : i.loading_status_cached === 'PARTIAL' ? '◐' : '○';
            details += `• ${loadStatus} ${i.item_code}${i.location ? ` - ${i.location}` : ''}\n`;
          });
          if (items.length > 15) details += `... ועוד ${items.length - 15} פריטים`;
        }
        
        return details;
      }

      // === ITEMS TOOLS ===
      case "get_items": {
        let query = supabase
          .from("items")
          .select("id, item_code, loading_status_cached, install_status_cached, location, notes, project_id, floor_id, apt_id");
        
        if (args.project_id) query = query.eq("project_id", args.project_id);
        if (args.floor_id) query = query.eq("floor_id", args.floor_id);
        if (args.apt_id) query = query.eq("apt_id", args.apt_id);
        if (args.loading_status) query = query.eq("loading_status_cached", args.loading_status);
        if (args.install_status) query = query.eq("install_status_cached", args.install_status);
        
        const limit = args.limit || 50;
        const { data: items, error } = await query.order("item_code").limit(limit);
        
        if (error) throw error;
        if (!items || items.length === 0) return "לא נמצאו פריטים.";
        
        const list = items.slice(0, 20).map(i => {
          const loadIcon = i.loading_status_cached === 'LOADED' ? '✓' : i.loading_status_cached === 'PARTIAL' ? '◐' : '○';
          const installIcon = i.install_status_cached === 'INSTALLED' ? '✓' : i.install_status_cached === 'ISSUE' ? '⚠' : '○';
          return `• ${i.item_code}: טעינה ${loadIcon}, התקנה ${installIcon}`;
        }).join("\n");
        
        return `📦 ${items.length} פריטים:\n\n${list}${items.length > 20 ? `\n... ועוד ${items.length - 20}` : ''}`;
      }

      case "search_items": {
        const searchQuery = args.query;
        if (!searchQuery) return "נדרשת מילת חיפוש.";
        
        let query = supabase
          .from("items")
          .select("id, item_code, location, notes, project_id, projects!inner(name)")
          .or(`item_code.ilike.%${searchQuery}%,location.ilike.%${searchQuery}%,notes.ilike.%${searchQuery}%`);
        
        if (args.project_id) query = query.eq("project_id", args.project_id);
        
        const { data: items, error } = await query.limit(20);
        if (error) throw error;
        if (!items || items.length === 0) return `לא נמצאו פריטים התואמים ל-"${searchQuery}".`;
        
        const list = items.map((i: any) => 
          `• **${i.item_code}** (${i.projects?.name || '-'}): ${i.location || '-'}`
        ).join("\n");
        
        return `🔍 נמצאו ${items.length} פריטים:\n\n${list}`;
      }

      case "get_item_details": {
        let itemId = args.item_id;
        
        if (!itemId && args.item_code && args.project_id) {
          const { data: i } = await supabase
            .from("items")
            .select("id")
            .eq("project_id", args.project_id)
            .eq("item_code", args.item_code)
            .maybeSingle();
          if (i) itemId = i.id;
        }
        
        if (!itemId) return "נדרש לציין פריט.";
        
        const { data: item } = await supabase
          .from("items")
          .select("*, projects(name), floors(floor_code), apartments(apt_number)")
          .eq("id", itemId)
          .maybeSingle();
        
        if (!item) return "פריט לא נמצא.";
        
        // Get scan history
        const { data: scans } = await supabase
          .from("scan_events")
          .select("*")
          .eq("item_id", itemId)
          .order("created_at", { ascending: false })
          .limit(10);
        
        let details = `📦 **פריט ${item.item_code}**\n\n`;
        details += `• פרויקט: ${(item as any).projects?.name || '-'}\n`;
        details += `• קומה: ${(item as any).floors?.floor_code || '-'}\n`;
        details += `• דירה: ${(item as any).apartments?.apt_number || '-'}\n`;
         details += `• מיקום: ${item.location || '-'}\n`;
         details += `• מידות: ${item.width || '-'} x ${item.height || '-'}\n`;
         details += `• הערות: ${item.field_notes || '-'}\n`;
         details += `• גובה מהריצוף: ${item.notes || '-'}\n\n`;
        details += `**סטטוס:**\n`;
        details += `• טעינה: ${item.loading_status_cached || 'NOT_LOADED'}\n`;
        details += `• התקנה: ${item.install_status_cached || 'NOT_INSTALLED'}\n`;
        
        if (scans && scans.length > 0) {
          details += "\n**היסטוריית סריקות:**\n";
          scans.forEach(s => {
            const mode = s.mode === 'loading' ? 'טעינה' : 'התקנה';
            details += `• ${formatDateTime(s.created_at)}: ${mode}`;
            if (s.issue_code) details += ` ⚠️ ${ISSUE_CODES[s.issue_code] || s.issue_code}`;
            details += "\n";
          });
        }
        
        return details;
      }

      case "get_item_stats": {
        let query = supabase.from("items").select("loading_status_cached, install_status_cached, project_id");
        if (args.project_id) query = query.eq("project_id", args.project_id);
        
        const { data: items, error } = await query.limit(10000);
        if (error) throw error;
        if (!items || items.length === 0) return "לא נמצאו פריטים.";
        
        const loadingStats: Record<string, number> = { LOADED: 0, PARTIAL: 0, NOT_LOADED: 0 };
        const installStats: Record<string, number> = { INSTALLED: 0, PARTIAL: 0, NOT_INSTALLED: 0, ISSUE: 0 };
        
        items.forEach((item: any) => {
          const loadStatus = item.loading_status_cached || "NOT_LOADED";
          const installStatus = item.install_status_cached || "NOT_INSTALLED";
          loadingStats[loadStatus] = (loadingStats[loadStatus] || 0) + 1;
          installStats[installStatus] = (installStats[installStatus] || 0) + 1;
        });
        
        return `📊 סטטיסטיקות ${items.length} פריטים:

**טעינה:**
• נטענו: ${loadingStats.LOADED}
• חלקית: ${loadingStats.PARTIAL}
• לא נטענו: ${loadingStats.NOT_LOADED}

**התקנה:**
• הותקנו: ${installStats.INSTALLED}
• חלקית: ${installStats.PARTIAL}
• לא הותקנו: ${installStats.NOT_INSTALLED}
• בעיות: ${installStats.ISSUE}`;
      }

      // === ISSUES TOOLS ===
      case "get_recent_issues": {
        const limit = args.limit || 15;
        
        let query = supabase
          .from("scan_events")
          .select(`
            id, created_at, issue_code, issue_note, subpart_code, item_id,
            items!inner(item_code, floor_id, apt_id),
            projects!inner(name)
          `)
          .not("issue_code", "is", null)
          .order("created_at", { ascending: false })
          .limit(limit);
        
        if (args.project_id) query = query.eq("project_id", args.project_id);
        if (args.issue_code) query = query.eq("issue_code", args.issue_code);
        
        const { data: issues, error } = await query;
        if (error) throw error;
        if (!issues || issues.length === 0) return "לא נמצאו תקלות אחרונות.";
        
        const list = issues.map((issue: any) => {
          const issueName = ISSUE_CODES[issue.issue_code] || issue.issue_code;
          return `• ${formatDateTime(issue.created_at)}: **${issueName}**
  פריט ${issue.items?.item_code} בפרויקט ${issue.projects?.name}${issue.issue_note ? `\n  📝 ${issue.issue_note}` : ''}`;
        }).join("\n\n");
        
        return `⚠️ ${issues.length} תקלות אחרונות:\n\n${list}`;
      }

      case "get_issue_statistics": {
        const days = args.days || 30;
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - days);
        
        let query = supabase
          .from("scan_events")
          .select("issue_code, project_id")
          .not("issue_code", "is", null)
          .gte("created_at", fromDate.toISOString());
        
        if (args.project_id) query = query.eq("project_id", args.project_id);
        
        const { data: issues, error } = await query;
        if (error) throw error;
        if (!issues || issues.length === 0) return `לא נמצאו תקלות ב-${days} הימים האחרונים.`;
        
        const issueCounts: Record<string, number> = {};
        issues.forEach((issue: any) => {
          issueCounts[issue.issue_code] = (issueCounts[issue.issue_code] || 0) + 1;
        });
        
        const sorted = Object.entries(issueCounts).sort(([, a], [, b]) => b - a);
        const mostCommon = sorted[0];
        const mostCommonName = ISSUE_CODES[mostCommon[0]] || mostCommon[0];
        
        const breakdown = sorted.map(([code, count]) => {
          const name = ISSUE_CODES[code] || code;
          const percent = Math.round((count / issues.length) * 100);
          return `• ${name}: ${count} (${percent}%)`;
        }).join("\n");
        
        return `📊 סטטיסטיקות תקלות (${days} ימים):

**סה"כ:** ${issues.length} תקלות
**הנפוצה ביותר:** ${mostCommonName} (${mostCommon[1]} פעמים)

**פירוט:**
${breakdown}`;
      }

      case "get_load_issues": {
        const limit = args.limit || 20;
        
        let query = supabase
          .from("load_issues")
          .select("*, items!inner(item_code), projects!inner(name)")
          .order("created_at", { ascending: false })
          .limit(limit);
        
        if (args.project_id) query = query.eq("project_id", args.project_id);
        
        const { data: issues, error } = await query;
        if (error) throw error;
        if (!issues || issues.length === 0) return "לא נמצאו בעיות טעינה.";
        
        const list = issues.map((i: any) => 
          `• ${formatDateTime(i.created_at)}: ${i.items?.item_code} - ${(i.issue_codes || []).join(', ')}${i.free_text ? ` (${i.free_text})` : ''}`
        ).join("\n");
        
        return `🚛 בעיות טעינה:\n\n${list}`;
      }

      // === ACTIVITY TOOLS ===
      case "get_recent_activity": {
        const limit = args.limit || 20;
        
        let query = supabase
          .from("scan_events")
          .select(`
            id, created_at, mode, loading_mark, installed_status, subpart_code, actor_email,
            items!inner(item_code),
            projects!inner(name)
          `)
          .order("created_at", { ascending: false })
          .limit(limit);
        
        if (args.mode && args.mode !== "all") query = query.eq("mode", args.mode);
        if (args.project_id) query = query.eq("project_id", args.project_id);
        
        const { data: events, error } = await query;
        if (error) throw error;
        if (!events || events.length === 0) return "לא נמצאה פעילות אחרונה.";
        
        const list = events.map((e: any) => {
          const action = e.mode === 'loading' ? 'טעינה' : 'התקנה';
          const status = e.mode === 'loading' 
            ? (e.loading_mark ? '✓' : '✗')
            : (e.installed_status || '');
          return `• ${formatDateTime(e.created_at)}: ${action} ${status} - ${e.items?.item_code} (${e.projects?.name})`;
        }).join("\n");
        
        return `📋 ${events.length} פעולות אחרונות:\n\n${list}`;
      }

      case "get_scan_events": {
        const limit = args.limit || 30;
        
        let query = supabase
          .from("scan_events")
          .select(`*, items!inner(item_code), projects!inner(name)`)
          .order("created_at", { ascending: false })
          .limit(limit);
        
        if (args.project_id) query = query.eq("project_id", args.project_id);
        if (args.item_id) query = query.eq("item_id", args.item_id);
        if (args.mode) query = query.eq("mode", args.mode);
        if (args.from_date) query = query.gte("created_at", args.from_date);
        if (args.to_date) query = query.lte("created_at", args.to_date);
        
        const { data: events, error } = await query;
        if (error) throw error;
        if (!events || events.length === 0) return "לא נמצאו אירועי סריקה.";
        
        const list = events.map((e: any) => {
          let line = `• ${formatDateTime(e.created_at)}: ${e.mode === 'loading' ? 'טעינה' : 'התקנה'}`;
          line += ` - ${e.items?.item_code}`;
          if (e.issue_code) line += ` ⚠️ ${ISSUE_CODES[e.issue_code] || e.issue_code}`;
          if (e.actor_email) line += ` (${e.actor_email.split('@')[0]})`;
          return line;
        }).join("\n");
        
        return `📡 ${events.length} אירועי סריקה:\n\n${list}`;
      }

      case "get_daily_activity": {
        const targetDate = args.date ? new Date(args.date) : new Date();
        const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0)).toISOString();
        const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999)).toISOString();
        
        let query = supabase
          .from("scan_events")
          .select("mode, loading_mark, installed_status, issue_code")
          .gte("created_at", startOfDay)
          .lte("created_at", endOfDay);
        
        if (args.project_id) query = query.eq("project_id", args.project_id);
        
        const { data: events, error } = await query;
        if (error) throw error;
        
        const total = events?.length || 0;
        const loadingEvents = events?.filter(e => e.mode === 'loading') || [];
        const installEvents = events?.filter(e => e.mode === 'install') || [];
        const loadedSuccessfully = loadingEvents.filter(e => e.loading_mark).length;
        const installedSuccessfully = installEvents.filter(e => e.installed_status === 'INSTALLED').length;
        const withIssues = events?.filter(e => e.issue_code).length || 0;
        
        const dateStr = formatDate(targetDate.toISOString());
        
        return `📅 סיכום יום ${dateStr}:

**סה"כ פעולות:** ${total}

**טעינה:** ${loadingEvents.length} סריקות
• הצלחות: ${loadedSuccessfully}

**התקנה:** ${installEvents.length} סריקות
• הצלחות: ${installedSuccessfully}

**בעיות שדווחו:** ${withIssues}`;
      }

      // === CUTLIST TOOLS ===
      case "get_cutlist_uploads": {
        const status = args.status || "all";
        const limit = args.limit || 20;
        
        let query = supabase
          .from("cutlist_uploads")
          .select("id, filename, project_name, status, created_at")
          .order("created_at", { ascending: false })
          .limit(limit);
        
        if (status !== "all") query = query.eq("status", status);
        
        const { data: uploads, error } = await query;
        if (error) throw error;
        if (!uploads || uploads.length === 0) return "לא נמצאו קבצי חיתוך.";
        
        const list = uploads.map(u => 
          `• **${u.project_name || u.filename}** (${formatDate(u.created_at)}) - ${u.status}`
        ).join("\n");
        
        return `✂️ ${uploads.length} קבצי חיתוך:\n\n${list}`;
      }

      case "get_cutlist_sections": {
        if (!args.upload_id) return "נדרש לציין מזהה קובץ.";
        
        let query = supabase
          .from("cutlist_sections")
          .select("id, section_ref, section_name, status, quantity_total, page_number")
          .eq("upload_id", args.upload_id)
          .order("ord");
        
        if (args.status && args.status !== "all") query = query.eq("status", args.status);
        
        const { data: sections, error } = await query;
        if (error) throw error;
        if (!sections || sections.length === 0) return "לא נמצאו סקשנים.";
        
        const list = sections.map(s => {
          const statusIcon = s.status === 'done' ? '✅' : s.status === 'issue' ? '⚠️' : '⏳';
          return `• ${statusIcon} ${s.section_ref}${s.section_name ? ` - ${s.section_name}` : ''} (כמות: ${s.quantity_total || '-'})`;
        }).join("\n");
        
        return `📋 ${sections.length} סקשנים:\n\n${list}`;
      }

      case "get_cutlist_progress": {
        let query = supabase.from("cutlist_sections").select("upload_id, status");
        if (args.upload_id) query = query.eq("upload_id", args.upload_id);
        
        const { data: sections, error } = await query;
        if (error) throw error;
        if (!sections || sections.length === 0) return "לא נמצאו סקשנים.";
        
        const byUpload: Record<string, { total: number; done: number; issue: number }> = {};
        sections.forEach(s => {
          if (!byUpload[s.upload_id]) byUpload[s.upload_id] = { total: 0, done: 0, issue: 0 };
          byUpload[s.upload_id].total++;
          if (s.status === 'done') byUpload[s.upload_id].done++;
          if (s.status === 'issue') byUpload[s.upload_id].issue++;
        });
        
        const list = Object.entries(byUpload).map(([id, stats]) => {
          const progress = Math.round((stats.done / stats.total) * 100);
          return `• קובץ ${id.slice(0, 8)}...: ${stats.done}/${stats.total} הושלמו (${progress}%)${stats.issue > 0 ? `, ${stats.issue} בעיות` : ''}`;
        }).join("\n");
        
        return `📊 התקדמות חיתוך:\n\n${list}`;
      }

      // === OPTIMIZATION TOOLS ===
      case "get_optimization_jobs": {
        let query = supabase
          .from("optimization_jobs")
          .select("id, source_file_name, status, bar_length_mm, created_at, projects!inner(name)")
          .order("created_at", { ascending: false })
          .limit(20);
        
        if (args.project_id) query = query.eq("project_id", args.project_id);
        if (args.status) query = query.eq("status", args.status);
        
        const { data: jobs, error } = await query;
        if (error) throw error;
        if (!jobs || jobs.length === 0) return "לא נמצאו עבודות אופטימיזציה.";
        
        const list = jobs.map((j: any) => 
          `• **${j.source_file_name}** (${j.projects?.name})\n  סטטוס: ${j.status}, אורך מוט: ${j.bar_length_mm || '-'}מ"מ`
        ).join("\n\n");
        
        return `🔧 ${jobs.length} עבודות אופטימיזציה:\n\n${list}`;
      }

      case "get_optimization_patterns": {
        if (!args.job_id) return "נדרש לציין מזהה עבודה.";
        
        const { data: patterns, error } = await supabase
          .from("optimization_patterns")
          .select("*")
          .eq("job_id", args.job_id)
          .order("pattern_index");
        
        if (error) throw error;
        if (!patterns || patterns.length === 0) return "לא נמצאו תבניות.";
        
        const list = patterns.map(p => 
          `• תבנית ${p.pattern_index}: ${p.profile_code}, ${p.rod_count} מוטות, שאריות: ${p.remainder_mm || 0}מ"מ`
        ).join("\n");
        
        return `🔧 ${patterns.length} תבניות חיתוך:\n\n${list}`;
      }

      // === MEASUREMENT TOOLS ===
      case "get_measurement_rows": {
        if (!args.project_id) return "נדרש לציין פרויקט.";
        
        let query = supabase
          .from("measurement_rows")
          .select("*")
          .eq("project_id", args.project_id)
          .order("floor_label, apartment_label");
        
        if (args.floor_label) query = query.eq("floor_label", args.floor_label);
        if (args.apartment_label) query = query.eq("apartment_label", args.apartment_label);
        
        const { data: rows, error } = await query.limit(100);
        if (error) throw error;
        if (!rows || rows.length === 0) return "לא נמצאו שורות מדידה.";
        
        // Group by floor
        const byFloor: Record<string, any[]> = {};
        rows.forEach(r => {
          const floor = r.floor_label || 'ללא קומה';
          if (!byFloor[floor]) byFloor[floor] = [];
          byFloor[floor].push(r);
        });
        
        const summary = Object.entries(byFloor).map(([floor, items]) => 
          `• קומה ${floor}: ${items.length} שורות`
        ).join("\n");
        
        return `📏 ${rows.length} שורות מדידה:\n\n${summary}`;
      }

      // === WORKER TOOLS ===
      case "get_workers": {
        let query = supabase
          .from("user_roles")
          .select("user_id, role, station, created_at");
        
        if (args.role) query = query.eq("role", args.role);
        if (args.station) query = query.eq("station", args.station);
        
        const { data: workers, error } = await query.order("created_at");
        if (error) throw error;
        if (!workers || workers.length === 0) return "לא נמצאו עובדים.";
        
        // Get emails
        const { data: users } = await supabase.functions.invoke("get-users-with-emails", {
          body: { user_ids: workers.map(w => w.user_id) }
        });
        
        const emailMap = new Map((users?.users || []).map((u: any) => [u.id, u.email]));
        
        const list = workers.map(w => {
          const email = emailMap.get(w.user_id) || 'לא ידוע';
          return `• ${email} - ${w.role}${w.station ? ` (${w.station})` : ''}`;
        }).join("\n");
        
        return `👷 ${workers.length} עובדים:\n\n${list}`;
      }

      case "get_worker_stats": {
        const days = args.days || 7;
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - days);
        
        let query = supabase
          .from("worker_activity_logs")
          .select("user_email, user_id, action_type")
          .gte("created_at", fromDate.toISOString());
        
        if (args.worker_email) query = query.eq("user_email", args.worker_email);
        
        const { data: activities, error } = await query;
        if (error) throw error;
        if (!activities || activities.length === 0) return `לא נמצאה פעילות עובדים ב-${days} הימים האחרונים.`;
        
        const { data: workers } = await supabase.from("user_roles").select("user_id, station").eq("role", "worker");
        const stationMap = new Map(workers?.map(w => [w.user_id, w.station]) || []);
        
        const workerStats = new Map<string, { email: string; station: string | null; total: number; completed: number; issues: number }>();
        
        activities.forEach(a => {
          const current = workerStats.get(a.user_id) || {
            email: a.user_email,
            station: stationMap.get(a.user_id) || null,
            total: 0,
            completed: 0,
            issues: 0
          };
          current.total++;
          if (a.action_type.includes('done')) current.completed++;
          if (a.action_type.includes('issue')) current.issues++;
          workerStats.set(a.user_id, current);
        });
        
        const sorted = Array.from(workerStats.values()).sort((a, b) => b.total - a.total);
        
        const list = sorted.slice(0, 10).map(w => 
          `• **${w.email.split('@')[0]}**${w.station ? ` (${w.station})` : ''}: ${w.total} פעולות, ${w.completed} הושלמו${w.issues > 0 ? `, ${w.issues} בעיות` : ''}`
        ).join("\n");
        
        return `👷 סטטיסטיקות עובדים (${days} ימים):\n\n${list}`;
      }

      case "get_worker_activity": {
        const days = args.days || 7;
        const limit = args.limit || 30;
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - days);
        
        let query = supabase
          .from("worker_activity_logs")
          .select("*")
          .gte("created_at", fromDate.toISOString())
          .order("created_at", { ascending: false })
          .limit(limit);
        
        if (args.worker_email) query = query.eq("user_email", args.worker_email);
        if (args.worker_id) query = query.eq("user_id", args.worker_id);
        
        const { data: activities, error } = await query;
        if (error) throw error;
        if (!activities || activities.length === 0) return "לא נמצאה פעילות.";
        
        const list = activities.map(a => 
          `• ${formatDateTime(a.created_at)}: ${a.action_type}${a.project_name ? ` - ${a.project_name}` : ''}${a.section_ref ? ` (${a.section_ref})` : ''}`
        ).join("\n");
        
        return `📋 ${activities.length} פעולות אחרונות:\n\n${list}`;
      }

      case "get_station_performance": {
        const days = args.days || 7;
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - days);
        
        const { data: workers } = await supabase.from("user_roles").select("user_id, station").eq("role", "worker");
        if (!workers || workers.length === 0) return "לא נמצאו עובדים עם תחנות.";
        
        const { data: activities } = await supabase
          .from("worker_activity_logs")
          .select("user_id, action_type")
          .gte("created_at", fromDate.toISOString());
        
        const stationStats = new Map<string, { workers: Set<string>; total: number; completed: number; issues: number }>();
        
        workers.forEach(w => {
          if (!w.station) return;
          if (!stationStats.has(w.station)) {
            stationStats.set(w.station, { workers: new Set(), total: 0, completed: 0, issues: 0 });
          }
          stationStats.get(w.station)!.workers.add(w.user_id);
        });
        
        activities?.forEach(a => {
          const worker = workers.find(w => w.user_id === a.user_id);
          if (!worker?.station) return;
          const stats = stationStats.get(worker.station);
          if (!stats) return;
          stats.total++;
          if (a.action_type.includes('done')) stats.completed++;
          if (a.action_type.includes('issue')) stats.issues++;
        });
        
        const sorted = Array.from(stationStats.entries()).sort(([, a], [, b]) => b.total - a.total);
        
        if (args.station) {
          const stats = stationStats.get(args.station);
          if (!stats) return `תחנה "${args.station}" לא נמצאה.`;
          
          return `🏭 תחנה: ${args.station}

• עובדים: ${stats.workers.size}
• סה"כ פעולות: ${stats.total}
• הושלמו: ${stats.completed}
• בעיות: ${stats.issues}
• ממוצע לעובד: ${Math.round(stats.total / stats.workers.size)} פעולות`;
        }
        
        const list = sorted.map(([station, stats]) => 
          `• **${station}**: ${stats.workers.size} עובדים, ${stats.total} פעולות, ${stats.completed} הושלמו`
        ).join("\n");
        
        return `🏭 ביצועי תחנות (${days} ימים):\n\n${list}`;
      }

      case "get_top_workers": {
        const limit = args.limit || 5;
        const days = args.days || 7;
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - days);
        
        const { data: activities, error } = await supabase
          .from("worker_activity_logs")
          .select("user_email, user_id, action_type")
          .gte("created_at", fromDate.toISOString());
        
        if (error) throw error;
        if (!activities || activities.length === 0) return `לא נמצאה פעילות ב-${days} הימים האחרונים.`;
        
        const { data: workers } = await supabase.from("user_roles").select("user_id, station").eq("role", "worker");
        const stationMap = new Map(workers?.map(w => [w.user_id, w.station]) || []);
        
        const workerTotals = new Map<string, { email: string; station: string | null; completed: number }>();
        
        activities.forEach(a => {
          if (!a.action_type.includes('done')) return;
          const current = workerTotals.get(a.user_id) || { email: a.user_email, station: stationMap.get(a.user_id) || null, completed: 0 };
          current.completed++;
          workerTotals.set(a.user_id, current);
        });
        
        const sorted = Array.from(workerTotals.values()).sort((a, b) => b.completed - a.completed).slice(0, limit);
        
        const list = sorted.map((w, i) => 
          `${i + 1}. 🏆 **${w.email.split('@')[0]}**${w.station ? ` (${w.station})` : ''}: ${w.completed} השלמות`
        ).join("\n");
        
        return `🏆 עובדים מובילים (${days} ימים):\n\n${list}`;
      }

      // === ANALYTICS TOOLS ===
      case "get_ai_insights": {
        const { data: projects } = await supabase.from("v_project_totals").select("*").eq("status", "active");
        const { data: recentIssues } = await supabase
          .from("scan_events")
          .select("issue_code, project_id, projects!inner(name)")
          .not("issue_code", "is", null)
          .order("created_at", { ascending: false })
          .limit(100);
        
        const insights: string[] = [];
        
        if (projects && projects.length > 0) {
          const sortedByUnscanned = [...projects]
            .filter(p => p.not_scanned_items && p.not_scanned_items > 0)
            .sort((a, b) => (b.not_scanned_items || 0) - (a.not_scanned_items || 0));
          
          if (sortedByUnscanned.length > 0) {
            const top = sortedByUnscanned[0];
            insights.push(`📌 **פרויקט "${top.name}"** דורש תשומת לב - ${top.not_scanned_items} פריטים טרם נסרקו`);
          }
          
          const sortedByProgress = [...projects]
            .map(p => ({ ...p, progress: p.total_items ? ((p.ready_items || 0) / p.total_items) * 100 : 0 }))
            .filter(p => p.total_items && p.total_items > 0)
            .sort((a, b) => b.progress - a.progress);
          
          if (sortedByProgress.length > 0 && sortedByProgress[0].progress > 80) {
            insights.push(`✅ **"${sortedByProgress[0].name}"** קרוב לסיום (${Math.round(sortedByProgress[0].progress)}%)`);
          }
          
          // Low progress alert
          const lowProgress = sortedByProgress.filter(p => p.progress < 20 && p.total_items && p.total_items > 10);
          if (lowProgress.length > 0) {
            insights.push(`⏳ ${lowProgress.length} פרויקטים עם התקדמות נמוכה (פחות מ-20%)`);
          }
        }
        
        if (recentIssues && recentIssues.length > 0) {
          const issueCounts: Record<string, number> = {};
          recentIssues.forEach((issue: any) => {
            issueCounts[issue.issue_code] = (issueCounts[issue.issue_code] || 0) + 1;
          });
          
          const sorted = Object.entries(issueCounts).sort(([, a], [, b]) => b - a);
          if (sorted.length > 0) {
            const [topIssue, count] = sorted[0];
            const issueName = ISSUE_CODES[topIssue] || topIssue;
            insights.push(`⚠️ התקלה הנפוצה: **${issueName}** (${count} מקרים אחרונים)`);
          }
        }
        
        if (insights.length === 0) {
          return "✨ אין תובנות מיוחדות כרגע - המערכת פועלת כסדרה!";
        }
        
        return `💡 תובנות AI:\n\n${insights.join("\n\n")}`;
      }

      case "get_productivity_trends": {
        const days = args.days || 14;
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - days);
        
        let query = supabase
          .from("scan_events")
          .select("created_at, mode, project_id")
          .gte("created_at", fromDate.toISOString())
          .order("created_at", { ascending: true });
        
        if (args.project_id) query = query.eq("project_id", args.project_id);
        
        const { data: events, error } = await query.limit(5000);
        if (error) throw error;
        if (!events || events.length === 0) return `לא נמצאה פעילות ב-${days} הימים האחרונים.`;
        
        const byDay: Record<string, number> = {};
        const byHour: Record<number, number> = {};
        const byDayOfWeek: Record<number, number> = {};
        
        events.forEach((e: any) => {
          const date = new Date(e.created_at);
          byDay[date.toISOString().split('T')[0]] = (byDay[date.toISOString().split('T')[0]] || 0) + 1;
          byHour[date.getHours()] = (byHour[date.getHours()] || 0) + 1;
          byDayOfWeek[date.getDay()] = (byDayOfWeek[date.getDay()] || 0) + 1;
        });
        
        const peakHour = Object.entries(byHour).sort(([, a], [, b]) => b - a)[0];
        const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
        const bestDayOfWeek = Object.entries(byDayOfWeek).sort(([, a], [, b]) => b - a)[0];
        
        const daysWithActivity = Object.keys(byDay).length;
        const avgPerDay = Math.round(events.length / daysWithActivity);
        
        // Trend analysis
        const sortedDays = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b));
        const halfPoint = Math.floor(sortedDays.length / 2);
        const firstHalf = sortedDays.slice(0, halfPoint).reduce((sum, [, v]) => sum + v, 0);
        const secondHalf = sortedDays.slice(halfPoint).reduce((sum, [, v]) => sum + v, 0);
        const trendPercent = firstHalf > 0 ? Math.round(((secondHalf - firstHalf) / firstHalf) * 100) : 0;
        const trendText = trendPercent > 10 ? 'עולה 📈' : trendPercent < -10 ? 'יורדת 📉' : 'יציבה ➡️';
        
        return `📊 ניתוח פרודוקטיביות (${days} ימים):

**סה"כ פעולות:** ${events.length}
**ממוצע יומי:** ${avgPerDay} פעולות

**שעת השיא:** ${peakHour[0]}:00 (${peakHour[1]} פעולות)
**היום הפעיל ביותר:** יום ${dayNames[parseInt(bestDayOfWeek[0])]}

**מגמה:** ${trendText} (${trendPercent > 0 ? '+' : ''}${trendPercent}%)`;
      }

      case "get_progress_velocity": {
        if (!args.project_id) {
          const { data: projects } = await supabase.from("v_project_totals").select("*").eq("status", "active");
          if (!projects || projects.length === 0) return "לא נמצאו פרויקטים פעילים.";
          
          const velocities = await Promise.all(projects.map(async (p) => {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            
            const { data: events } = await supabase
              .from("scan_events")
              .select("created_at")
              .eq("project_id", p.project_id)
              .eq("mode", "loading")
              .eq("loading_mark", true)
              .gte("created_at", sevenDaysAgo.toISOString());
            
            const completedLast7Days = events?.length || 0;
            const velocityPerDay = completedLast7Days / 7;
            const remaining = p.not_scanned_items || 0;
            const daysToComplete = velocityPerDay > 0 ? Math.ceil(remaining / velocityPerDay) : null;
            
            return {
              name: p.name,
              velocityPerDay: Math.round(velocityPerDay * 10) / 10,
              remaining,
              daysToComplete,
              progress: p.total_items ? Math.round(((p.ready_items || 0) / p.total_items) * 100) : 0
            };
          }));
          
          const report = velocities.map(v => {
            const eta = v.daysToComplete ? `~${v.daysToComplete} ימים` : 'לא ניתן לחשב';
            return `• **${v.name}**: ${v.velocityPerDay}/יום, נותרו ${v.remaining}, סיום: ${eta}`;
          }).join("\n");
          
          return `🚀 מהירות התקדמות:\n\n${report}`;
        }
        
        const { data: project } = await supabase.from("v_project_totals").select("*").eq("project_id", args.project_id).single();
        if (!project) return "פרויקט לא נמצא.";
        
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const { data: events } = await supabase
          .from("scan_events")
          .select("created_at")
          .eq("project_id", args.project_id)
          .eq("mode", "loading")
          .eq("loading_mark", true)
          .gte("created_at", sevenDaysAgo.toISOString());
        
        const completedLast7Days = events?.length || 0;
        const velocityPerDay = completedLast7Days / 7;
        const remaining = project.not_scanned_items || 0;
        const daysToComplete = velocityPerDay > 0 ? Math.ceil(remaining / velocityPerDay) : null;
        const eta = daysToComplete 
          ? new Date(Date.now() + daysToComplete * 24 * 60 * 60 * 1000).toLocaleDateString('he-IL')
          : 'לא ניתן לחשב';
        
        return `🚀 מהירות התקדמות - ${project.name}:

**קצב נוכחי:** ${Math.round(velocityPerDay * 10) / 10} פריטים ליום
**נותרו:** ${remaining} פריטים
**סיום משוער:** ${eta}${daysToComplete ? ` (~${daysToComplete} ימים)` : ''}
**התקדמות:** ${project.total_items ? Math.round(((project.ready_items || 0) / project.total_items) * 100) : 0}%`;
      }

      case "get_bottleneck_analysis": {
        if (!args.project_id) return "נדרש לציין פרויקט לניתוח.";
        
        const { data: floors } = await supabase.from("v_floor_totals").select("*").eq("project_id", args.project_id).order("floor_code");
        const { data: apartments } = await supabase.from("v_apartment_totals").select("*").eq("project_id", args.project_id);
        
        const bottlenecks: string[] = [];
        
        if (floors && floors.length > 0) {
          const problemFloors = floors
            .filter(f => f.total_items && f.total_items > 0)
            .map(f => ({ ...f, unscannedRatio: (f.not_scanned_items || 0) / (f.total_items || 1) }))
            .filter(f => f.unscannedRatio > 0.5)
            .sort((a, b) => b.unscannedRatio - a.unscannedRatio);
          
          if (problemFloors.length > 0) {
            bottlenecks.push(`🏢 **קומות עם התקדמות נמוכה:**`);
            problemFloors.slice(0, 3).forEach(f => {
              bottlenecks.push(`   • קומה ${f.floor_code}: ${f.not_scanned_items}/${f.total_items} לא נסרקו (${Math.round(f.unscannedRatio * 100)}%)`);
            });
          }
        }
        
        if (apartments && apartments.length > 0) {
          const problemApts = apartments
            .filter(a => a.total_items && a.total_items > 3)
            .map(a => ({ ...a, unscannedRatio: (a.not_scanned_items || 0) / (a.total_items || 1) }))
            .filter(a => a.unscannedRatio === 1)
            .slice(0, 5);
          
          if (problemApts.length > 0) {
            bottlenecks.push(`\n🏠 **דירות שטרם התחילו:**`);
            problemApts.forEach(a => {
              bottlenecks.push(`   • דירה ${a.apt_number}: ${a.total_items} פריטים ממתינים`);
            });
          }
        }
        
        const { data: issuesByFloor } = await supabase
          .from("scan_events")
          .select("issue_code, items!inner(floor_id)")
          .eq("project_id", args.project_id)
          .not("issue_code", "is", null);
        
        if (issuesByFloor && issuesByFloor.length > 0) {
          const floorIssues: Record<number, number> = {};
          issuesByFloor.forEach((e: any) => {
            if (e.items?.floor_id) {
              floorIssues[e.items.floor_id] = (floorIssues[e.items.floor_id] || 0) + 1;
            }
          });
          
          const topIssueFloors = Object.entries(floorIssues).sort(([, a], [, b]) => b - a).slice(0, 2);
          if (topIssueFloors.length > 0) {
            const floorNames = floors?.filter(f => topIssueFloors.some(([id]) => parseInt(id) === f.floor_id)).map(f => f.floor_code) || [];
            bottlenecks.push(`\n⚠️ **ריכוז תקלות** בקומות: ${floorNames.join(', ')}`);
          }
        }
        
        if (bottlenecks.length === 0) {
          return "✅ לא זוהו צווארי בקבוק משמעותיים - ההתקדמות מאוזנת!";
        }
        
        return `🔍 ניתוח צווארי בקבוק:\n\n${bottlenecks.join("\n")}`;
      }

      case "get_comparative_analysis": {
        const { data: projects } = await supabase.from("v_project_totals").select("*").eq("status", "active");
        if (!projects || projects.length < 2) return "נדרשים לפחות 2 פרויקטים פעילים להשוואה.";
        
        const projectMetrics = await Promise.all(projects.map(async (p) => {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          
          const { data: events } = await supabase
            .from("scan_events")
            .select("created_at")
            .eq("project_id", p.project_id)
            .gte("created_at", sevenDaysAgo.toISOString());
          
          const { data: issues } = await supabase
            .from("scan_events")
            .select("issue_code")
            .eq("project_id", p.project_id)
            .not("issue_code", "is", null);
          
          const progress = p.total_items ? ((p.ready_items || 0) / p.total_items) * 100 : 0;
          const velocity = (events?.length || 0) / 7;
          const issueRate = p.total_items ? ((issues?.length || 0) / p.total_items) * 100 : 0;
          
          return {
            name: p.name,
            progress: Math.round(progress),
            velocity: Math.round(velocity * 10) / 10,
            issueRate: Math.round(issueRate * 10) / 10,
            totalItems: p.total_items || 0
          };
        }));
        
        const byProgress = [...projectMetrics].sort((a, b) => b.progress - a.progress);
        const byVelocity = [...projectMetrics].sort((a, b) => b.velocity - a.velocity);
        const byIssueRate = [...projectMetrics].sort((a, b) => a.issueRate - b.issueRate);
        
        return `📊 השוואת פרויקטים:

**🏆 הכי מתקדם:** ${byProgress[0].name} (${byProgress[0].progress}%)
**🚀 הכי מהיר:** ${byVelocity[0].name} (${byVelocity[0].velocity}/יום)
**✅ הכי נקי מבעיות:** ${byIssueRate[0].name} (${byIssueRate[0].issueRate}% תקלות)

**פירוט:**
${projectMetrics.map(p => `• ${p.name}: ${p.progress}% הושלם, ${p.velocity}/יום, ${p.issueRate}% תקלות`).join("\n")}`;
      }

      // === LABELS TOOLS ===
      case "get_label_jobs": {
        let query = supabase
          .from("label_jobs")
          .select("id, project_id, total, done, status, created_at, pdf_path, projects!inner(name)")
          .order("created_at", { ascending: false })
          .limit(20);
        
        if (args.project_id) query = query.eq("project_id", args.project_id);
        if (args.status && args.status !== "all") query = query.eq("status", args.status);
        
        const { data: jobs, error } = await query;
        if (error) throw error;
        if (!jobs || jobs.length === 0) return "לא נמצאו עבודות הדפסת תוויות.";
        
        const list = jobs.map((j: any) => {
          const statusIcon = j.status === 'done' ? '✅' : j.status === 'error' ? '❌' : '⏳';
          return `• ${statusIcon} ${j.projects?.name}: ${j.done}/${j.total} תוויות (${j.status})`;
        }).join("\n");
        
        return `🏷️ ${jobs.length} עבודות תוויות:\n\n${list}`;
      }

      default:
        return `כלי "${name}" לא מוכר.`;
    }
  } catch (error) {
    console.error(`Tool ${name} error:`, error);
    return `שגיאה בביצוע הפעולה: ${error instanceof Error ? error.message : 'שגיאה לא ידועה'}`;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, context } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("AI Assistant request:", { 
      messagesCount: messages?.length,
      contextLength: context?.length,
    });

    // First call: let the AI decide which tools to use
    const initialResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...messages,
        ],
        tools,
        tool_choice: "auto",
      }),
    });

    if (!initialResponse.ok) {
      const errorText = await initialResponse.text();
      console.error("AI gateway error:", initialResponse.status, errorText);
      
      if (initialResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (initialResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "AI gateway error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const initialData = await initialResponse.json();
    const firstChoice = initialData.choices?.[0];
    
    // Check if AI wants to use tools
    if (firstChoice?.message?.tool_calls && firstChoice.message.tool_calls.length > 0) {
      console.log("AI requested tool calls:", firstChoice.message.tool_calls.length);
      
      // Execute all tool calls
      const toolResults: { role: string; tool_call_id: string; content: string }[] = [];
      
      for (const toolCall of firstChoice.message.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments || "{}");
        const result = await executeTool(toolCall.function.name, args);
        toolResults.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });
      }
      
      // Second call: get final response with tool results
      const finalResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...messages,
            firstChoice.message,
            ...toolResults,
          ],
          stream: true,
        }),
      });

      if (!finalResponse.ok) {
        const errorText = await finalResponse.text();
        console.error("AI final response error:", finalResponse.status, errorText);
        throw new Error("Failed to get final response");
      }

      console.log("AI Assistant streaming final response with tool results");

      return new Response(finalResponse.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // No tool calls - stream the direct response
    console.log("AI responding directly without tools");
    
    // Re-request with streaming since initial was not streamed
    const streamResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!streamResponse.ok) {
      throw new Error("Failed to get streaming response");
    }

    return new Response(streamResponse.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("AI Assistant error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
