import { useEffect, useRef } from "react";
import kostikaLogo from "@/assets/kostika-logo-new.jpg";

// A4: 210×297mm. 4cm diameter circles.
// 5 columns (210/42 ≈ 5), 7 rows (297/42 ≈ 7) = 35 stickers
const COLS = 5;
const ROWS = 7;
const STICKER_MM = 40; // 4cm diameter
const GAP_X_MM = (210 - COLS * STICKER_MM) / (COLS + 1);
const GAP_Y_MM = (297 - ROWS * STICKER_MM) / (ROWS + 1);

// Sample apartments for preview
const SAMPLE_APTS = Array.from({ length: 35 }, (_, i) => ({
  aptNumber: `${(i % 8) + 1}`,
  floor: `${Math.floor(i / 4) + 1}`,
}));

function mmToPx(mm: number) {
  // For screen preview: 1mm ≈ 3.78px at 96dpi
  return mm * 3.78;
}

function RoundSticker({ aptNumber, size }: { aptNumber: string; size: number }) {
  return (
    <div
      className="rounded-full border border-gray-300 flex flex-col items-center justify-between overflow-hidden bg-white"
      style={{
        width: size,
        height: size,
        padding: size * 0.08,
      }}
    >
      {/* Logo */}
      <img
        src={kostikaLogo}
        alt="Kostika"
        style={{
          width: size * 0.55,
          height: "auto",
          objectFit: "contain",
          marginTop: size * 0.02,
        }}
      />

      {/* QR placeholder */}
      <div
        className="flex items-center justify-center bg-gray-100 border border-gray-200"
        style={{
          width: size * 0.42,
          height: size * 0.42,
          borderRadius: 4,
        }}
      >
        <svg viewBox="0 0 100 100" width={size * 0.38} height={size * 0.38}>
          {/* Simplified QR pattern */}
          <rect x="5" y="5" width="25" height="25" fill="black" />
          <rect x="70" y="5" width="25" height="25" fill="black" />
          <rect x="5" y="70" width="25" height="25" fill="black" />
          <rect x="10" y="10" width="15" height="15" fill="white" />
          <rect x="75" y="10" width="15" height="15" fill="white" />
          <rect x="10" y="75" width="15" height="15" fill="white" />
          <rect x="13" y="13" width="9" height="9" fill="black" />
          <rect x="78" y="13" width="9" height="9" fill="black" />
          <rect x="13" y="78" width="9" height="9" fill="black" />
          {/* Random data dots */}
          {[35,42,50,58,65,72].map(x =>
            [35,42,50,58,65,72,78].map(y => (
              <rect
                key={`${x}-${y}`}
                x={x}
                y={y}
                width="5"
                height="5"
                fill={Math.random() > 0.4 ? "black" : "white"}
              />
            ))
          )}
        </svg>
      </div>

      {/* Apt number */}
      <span
        className="font-bold text-center leading-none"
        style={{
          fontSize: size * 0.11,
          marginBottom: size * 0.01,
          direction: "rtl",
        }}
      >
        דירה {aptNumber}
      </span>
    </div>
  );
}

export default function AptStickerTest() {
  const stickerSizePx = mmToPx(STICKER_MM);
  const pageWidthPx = mmToPx(210);
  const pageHeightPx = mmToPx(297);
  const gapXPx = mmToPx(GAP_X_MM);
  const gapYPx = mmToPx(GAP_Y_MM);

  return (
    <div className="min-h-screen bg-muted p-4">
      <div className="max-w-4xl mx-auto mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">תצוגה מקדימה - מדבקות דירות עגולות</h1>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 no-print"
        >
          הדפס A4
        </button>
      </div>

      {/* A4 Page */}
      <div
        className="mx-auto bg-white shadow-lg apt-sticker-page"
        style={{
          width: pageWidthPx,
          height: pageHeightPx,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {SAMPLE_APTS.slice(0, COLS * ROWS).map((apt, idx) => {
          const col = idx % COLS;
          const row = Math.floor(idx / COLS);
          const left = gapXPx + col * (stickerSizePx + gapXPx);
          const top = gapYPx + row * (stickerSizePx + gapYPx);

          return (
            <div
              key={idx}
              style={{
                position: "absolute",
                left,
                top,
                width: stickerSizePx,
                height: stickerSizePx,
              }}
            >
              <RoundSticker aptNumber={apt.aptNumber} size={stickerSizePx} />
            </div>
          );
        })}
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .apt-sticker-page, .apt-sticker-page * { visibility: visible !important; }
          .apt-sticker-page {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 210mm !important;
            height: 297mm !important;
            box-shadow: none !important;
            margin: 0 !important;
          }
          .no-print { display: none !important; }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>
    </div>
  );
}
