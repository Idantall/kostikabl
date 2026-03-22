// Convert parsed MeasurementRow[] into WizardBuilding[] for structure editing
import { WizardBuilding, WizardFloor, WizardApartment, WizardApartmentRow, createEmptyRow } from './wizardTypes';
import { MeasurementRow } from './measurementParser';

export function measurementRowsToBuildings(rows: MeasurementRow[]): WizardBuilding[] {
  // Group rows by floor_label → apartment_label
  const floorMap = new Map<string, Map<string, MeasurementRow[]>>();

  for (const row of rows) {
    const floorKey = row.floor_label || '1';
    const aptKey = row.apartment_label || '1';

    if (!floorMap.has(floorKey)) floorMap.set(floorKey, new Map());
    const aptMap = floorMap.get(floorKey)!;
    if (!aptMap.has(aptKey)) aptMap.set(aptKey, []);
    aptMap.get(aptKey)!.push(row);
  }

  // Sort floors numerically
  const floorKeys = [...floorMap.keys()].sort((a, b) => {
    const numA = parseInt(a);
    const numB = parseInt(b);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a.localeCompare(b);
  });

  let globalAptNum = 1;

  const floors: WizardFloor[] = floorKeys.map(floorKey => {
    const aptMap = floorMap.get(floorKey)!;
    const aptKeys = [...aptMap.keys()].sort((a, b) => {
      const numA = parseInt(a);
      const numB = parseInt(b);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });

    const apartments: WizardApartment[] = aptKeys.map(aptKey => {
      const aptRows = aptMap.get(aptKey)!;
      const wizardRows: WizardApartmentRow[] = aptRows.map((row, idx) => ({
        id: crypto.randomUUID(),
        opening_no: row.opening_no ? parseInt(row.opening_no) || (idx + 1) : (idx + 1),
        location_in_apartment: row.location_in_apartment,
        contract_item: row.contract_item,
        item_code: row.item_code,
        height: row.height,
        height_overridden: false,
        width: row.width,
        width_overridden: false,
        notes: row.notes,
        hinge_direction: row.hinge_direction,
        mamad: row.mamad,
        glyph: row.glyph,
        jamb_height: row.jamb_height,
        depth: row.depth,
        is_manual: row.is_manual || false,
        engine_side: row.engine_side,
        field_notes: row.field_notes,
        internal_wing: null,
        wing_position: null,
      }));

      return {
        id: crypto.randomUUID(),
        label: `דירה ${globalAptNum++}`,
        rows: wizardRows.length > 0 ? wizardRows : [createEmptyRow(1)],
      };
    });

    return {
      id: crypto.randomUUID(),
      label: `קומה ${floorKey}`,
      apartments,
      isTypical: false,
    };
  });

  return [{
    id: crypto.randomUUID(),
    label: 'בניין 1',
    floors,
  }];
}

// Also support the active-stage excelParser output
import { ParsedApartment } from './excelParser';

export function parsedApartmentsToBuildings(apartments: ParsedApartment[]): WizardBuilding[] {
  // Group by floor_code
  const floorMap = new Map<string, ParsedApartment[]>();
  for (const apt of apartments) {
    const key = apt.floor_code;
    if (!floorMap.has(key)) floorMap.set(key, []);
    floorMap.get(key)!.push(apt);
  }

  const floorKeys = [...floorMap.keys()].sort((a, b) => {
    const numA = parseInt(a);
    const numB = parseInt(b);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a.localeCompare(b);
  });

  let globalAptNum = 1;

  const floors: WizardFloor[] = floorKeys.map(floorKey => {
    const apts = floorMap.get(floorKey)!;
    const apartments: WizardApartment[] = apts.map(apt => {
      const wizardRows: WizardApartmentRow[] = apt.items.map((item, idx) => ({
        id: crypto.randomUUID(),
        opening_no: item.opening_no ? parseInt(item.opening_no) || (idx + 1) : (idx + 1),
        location_in_apartment: item.location || null,
        contract_item: null,
        item_code: item.item_code || null,
        height: item.height || null,
        height_overridden: false,
        width: item.width || null,
        width_overridden: false,
        notes: item.notes || null,
        hinge_direction: null,
        mamad: null,
        glyph: null,
        jamb_height: null,
        depth: null,
        is_manual: false,
        engine_side: item.motor_side || null,
        field_notes: null,
        internal_wing: null,
        wing_position: null,
      }));

      return {
        id: crypto.randomUUID(),
        label: `דירה ${globalAptNum++}`,
        rows: wizardRows.length > 0 ? wizardRows : [createEmptyRow(1)],
      };
    });

    return {
      id: crypto.randomUUID(),
      label: `קומה ${floorKey}`,
      apartments,
      isTypical: false,
    };
  });

  return [{
    id: crypto.randomUUID(),
    label: 'בניין 1',
    floors,
  }];
}
