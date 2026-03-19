import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractText } from "https://esm.sh/unpdf@0.12.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function mmToCm(mm: number): string {
  const cm = mm / 10;
  if (Number.isInteger(cm)) return String(cm);
  return cm.toFixed(1).replace(/\.?0+$/, "");
}

interface BankItem {
  id: string;
  item_no: string;
  height: string;
  width: string;
  confidence: number;
  confidence_reasons: string[];
}

interface ContractSummary {
  project_label?: string;
  location?: string;
  subtotal?: number;
  vat_percent?: number;
  vat_amount?: number;
  total?: number;
  currency?: string;
}

interface ParseResult {
  bankItems: BankItem[];
  contractSummary: ContractSummary;
  warnings: string[];
  parse_method: "text" | "ocr" | "dual";
  overall_confidence: number;
  debug_text_extraction?: {
    pdf_lib_chars: number;
    ai_chars: number;
    pdf_lib_items: number;
    ai_items: number;
  };
}

// ───── Deterministic text parser (rule-based) ─────

interface TextParsedItem {
  item_no: string;
  height_cm: number;
  width_cm: number;
  monoblock_applied: boolean;
  source_line: number;
}

function parseContractText(text: string): {
  items: TextParsedItem[];
  warnings: string[];
  summary: ContractSummary;
} {
  const items: TextParsedItem[] = [];
  const warnings: string[] = [];
  const seenItemNos = new Set<string>();

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let currentItemNo: string | null = null;
  let currentDescription = "";
  let currentStartLine = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Curtain wall pattern: "מידות:" with dimensions
    const curtainMatch = line.match(/מידות\s*:\s*(\d+)\s*\*\s*(\d+)/);
    if (curtainMatch) {
      let curtainItemNo: string | null = null;
      for (let j = Math.max(0, i - 10); j < i; j++) {
        const codeMatch = lines[j].match(/(\*?אל\d+)/);
        if (codeMatch) curtainItemNo = codeMatch[1];
      }

      if (curtainItemNo && !seenItemNos.has(curtainItemNo)) {
        const dim1 = parseInt(curtainMatch[1]);
        const dim2 = parseInt(curtainMatch[2]);
        let heightMm: number, widthMm: number;
        if (dim1 > dim2) {
          widthMm = dim1;
          heightMm = dim2;
        } else {
          heightMm = dim1;
          widthMm = dim2;
        }
        seenItemNos.add(curtainItemNo);
        items.push({
          item_no: curtainItemNo,
          height_cm: heightMm / 10,
          width_cm: widthMm / 10,
          monoblock_applied: false,
          source_line: i,
        });
      } else if (!curtainItemNo) {
        warnings.push(`קיר מסך ללא קוד פרט בשורה ${i + 1}`);
      }
      i++;
      continue;
    }

    // Item code pattern
    const itemCodeMatch = line.match(/^(\*?אל\d+)(?:\s|$|-)/);
    if (itemCodeMatch) {
      const rangeMatch = line.match(/^(\*?אל\d+)\s*-\s*(\d+)/);
      if (rangeMatch) {
        warnings.push(`${rangeMatch[0]}: קוד טווח - לא ניתן לחלץ מידות`);
        i++;
        continue;
      }
      currentItemNo = itemCodeMatch[1];
      currentDescription = line;
      currentStartLine = i;
      i++;
      continue;
    }

    if (currentItemNo) {
      currentDescription += " " + line;

      // Try multiple dimension patterns for robustness
      const dimPatterns = [
        // Standard: 1050 מ''מ 1400 מ''מ
        /(\d+)\s*מ['׳"״]{1,2}מ\s+(\d+)\s*מ['׳"״]{1,2}מ/,
        // Compact: 1050מ"מ 1400מ"מ
        /(\d+)\s*מ"מ\s+(\d+)\s*מ"מ/,
        // With x separator: 1050x1400 or 1050×1400
        /(\d{3,5})\s*[xX×]\s*(\d{3,5})/,
        // With * separator in mm context
        /(\d{3,5})\s*\*\s*(\d{3,5})\s*מ/,
      ];

      let matched = false;
      for (const pattern of dimPatterns) {
        const dimMatch = line.match(pattern);
        if (dimMatch) {
          // First value is WIDTH (רוחב), second is HEIGHT (גובה)
          let widthMm = parseInt(dimMatch[1]);
          let heightMm = parseInt(dimMatch[2]);
          let heightCm = heightMm / 10;
          let widthCm = widthMm / 10;

          const isWindow = currentDescription.includes("חלון");
          const isDoor = currentDescription.includes("דלת");
          const hasMonoblock40 = currentDescription.includes("מונובלוק 40");
          const monoApplied = hasMonoblock40 && isWindow && !isDoor;

          if (monoApplied) {
            heightCm += 30;
          }

          if (!seenItemNos.has(currentItemNo)) {
            seenItemNos.add(currentItemNo);
            items.push({
              item_no: currentItemNo,
              height_cm: heightCm,
              width_cm: widthCm,
              monoblock_applied: monoApplied,
              source_line: currentStartLine,
            });
          }

          currentItemNo = null;
          currentDescription = "";
          matched = true;
          break;
        }
      }
      if (matched) {
        i++;
        continue;
      }

      if (currentDescription.split(" ").length > 80) {
        warnings.push(`${currentItemNo}: לא נמצאו מידות`);
        currentItemNo = null;
        currentDescription = "";
      }
    }

    i++;
  }

  if (currentItemNo) {
    warnings.push(`${currentItemNo}: לא נמצאו מידות`);
  }

  // Contract summary
  const summary: ContractSummary = { currency: "₪" };
  const subtotalMatch = text.match(/סה['׳"״]כ[^0-9]*?([\d,]+(?:\.\d+)?)/);
  if (subtotalMatch) {
    summary.subtotal = parseInt(subtotalMatch[1].replace(/,/g, ""));
  }
  const vatMatch = text.match(
    /מע['׳"״]מ\s*(\d+)%?\s*[^0-9]*([\d,]+(?:\.\d+)?)/
  );
  if (vatMatch) {
    summary.vat_percent = parseInt(vatMatch[1]);
    summary.vat_amount = parseInt(vatMatch[2].replace(/,/g, ""));
  }
  const totalMatch = text.match(
    /סה['׳"״]כ\s*(?:כולל|לתשלום|סופי)[^0-9]*([\d,]+(?:\.\d+)?)/
  );
  if (totalMatch) {
    summary.total = parseInt(totalMatch[1].replace(/,/g, ""));
  }

  return { items, warnings, summary };
}

// ───── Cross-validation & confidence scoring ─────

interface AIItem {
  item_no: string;
  height_cm: number;
  width_cm: number;
  is_monoblock_applied?: boolean;
  description?: string;
}

function normalizeItemNo(code: string): string {
  return code.replace(/\s/g, "").trim();
}

function dimensionsClose(
  a: number,
  b: number,
  tolerancePercent = 5
): boolean {
  if (a === 0 && b === 0) return true;
  if (a === 0 || b === 0) return false;
  return Math.abs(a - b) / Math.max(a, b) <= tolerancePercent / 100;
}

function crossValidate(
  aiItems: AIItem[],
  pdfTextItems: TextParsedItem[],
  aiTextItems: TextParsedItem[]
): BankItem[] {
  const pdfMap = new Map<string, TextParsedItem>();
  for (const ti of pdfTextItems) {
    pdfMap.set(normalizeItemNo(ti.item_no), ti);
  }
  const aiTextMap = new Map<string, TextParsedItem>();
  for (const ti of aiTextItems) {
    aiTextMap.set(normalizeItemNo(ti.item_no), ti);
  }

  const merged = new Map<string, BankItem>();
  const processedPdfKeys = new Set<string>();
  const processedAiTextKeys = new Set<string>();

  // Process AI structured items (primary source)
  for (const ai of aiItems) {
    const key = normalizeItemNo(ai.item_no);
    const pdfItem = pdfMap.get(key);
    const aiTextItem = aiTextMap.get(key);
    const reasons: string[] = [];
    let score = 40; // base: AI-only, no corroboration

    let finalHeight = ai.height_cm;
    let finalWidth = ai.width_cm;

    // Count how many independent sources agree
    let sourcesAgreeing = 0;
    const totalSources = 1 + (pdfItem ? 1 : 0) + (aiTextItem ? 1 : 0);

    if (pdfItem) {
      processedPdfKeys.add(key);
      const hMatch = dimensionsClose(ai.height_cm, pdfItem.height_cm);
      const wMatch = dimensionsClose(ai.width_cm, pdfItem.width_cm);

      if (hMatch && wMatch) {
        sourcesAgreeing++;
        reasons.push("תואם לטקסט ישיר מ-PDF");
        // Prefer PDF-extracted dimensions (deterministic)
        finalHeight = pdfItem.height_cm;
        finalWidth = pdfItem.width_cm;
      } else {
        reasons.push(
          `PDF טקסט: ${pdfItem.height_cm}x${pdfItem.width_cm}, AI: ${ai.height_cm}x${ai.width_cm}`
        );
      }
    }

    if (aiTextItem) {
      processedAiTextKeys.add(key);
      const hMatch = dimensionsClose(ai.height_cm, aiTextItem.height_cm);
      const wMatch = dimensionsClose(ai.width_cm, aiTextItem.width_cm);

      if (hMatch && wMatch) {
        sourcesAgreeing++;
        reasons.push("תואם לניתוח טקסט OCR");
      } else if (!pdfItem) {
        reasons.push(
          `OCR טקסט: ${aiTextItem.height_cm}x${aiTextItem.width_cm}, AI: ${ai.height_cm}x${ai.width_cm}`
        );
      }
    }

    // Three-way agreement scenarios
    if (pdfItem && aiTextItem) {
      const pdfAiTextHMatch = dimensionsClose(pdfItem.height_cm, aiTextItem.height_cm);
      const pdfAiTextWMatch = dimensionsClose(pdfItem.width_cm, aiTextItem.width_cm);

      if (pdfAiTextHMatch && pdfAiTextWMatch) {
        // PDF text and AI text agree — strongest signal
        score = 98;
        reasons.push("שלושה מקורות עצמאיים מסכימים");
        finalHeight = pdfItem.height_cm; // prefer deterministic
        finalWidth = pdfItem.width_cm;
      } else if (sourcesAgreeing >= 1) {
        score = 85;
      } else {
        // All three disagree — very low confidence, prefer PDF text
        score = 35;
        reasons.push("חוסר התאמה בין כל המקורות - משתמש בטקסט ישיר מ-PDF");
        if (pdfItem) {
          finalHeight = pdfItem.height_cm;
          finalWidth = pdfItem.width_cm;
        }
      }
    } else if (pdfItem) {
      // PDF text + AI structured only
      score = sourcesAgreeing > 0 ? 92 : 50;
    } else if (aiTextItem) {
      // AI text + AI structured only
      score = sourcesAgreeing > 0 ? 75 : 45;
    } else {
      // AI structured only — lowest confidence
      score = 40;
      reasons.push("נמצא רק דרך AI - לא אותר בטקסט PDF");
    }

    // Monoblock cross-check
    if (pdfItem && ai.is_monoblock_applied !== undefined && ai.is_monoblock_applied !== pdfItem.monoblock_applied) {
      score -= 10;
      reasons.push("חוסר התאמה בכלל מונובלוק +30 ס״מ");
    }

    merged.set(key, {
      id: crypto.randomUUID(),
      item_no: ai.item_no,
      height: String(finalHeight),
      width: String(finalWidth),
      confidence: Math.max(0, Math.min(100, score)),
      confidence_reasons: reasons,
    });
  }

  // Process PDF-text-only items (not found by AI)
  for (const [key, ti] of pdfMap) {
    if (processedPdfKeys.has(key)) continue;
    const aiTextItem = aiTextMap.get(key);
    const reasons: string[] = [];
    let score = 65;

    if (aiTextItem) {
      processedAiTextKeys.add(key);
      const hMatch = dimensionsClose(ti.height_cm, aiTextItem.height_cm);
      const wMatch = dimensionsClose(ti.width_cm, aiTextItem.width_cm);
      if (hMatch && wMatch) {
        score = 88;
        reasons.push("PDF טקסט + OCR טקסט מסכימים, AI מובנה לא זיהה");
      } else {
        score = 55;
        reasons.push("נמצא בטקסט PDF, OCR שונה, AI לא זיהה");
      }
    } else {
      reasons.push("נמצא רק בטקסט ישיר מ-PDF - לא אותר ב-AI");
    }

    merged.set(key, {
      id: crypto.randomUUID(),
      item_no: ti.item_no,
      height: String(ti.height_cm),
      width: String(ti.width_cm),
      confidence: score,
      confidence_reasons: reasons,
    });
  }

  // Process AI-text-only items (found only in AI's raw text, not in PDF text or AI structured)
  for (const [key, ti] of aiTextMap) {
    if (processedAiTextKeys.has(key)) continue;
    if (merged.has(key)) continue;

    merged.set(key, {
      id: crypto.randomUUID(),
      item_no: ti.item_no,
      height: String(ti.height_cm),
      width: String(ti.width_cm),
      confidence: 50,
      confidence_reasons: ["נמצא רק דרך OCR טקסט - לא אותר בטקסט PDF ולא ב-AI מובנה"],
    });
  }

  return Array.from(merged.values());
}

// ───── PDF text extraction (deterministic, no AI) ─────

async function extractPdfText(pdfBytes: Uint8Array): Promise<string> {
  try {
    const result = await extractText(pdfBytes, { mergePages: true });
    const text = typeof result.text === "string"
      ? result.text
      : Array.isArray(result.text)
      ? result.text.join("\n")
      : "";
    console.log(`[pdf-text] Extracted ${text.length} chars from PDF`);
    return text;
  } catch (err) {
    console.error("[pdf-text] Failed to extract text:", err);
    return "";
  }
}

// ───── Main handler ─────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { storage_path, draft_id } = await req.json();
    if (!storage_path) {
      return new Response(
        JSON.stringify({ error: "storage_path is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Download PDF
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("project-contracts")
      .download(storage_path);

    if (downloadError || !fileData) {
      console.error("Download error:", downloadError);
      return new Response(
        JSON.stringify({ error: "Failed to download PDF" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const pdfBytes = new Uint8Array(await fileData.arrayBuffer());

    // ─── PATH 1: Deterministic PDF text extraction (ground truth) ───
    const pdfDirectText = await extractPdfText(pdfBytes);
    const pdfTextResult = parseContractText(pdfDirectText);
    console.log(`[contract-parser] PDF direct text: ${pdfTextResult.items.length} items from ${pdfDirectText.length} chars`);

    // ─── PATH 2: AI structured extraction + OCR raw text ───

    // Convert PDF to base64 for AI
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < pdfBytes.length; i += chunkSize) {
      const chunk = pdfBytes.subarray(i, Math.min(i + chunkSize, pdfBytes.length));
      for (let j = 0; j < chunk.length; j++) {
        binary += String.fromCharCode(chunk[j]);
      }
    }
    const base64Pdf = btoa(binary);

    const systemPrompt = `You are a contract PDF parser for an Israeli aluminum window/door manufacturer. 
Extract ALL items from this construction contract PDF.

You MUST do TWO things:
1. Extract the FULL raw text content of the PDF (preserving Hebrew text, line breaks, and all dimension values exactly as printed).
2. Extract structured items using the rules below.

RULES:
1. Item codes look like: אל01, *אל03, אל51 etc. The * prefix means a variant.
2. Dimensions are in mm format: "1050 מ''מ 1400 מ''מ" — the FIRST number is WIDTH (רוחב), the SECOND number is HEIGHT (גובה). So "1050 מ''מ 1400 מ''מ" means width=1050mm, height=1400mm.
3. Curtain wall items ("קיר מסך") have dimensions in format "מידות: WIDTH*HEIGHT" e.g. "מידות: 10080*3000" means width=10080mm, height=3000mm. The SMALLER number is height, LARGER is width.
4. MONOBLOCK +30cm RULE: If description contains "מונובלוק 40" AND the item is a WINDOW ("חלון") AND NOT a door ("דלת"), add 300mm (30cm) to the HEIGHT.
5. Convert ALL dimensions from mm to cm by dividing by 10. Keep 1 decimal if needed.
6. Range codes like "אל20-22" should be reported as skipped with a Hebrew reason.
7. Items without extractable dimensions should be skipped with a Hebrew warning.
8. Extract contract totals: subtotal, VAT percent, VAT amount, total.
9. ALL warnings/reasons MUST be in Hebrew.
10. Keep * prefix on item codes as-is.
11. For each item, report the ORIGINAL mm values you read from the PDF before conversion, so we can verify.

IMPORTANT: Return using the extract_contract_data function.`;

    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          max_tokens: 16384,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Extract all items and contract summary from this construction contract PDF. ALSO extract the full raw text of the PDF. Use the extract_contract_data function.",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:application/pdf;base64,${base64Pdf}`,
                  },
                },
              ],
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_contract_data",
                description:
                  "Return extracted contract items, raw text, and summary",
                parameters: {
                  type: "object",
                  properties: {
                    raw_text: {
                      type: "string",
                      description:
                        "Full raw text content extracted from the PDF, preserving line breaks and all text exactly as printed",
                    },
                    items: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          item_no: {
                            type: "string",
                            description: "Item code like אל01, *אל03",
                          },
                          height_cm: {
                            type: "number",
                            description:
                              "Height (גובה) in cm — this is the SECOND mm value in the contract line",
                          },
                          width_cm: {
                            type: "number",
                            description:
                              "Width (רוחב) in cm — this is the FIRST mm value in the contract line",
                          },
                          original_height_mm: {
                            type: "number",
                            description:
                              "Original height in mm as read from PDF before any rules",
                          },
                          original_width_mm: {
                            type: "number",
                            description:
                              "Original width in mm as read from PDF",
                          },
                          is_monoblock_applied: {
                            type: "boolean",
                            description:
                              "Whether +30cm monoblock rule was applied",
                          },
                          description: {
                            type: "string",
                            description: "Brief item description from PDF",
                          },
                        },
                        required: ["item_no", "height_cm", "width_cm"],
                        additionalProperties: false,
                      },
                    },
                    skipped_items: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          item_no: { type: "string" },
                          reason: { type: "string" },
                        },
                        required: ["item_no", "reason"],
                        additionalProperties: false,
                      },
                    },
                    contract_summary: {
                      type: "object",
                      properties: {
                        project_label: { type: "string" },
                        location: { type: "string" },
                        subtotal: { type: "number" },
                        vat_percent: { type: "number" },
                        vat_amount: { type: "number" },
                        total: { type: "number" },
                      },
                      additionalProperties: false,
                    },
                  },
                  required: [
                    "raw_text",
                    "items",
                    "skipped_items",
                    "contract_summary",
                  ],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "extract_contract_data" },
          },
        }),
      }
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);

      // If AI fails but we have PDF text, fall back to text-only mode
      if (pdfTextResult.items.length > 0) {
        console.log(`[contract-parser] AI failed, falling back to PDF text only (${pdfTextResult.items.length} items)`);
        const fallbackItems: BankItem[] = pdfTextResult.items.map((ti) => ({
          id: crypto.randomUUID(),
          item_no: ti.item_no,
          height: String(ti.height_cm),
          width: String(ti.width_cm),
          confidence: 70,
          confidence_reasons: ["מבוסס על טקסט ישיר מ-PDF בלבד (AI לא זמין)"],
        }));

        const result: ParseResult = {
          bankItems: fallbackItems,
          contractSummary: { ...pdfTextResult.summary, currency: "₪" },
          warnings: [...pdfTextResult.warnings, "AI לא זמין - תוצאות מבוססות על ניתוח טקסט בלבד"],
          parse_method: "text",
          overall_confidence: 70,
        };

        if (draft_id) {
          await supabase
            .from("project_wizard_drafts")
            .update({
              contract_pdf_path: storage_path,
              contract_parse_result: result as any,
              updated_at: new Date().toISOString(),
            })
            .eq("id", draft_id);
        }

        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded, please try again later" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required for AI processing" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: "AI processing failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || !toolCall.function?.arguments) {
      console.error("No tool call in AI response:", JSON.stringify(aiData));

      // Fallback to text-only
      if (pdfTextResult.items.length > 0) {
        console.log(`[contract-parser] No AI tool call, falling back to PDF text`);
        const fallbackItems: BankItem[] = pdfTextResult.items.map((ti) => ({
          id: crypto.randomUUID(),
          item_no: ti.item_no,
          height: String(ti.height_cm),
          width: String(ti.width_cm),
          confidence: 70,
          confidence_reasons: ["מבוסס על טקסט ישיר מ-PDF בלבד"],
        }));
        const result: ParseResult = {
          bankItems: fallbackItems,
          contractSummary: { ...pdfTextResult.summary, currency: "₪" },
          warnings: pdfTextResult.warnings,
          parse_method: "text",
          overall_confidence: 70,
        };
        if (draft_id) {
          await supabase.from("project_wizard_drafts").update({
            contract_pdf_path: storage_path,
            contract_parse_result: result as any,
            updated_at: new Date().toISOString(),
          }).eq("id", draft_id);
        }
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ error: "AI did not return structured data" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Failed to parse AI response:", toolCall.function.arguments);
      return new Response(
        JSON.stringify({ error: "Failed to parse AI response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Parse AI's raw text through deterministic parser too ───
    const aiRawText = parsed.raw_text || "";
    const aiTextResult = parseContractText(aiRawText);
    console.log(
      `[contract-parser] AI structured: ${(parsed.items || []).length}, AI text parsed: ${aiTextResult.items.length}, PDF text parsed: ${pdfTextResult.items.length}`
    );

    // ─── AI self-validation: check original_mm vs cm ───

    const aiItems: (AIItem & { confidence_boost: number; boost_reasons: string[] })[] = (parsed.items || []).map((item: any) => {
      const result = {
        item_no: item.item_no,
        height_cm: item.height_cm,
        width_cm: item.width_cm,
        is_monoblock_applied: item.is_monoblock_applied,
        description: item.description,
        confidence_boost: 0,
        boost_reasons: [] as string[],
      };

      if (item.original_height_mm !== undefined && item.original_width_mm !== undefined) {
        let expectedHeightCm = item.original_height_mm / 10;
        let expectedWidthCm = item.original_width_mm / 10;

        if (item.is_monoblock_applied) {
          expectedHeightCm += 30;
        }

        if (
          dimensionsClose(item.height_cm, expectedHeightCm, 1) &&
          dimensionsClose(item.width_cm, expectedWidthCm, 1)
        ) {
          result.confidence_boost = 5;
          result.boost_reasons.push("המרה mm→cm עקבית");
        } else {
          result.confidence_boost = -15;
          result.boost_reasons.push(
            `שגיאת המרה: mm(${item.original_height_mm}x${item.original_width_mm}) → cm צפוי (${expectedHeightCm}x${expectedWidthCm}) בפועל (${item.height_cm}x${item.width_cm})`
          );
          result.height_cm = expectedHeightCm;
          result.width_cm = expectedWidthCm;
        }
      }

      return result;
    });

    // ─── Three-way cross-validation ───

    const bankItems = crossValidate(aiItems, pdfTextResult.items, aiTextResult.items);

    // Apply AI self-validation boosts
    for (const item of bankItems) {
      const aiItem = aiItems.find(
        (a) => normalizeItemNo(a.item_no) === normalizeItemNo(item.item_no)
      );
      if (aiItem && aiItem.confidence_boost !== 0) {
        item.confidence = Math.max(0, Math.min(100, item.confidence + aiItem.confidence_boost));
        if (aiItem.boost_reasons.length) {
          item.confidence_reasons.push(...aiItem.boost_reasons);
        }
      }
    }

    // ─── Merge warnings ───

    const aiWarnings: string[] = (parsed.skipped_items || []).map(
      (s: any) => `${s.item_no}: ${s.reason}`
    );
    const aiWarningPrefixes = new Set(aiWarnings.map((w: string) => w.split(":")[0]));
    const textOnlyWarnings = pdfTextResult.warnings.filter(
      (w: string) => !aiWarningPrefixes.has(w.split(":")[0])
    );
    const allWarnings: string[] = [...aiWarnings, ...textOnlyWarnings];

    // Deduplicate
    const seenWarningPrefixes = new Set<string>();
    const dedupedWarnings: string[] = [];
    for (const w of allWarnings) {
      const prefix = w.split(":")[0];
      if (!seenWarningPrefixes.has(prefix)) {
        seenWarningPrefixes.add(prefix);
        dedupedWarnings.push(w);
      }
    }

    // Add low-confidence warnings
    for (const item of bankItems) {
      if (item.confidence < 50) {
        dedupedWarnings.push(
          `${item.item_no}: ביטחון נמוך (${item.confidence}%) - ${item.confidence_reasons.join(", ")}`
        );
      }
    }

    // Overall confidence
    const overall_confidence =
      bankItems.length > 0
        ? Math.round(bankItems.reduce((sum, b) => sum + b.confidence, 0) / bankItems.length)
        : 0;

    // Contract summary (prefer PDF text > AI text > AI structured)
    const contractSummary: ContractSummary = {
      project_label: parsed.contract_summary?.project_label || undefined,
      location: parsed.contract_summary?.location || undefined,
      subtotal: pdfTextResult.summary.subtotal || aiTextResult.summary.subtotal || parsed.contract_summary?.subtotal,
      vat_percent: pdfTextResult.summary.vat_percent || aiTextResult.summary.vat_percent || parsed.contract_summary?.vat_percent,
      vat_amount: pdfTextResult.summary.vat_amount || aiTextResult.summary.vat_amount || parsed.contract_summary?.vat_amount,
      total: pdfTextResult.summary.total || aiTextResult.summary.total || parsed.contract_summary?.total,
      currency: "₪",
    };

    const parse_method: ParseResult["parse_method"] =
      pdfTextResult.items.length > 0 && (parsed.items || []).length > 0
        ? "dual"
        : pdfTextResult.items.length > 0
        ? "text"
        : "ocr";

    const result: ParseResult = {
      bankItems,
      contractSummary,
      warnings: dedupedWarnings,
      parse_method,
      overall_confidence,
      debug_text_extraction: {
        pdf_lib_chars: pdfDirectText.length,
        ai_chars: aiRawText.length,
        pdf_lib_items: pdfTextResult.items.length,
        ai_items: (parsed.items || []).length,
      },
    };

    console.log(
      `[contract-parser] Final: ${bankItems.length} items, method=${parse_method}, confidence=${overall_confidence}%, pdf_text=${pdfDirectText.length}ch, ai_text=${aiRawText.length}ch`
    );

    // Update draft if provided
    if (draft_id) {
      await supabase
        .from("project_wizard_drafts")
        .update({
          contract_pdf_path: storage_path,
          contract_parse_result: result as any,
          updated_at: new Date().toISOString(),
        })
        .eq("id", draft_id);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Parse contract error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
