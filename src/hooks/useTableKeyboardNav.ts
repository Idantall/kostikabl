import { useCallback, useRef } from 'react';

/**
 * Hook for arrow-key navigation between focusable cells in a table.
 * Uses event delegation on a container ref — no per-cell props needed.
 * 
 * Attach `tableRef` to the wrapping <div> around the <table>.
 * Each interactive <td> should have data-row and data-col attributes.
 * 
 * Handles: ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Enter.
 */
export function useTableKeyboardNav() {
  const tableRef = useRef<HTMLDivElement | null>(null);

  const focusCell = useCallback((rowIdx: number, colIdx: number): boolean => {
    if (!tableRef.current) return false;

    const cell = tableRef.current.querySelector<HTMLElement>(
      `td[data-row="${rowIdx}"][data-col="${colIdx}"]`
    );
    if (!cell) return false;

    const focusable = cell.querySelector<HTMLElement>(
      'input:not([disabled]):not([type="hidden"]), [role="combobox"], textarea:not([disabled])'
    );

    if (focusable) {
      focusable.focus();
      if (focusable instanceof HTMLInputElement && focusable.type !== 'checkbox') {
        focusable.select();
      }
      return true;
    }
    return false;
  }, []);

  const onTableKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // Only handle when focus is inside a td with data-row/data-col
    const cell = target.closest<HTMLElement>('td[data-row][data-col]');
    if (!cell) return;

    const rowIdx = parseInt(cell.dataset.row || '0', 10);
    const colIdx = parseInt(cell.dataset.col || '0', 10);

    // Don't intercept arrow keys when a select dropdown is open
    if (target.getAttribute('aria-expanded') === 'true') return;

    // For text inputs, only navigate up/down (let left/right work for cursor)
    const isTextInput = target instanceof HTMLInputElement && target.type !== 'checkbox';
    
    let targetRow = rowIdx;
    let targetCol = colIdx;
    let handled = false;

    // Detect RTL
    const isRtl = !!tableRef.current?.closest('[dir="rtl"]') || 
                  tableRef.current?.getAttribute('dir') === 'rtl';

    switch (e.key) {
      case 'ArrowUp':
        targetRow = rowIdx - 1;
        handled = true;
        break;
      case 'ArrowDown':
        targetRow = rowIdx + 1;
        handled = true;
        break;
      case 'ArrowLeft':
        if (isTextInput) {
          // Only navigate if cursor is at the edge
          const input = target as HTMLInputElement;
          const atEdge = isRtl
            ? input.selectionStart === input.value.length
            : input.selectionStart === 0;
          if (!atEdge) return;
        }
        targetCol = isRtl ? colIdx + 1 : colIdx - 1;
        handled = true;
        break;
      case 'ArrowRight':
        if (isTextInput) {
          const input = target as HTMLInputElement;
          const atEdge = isRtl
            ? input.selectionStart === 0
            : input.selectionStart === input.value.length;
          if (!atEdge) return;
        }
        targetCol = isRtl ? colIdx - 1 : colIdx + 1;
        handled = true;
        break;
      case 'Enter':
        targetRow = rowIdx + 1;
        handled = true;
        break;
    }

    if (handled) {
      if (focusCell(targetRow, targetCol)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
  }, [focusCell]);

  return { tableRef, onTableKeyDown };
}
