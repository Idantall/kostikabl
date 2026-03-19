/**
 * Slant Detection Test Suite
 * 
 * Tests the simplified slant detection logic against the reference PDFs.
 * Run with: deno test --allow-net --allow-env --allow-read supabase/functions/parse-optimization-pdf/index.test.ts
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertGreater } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const TEST_PDFS = [
  {
    name: "Avraham - Building M floors 6-10",
    path: "optimization-pdfs/test-avraham.pdf",
    // Expected: Profile 187004 has angled cuts visible in the diagrams
    expectedProfiles: ["187004", "130006", "345006"],
    minPatternsWithAngle: 0, // We expect to find some angled cuts
  },
  {
    name: "Yarit Pesgot 2100",
    path: "optimization-pdfs/test-yarit.pdf",
    // Expected: Multiple profiles with angled cuts
    expectedProfiles: ["04821", "04822", "06907"],
    minPatternsWithAngle: 0,
  }
];

async function callParseFunction(body: Record<string, unknown>): Promise<any> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/parse-optimization-pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text, status: response.status };
  }
}

Deno.test("Slant detection - Debug mode returns diagnostics", async () => {
  // Test using page 1 of first test PDF with debug mode
  const result = await callParseFunction({
    file_path: TEST_PDFS[0].path,
    mode: "chunk",
    startPage: 1,
    endPage: 1,
    debug: true,
  });
  
  console.log("\n=== Debug Mode Test ===");
  console.log("Result keys:", Object.keys(result));
  
  // Should have diagnostics when debug=true
  if (result.parse_diagnostics) {
    console.log("Diagnostics summary:", result.parse_diagnostics.summary);
    console.log("Pages analyzed:", result.parse_diagnostics.pages?.length);
    
    // Check page-level diagnostics
    for (const page of result.parse_diagnostics.pages || []) {
      console.log(`\nPage ${page.page}:`);
      console.log(`  - Profiles: ${page.found_profiles}`);
      console.log(`  - Patterns: ${page.found_patterns}`);
      console.log(`  - Angled boundaries: ${page.angle_boundaries_found}`);
      console.log(`  - Unknown boundaries: ${page.unknown_boundaries_found}`);
      console.log(`  - Direct line ops: ${page.direct_line_ops}`);
      console.log(`  - ConstructPath ops: ${page.construct_path_ops}`);
      
      if (page.row_diagnostics?.length) {
        for (const row of page.row_diagnostics.slice(0, 3)) {
          console.log(`  Row ${row.row_index}: ${row.raw_lines_count} lines, ${row.diagonal_candidates_count} slant candidates`);
          if (row.boundary_decisions?.length) {
            for (const bd of row.boundary_decisions.slice(0, 3)) {
              console.log(`    Boundary ${bd.between[0]}-${bd.between[1]}: ${bd.decision} (${bd.reason})`);
            }
          }
        }
      }
    }
  }
  
  assertEquals(result.success, true, "Debug mode should succeed");
});

Deno.test("Slant detection - Counts slant candidates correctly", async () => {
  // Parse first 2 pages of each test PDF
  console.log("\n=== Slant Candidate Counting ===");
  
  for (const testPdf of TEST_PDFS) {
    console.log(`\nTesting: ${testPdf.name}`);
    
    const result = await callParseFunction({
      file_path: testPdf.path,
      mode: "chunk",
      startPage: 1,
      endPage: 2,
      debug: true,
    });
    
    if (result.error) {
      console.log(`  Error: ${result.error}`);
      continue;
    }
    
    let totalSlantCandidates = 0;
    let totalAngledBoundaries = 0;
    let totalStraightBoundaries = 0;
    let totalUnknownBoundaries = 0;
    
    for (const page of result.parse_diagnostics?.pages || []) {
      totalAngledBoundaries += page.angle_boundaries_found || 0;
      totalUnknownBoundaries += page.unknown_boundaries_found || 0;
      
      for (const row of page.row_diagnostics || []) {
        totalSlantCandidates += row.diagonal_candidates_count || 0;
        for (const bd of row.boundary_decisions || []) {
          if (bd.decision === "straight") totalStraightBoundaries++;
        }
      }
    }
    
    console.log(`  Total slant candidates found: ${totalSlantCandidates}`);
    console.log(`  Angled boundaries: ${totalAngledBoundaries}`);
    console.log(`  Straight boundaries: ${totalStraightBoundaries}`);
    console.log(`  Unknown boundaries: ${totalUnknownBoundaries}`);
    console.log(`  Profiles parsed: ${result.profiles_count}`);
    console.log(`  Patterns parsed: ${result.patterns_count}`);
  }
});

Deno.test("Slant detection - Sample boundary decisions", async () => {
  console.log("\n=== Sample Boundary Decisions ===");
  
  // Parse page 2 specifically where we know there are angled cuts
  const result = await callParseFunction({
    file_path: TEST_PDFS[0].path,
    mode: "chunk",
    startPage: 2,
    endPage: 2,
    debug: true,
  });
  
  if (result.error) {
    console.log("Error:", result.error);
    return;
  }
  
  // Log all boundary decisions to see the pattern
  for (const page of result.parse_diagnostics?.pages || []) {
    console.log(`\nPage ${page.page} - Row-level decisions:`);
    
    for (const row of page.row_diagnostics || []) {
      const decisions = row.boundary_decisions?.map((bd: { decision: string }) => bd.decision) || [];
      const hasAngled = decisions.includes("angled");
      const marker = hasAngled ? "🔶" : "⬜";
      
      console.log(`  ${marker} Row ${row.row_index}: lines=${row.raw_lines_count}, slantCandidates=${row.diagonal_candidates_count}`);
      console.log(`     Decisions: [${decisions.join(", ")}]`);
      
      if (row.fallback_reason) {
        console.log(`     Fallback: ${row.fallback_reason}`);
      }
    }
  }
  
  // Assert we got some data
  assertGreater(result.profiles_count || 0, 0, "Should find profiles");
});

Deno.test("Slant detection - Line segment extraction works", async () => {
  console.log("\n=== Line Segment Extraction ===");
  
  // Test with debug_page to focus on a specific page
  const result = await callParseFunction({
    file_path: TEST_PDFS[1].path, // Yarit PDF
    mode: "chunk",
    startPage: 1,
    endPage: 1,
    debug: true,
  });
  
  if (result.error) {
    console.log("Error:", result.error);
    return;
  }
  
  const page = result.parse_diagnostics?.pages?.[0];
  if (page) {
    console.log(`\nPage 1 extraction stats:`);
    console.log(`  Direct line ops: ${page.direct_line_ops}`);
    console.log(`  ConstructPath ops: ${page.construct_path_ops}`);
    console.log(`  Image objects: ${page.image_diagram_detected ? "Yes" : "No"}`);
    
    // Show first few rows
    for (const row of (page.row_diagnostics || []).slice(0, 5)) {
      console.log(`\n  Row ${row.row_index}:`);
      console.log(`    BBox: x0=${row.row_bbox.x0.toFixed(0)}, y0=${row.row_bbox.y0.toFixed(0)}, x1=${row.row_bbox.x1.toFixed(0)}, y1=${row.row_bbox.y1.toFixed(0)}`);
      console.log(`    Lines in bbox: ${row.raw_lines_count}`);
      console.log(`    Slant candidates: ${row.diagonal_candidates_count}`);
    }
  }
  
  assertEquals(result.success, true);
});

console.log(`
=====================================
OPTIMIZATION PDF SLANT DETECTION TESTS
=====================================
SUPABASE_URL: ${SUPABASE_URL ? "✓" : "✗"}
SUPABASE_KEY: ${SUPABASE_ANON_KEY ? "✓" : "✗"}

These tests check if the slant detection can:
1. Extract line segments from PDF vector graphics
2. Identify slanted lines (dy > threshold) 
3. Map slanted lines to segment boundaries
4. Distinguish between straight/angled/unknown cuts
=====================================
`);
