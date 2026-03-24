import React, { createContext, useContext, useReducer, useCallback, useEffect, useState } from 'react';
import { BankItem, WizardFloor, WizardBuilding, WizardDraft, ProjectType, ApartmentType, FloorType, createEmptyFloor, createEmptyApartment, createEmptyBuilding, cloneBuilding, WizardApartmentRow, WizardApartment, createEmptyRow } from '@/lib/wizardTypes';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// State
interface WizardState {
  draftId: string | null;
  name: string;
  bankItems: BankItem[];
  buildings: WizardBuilding[];
  currentBuildingId: string | null;
  currentStep: number;
  isSaving: boolean;
  lastSaved: Date | null;
  projectType: ProjectType;
  contractPdfPath: string | null;
  contractParseResult: any | null;
  apartmentTypes: ApartmentType[];
  floorTypes: FloorType[];
}

// Helper to get floors for the current building
function getFloorsForBuilding(state: WizardState): WizardFloor[] {
  const building = state.buildings.find(b => b.id === state.currentBuildingId);
  return building?.floors || [];
}

// Helper to update floors in the current building
function updateCurrentBuildingFloors(state: WizardState, updater: (floors: WizardFloor[]) => WizardFloor[]): WizardState {
  return {
    ...state,
    buildings: state.buildings.map(b =>
      b.id === state.currentBuildingId
        ? { ...b, floors: updater(b.floors) }
        : b
    ),
  };
}

// Actions
type WizardAction =
  | { type: 'SET_DRAFT'; payload: { id: string; name: string; bankItems: BankItem[]; buildings: WizardBuilding[]; projectType?: ProjectType; contractPdfPath?: string | null; contractParseResult?: any | null; apartmentTypes?: ApartmentType[]; floorTypes?: FloorType[] } }
  | { type: 'SET_NAME'; payload: string }
  | { type: 'SET_STEP'; payload: number }
  | { type: 'SET_BANK_ITEMS'; payload: BankItem[] }
  | { type: 'ADD_BANK_ITEM'; payload: BankItem }
  | { type: 'UPDATE_BANK_ITEM'; payload: { id: string; field: keyof BankItem; value: string } }
  | { type: 'DELETE_BANK_ITEM'; payload: string }
  | { type: 'SET_CURRENT_BUILDING'; payload: string }
  | { type: 'ADD_BUILDING'; payload?: WizardBuilding }
  | { type: 'DELETE_BUILDING'; payload: string }
  | { type: 'CLONE_BUILDING'; payload: string }
  | { type: 'UPDATE_BUILDING_LABEL'; payload: { id: string; label: string } }
  | { type: 'SET_FLOORS'; payload: WizardFloor[] }
  | { type: 'ADD_FLOOR'; payload: WizardFloor }
  | { type: 'UPDATE_FLOOR'; payload: { id: string; updates: Partial<WizardFloor> } }
  | { type: 'DELETE_FLOOR'; payload: string }
  | { type: 'ADD_APARTMENT'; payload: { floorId: string; label: string } }
  | { type: 'UPDATE_APARTMENT'; payload: { floorId: string; apartmentId: string; label: string } }
  | { type: 'DELETE_APARTMENT'; payload: { floorId: string; apartmentId: string } }
  | { type: 'UPDATE_APARTMENT_ROW'; payload: { floorId: string; apartmentId: string; rowId: string; updates: Partial<WizardApartmentRow> } }
  | { type: 'ADD_APARTMENT_ROW'; payload: { floorId: string; apartmentId: string; count?: number } }
  | { type: 'DELETE_APARTMENT_ROW'; payload: { floorId: string; apartmentId: string; rowId: string } }
  | { type: 'SET_SAVING'; payload: boolean }
  | { type: 'SET_LAST_SAVED'; payload: Date }
  | { type: 'CLONE_FLOORS'; payload: { sourceFloorId: string; count: number; startLabel: number } }
  | { type: 'SET_PROJECT_TYPE'; payload: ProjectType }
  | { type: 'SET_CONTRACT_DATA'; payload: { contractPdfPath: string; contractParseResult: any } }
  | { type: 'SAVE_APARTMENT_TYPE'; payload: { name: string; apartment: WizardApartment } }
  | { type: 'DELETE_APARTMENT_TYPE'; payload: string }
  | { type: 'APPLY_APARTMENT_TYPE'; payload: { typeId: string; floorId: string; apartmentId: string } }
  | { type: 'SAVE_FLOOR_TYPE'; payload: { name: string; floor: WizardFloor } }
  | { type: 'DELETE_FLOOR_TYPE'; payload: string }
  | { type: 'APPLY_FLOOR_TYPE'; payload: { typeId: string; targetFloorIds: string[] } }
  | { type: 'RESET' };

const initialState: WizardState = {
  draftId: null,
  name: '',
  bankItems: [],
  buildings: [createEmptyBuilding('בניין 1')],
  currentBuildingId: null,
  currentStep: 0,
  isSaving: false,
  lastSaved: null,
  projectType: 'blind_jambs',
  contractPdfPath: null,
  contractParseResult: null,
  apartmentTypes: [],
  floorTypes: [],
};

// Helper: get the max apartment number across all buildings
function getGlobalMaxAptNum(buildings: WizardBuilding[]): number {
  let max = 0;
  buildings.forEach(b => {
    b.floors.forEach(f => {
      f.apartments.forEach(apt => {
        const match = apt.label.match(/דירה\s*(\d+)/);
        if (match) max = Math.max(max, parseInt(match[1]));
      });
    });
  });
  return max;
}

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_DRAFT': {
      const buildings = action.payload.buildings;
      return {
        ...state,
        draftId: action.payload.id,
        name: action.payload.name,
        bankItems: action.payload.bankItems,
        buildings,
        currentBuildingId: buildings[0]?.id || null,
        projectType: action.payload.projectType || 'blind_jambs',
        contractPdfPath: action.payload.contractPdfPath || null,
        contractParseResult: action.payload.contractParseResult || null,
        apartmentTypes: action.payload.apartmentTypes || [],
        floorTypes: action.payload.floorTypes || [],
      };
    }
    
    case 'SET_NAME':
      return { ...state, name: action.payload };
    
    case 'SET_STEP':
      return { ...state, currentStep: action.payload };
    
    case 'SET_BANK_ITEMS':
      return { ...state, bankItems: action.payload };
    
    case 'ADD_BANK_ITEM':
      return { ...state, bankItems: [...state.bankItems, action.payload] };
    
    case 'UPDATE_BANK_ITEM':
      return {
        ...state,
        bankItems: state.bankItems.map(item =>
          item.id === action.payload.id
            ? { ...item, [action.payload.field]: action.payload.value }
            : item
        ),
      };
    
    case 'DELETE_BANK_ITEM':
      return {
        ...state,
        bankItems: state.bankItems.filter(item => item.id !== action.payload),
      };

    // Building actions
    case 'SET_CURRENT_BUILDING':
      return { ...state, currentBuildingId: action.payload };

    case 'ADD_BUILDING': {
      const nextNum = state.buildings.length + 1;
      const newBuilding = action.payload || createEmptyBuilding(`בניין ${nextNum}`);
      return {
        ...state,
        buildings: [...state.buildings, newBuilding],
        currentBuildingId: newBuilding.id,
      };
    }

    case 'DELETE_BUILDING': {
      if (state.buildings.length <= 1) return state;
      const filtered = state.buildings.filter(b => b.id !== action.payload);
      return {
        ...state,
        buildings: filtered,
        currentBuildingId: state.currentBuildingId === action.payload
          ? filtered[0]?.id || null
          : state.currentBuildingId,
      };
    }

    case 'CLONE_BUILDING': {
      const source = state.buildings.find(b => b.id === action.payload);
      if (!source) return state;
      const nextNum = state.buildings.length + 1;
      const counter = { value: getGlobalMaxAptNum(state.buildings) + 1 };
      const cloned = cloneBuilding(source, `בניין ${nextNum}`, counter);
      return {
        ...state,
        buildings: [...state.buildings, cloned],
        currentBuildingId: cloned.id,
      };
    }

    case 'UPDATE_BUILDING_LABEL':
      return {
        ...state,
        buildings: state.buildings.map(b =>
          b.id === action.payload.id ? { ...b, label: action.payload.label } : b
        ),
      };
    
    // Floor actions - scoped to current building
    case 'SET_FLOORS':
      return updateCurrentBuildingFloors(state, () => action.payload);
    
    case 'ADD_FLOOR':
      return updateCurrentBuildingFloors(state, floors => [...floors, action.payload]);
    
    case 'UPDATE_FLOOR':
      return updateCurrentBuildingFloors(state, floors =>
        floors.map(floor =>
          floor.id === action.payload.id
            ? { ...floor, ...action.payload.updates }
            : floor
        )
      );
    
    case 'DELETE_FLOOR':
      return updateCurrentBuildingFloors(state, floors =>
        floors.filter(floor => floor.id !== action.payload)
      );
    
    case 'ADD_APARTMENT':
      return updateCurrentBuildingFloors(state, floors =>
        floors.map(floor =>
          floor.id === action.payload.floorId
            ? { ...floor, apartments: [...floor.apartments, createEmptyApartment(action.payload.label)] }
            : floor
        )
      );
    
    case 'UPDATE_APARTMENT':
      return updateCurrentBuildingFloors(state, floors =>
        floors.map(floor =>
          floor.id === action.payload.floorId
            ? {
                ...floor,
                apartments: floor.apartments.map(apt =>
                  apt.id === action.payload.apartmentId
                    ? { ...apt, label: action.payload.label }
                    : apt
                ),
              }
            : floor
        )
      );
    
    case 'DELETE_APARTMENT':
      return updateCurrentBuildingFloors(state, floors =>
        floors.map(floor =>
          floor.id === action.payload.floorId
            ? { ...floor, apartments: floor.apartments.filter(apt => apt.id !== action.payload.apartmentId) }
            : floor
        )
      );
    
    case 'UPDATE_APARTMENT_ROW':
      return updateCurrentBuildingFloors(state, floors =>
        floors.map(floor =>
          floor.id === action.payload.floorId
            ? {
                ...floor,
                apartments: floor.apartments.map(apt =>
                  apt.id === action.payload.apartmentId
                    ? {
                        ...apt,
                        rows: apt.rows.map(row =>
                          row.id === action.payload.rowId
                            ? { ...row, ...action.payload.updates }
                            : row
                        ),
                      }
                    : apt
                ),
              }
            : floor
        )
      );
    
    case 'ADD_APARTMENT_ROW': {
      const count = action.payload.count || 1;
      return updateCurrentBuildingFloors(state, floors =>
        floors.map(floor =>
          floor.id === action.payload.floorId
            ? {
                ...floor,
                apartments: floor.apartments.map(apt => {
                  if (apt.id === action.payload.apartmentId) {
                    const maxLimit = 35;
                    let currentRows = [...apt.rows];
                    for (let i = 0; i < count; i++) {
                      if (currentRows.length >= maxLimit) break;
                      const nextOpeningNo = currentRows.length > 0
                        ? Math.max(...currentRows.map(r => r.opening_no)) + 1
                        : 1;
                      currentRows = [...currentRows, createEmptyRow(nextOpeningNo)];
                    }
                    return { ...apt, rows: currentRows };
                  }
                  return apt;
                }),
              }
            : floor
        )
      );
    }
    
    case 'DELETE_APARTMENT_ROW':
      return updateCurrentBuildingFloors(state, floors =>
        floors.map(floor =>
          floor.id === action.payload.floorId
            ? {
                ...floor,
                apartments: floor.apartments.map(apt =>
                  apt.id === action.payload.apartmentId
                    ? { ...apt, rows: apt.rows.filter(row => row.id !== action.payload.rowId) }
                    : apt
                ),
              }
            : floor
        )
      );
    
    case 'CLONE_FLOORS': {
      const currentFloors = getFloorsForBuilding(state);
      const sourceFloor = currentFloors.find(f => f.id === action.payload.sourceFloorId);
      if (!sourceFloor) return state;
      
      let nextAptNum = getGlobalMaxAptNum(state.buildings) + 1;
      
      const newFloors: WizardFloor[] = [];
      for (let i = 0; i < action.payload.count; i++) {
        const floorLabel = `קומה ${action.payload.startLabel + i}`;
        const clonedFloor: WizardFloor = {
          id: crypto.randomUUID(),
          label: floorLabel,
          isTypical: false,
          sourceFloorTypeName: sourceFloor.sourceFloorTypeName || null,
          apartments: sourceFloor.apartments.map(apt => ({
            id: crypto.randomUUID(),
            label: `דירה ${nextAptNum++}`,
            sourceApartmentTypeName: apt.sourceApartmentTypeName || null,
            rows: apt.rows.map(row => ({ ...row, id: crypto.randomUUID() })),
          })),
        };
        newFloors.push(clonedFloor);
      }
      
      return updateCurrentBuildingFloors(state, floors => [...floors, ...newFloors]);
    }
    
    case 'SET_SAVING':
      return { ...state, isSaving: action.payload };
    
    case 'SET_LAST_SAVED':
      return { ...state, lastSaved: action.payload };
    
    case 'SET_PROJECT_TYPE':
      return { ...state, projectType: action.payload };
    
    case 'SET_CONTRACT_DATA':
      return {
        ...state,
        contractPdfPath: action.payload.contractPdfPath,
        contractParseResult: action.payload.contractParseResult,
      };
    
    case 'SAVE_APARTMENT_TYPE': {
      const { name, apartment } = action.payload;
      const newType: ApartmentType = {
        id: crypto.randomUUID(),
        name,
        rows: apartment.rows.map(row => ({ ...row, id: crypto.randomUUID() })),
      };
      return { ...state, apartmentTypes: [...state.apartmentTypes, newType] };
    }

    case 'DELETE_APARTMENT_TYPE':
      return { ...state, apartmentTypes: state.apartmentTypes.filter(t => t.id !== action.payload) };

    case 'APPLY_APARTMENT_TYPE': {
      const aptType = state.apartmentTypes.find(t => t.id === action.payload.typeId);
      if (!aptType) return state;
      const newRows = aptType.rows.map((row, idx) => ({
        ...row,
        id: crypto.randomUUID(),
        opening_no: idx + 1,
      }));
      return updateCurrentBuildingFloors(state, floors =>
        floors.map(floor =>
          floor.id === action.payload.floorId
            ? {
                ...floor,
                apartments: floor.apartments.map(apt =>
                  apt.id === action.payload.apartmentId
                    ? { ...apt, rows: newRows, sourceApartmentTypeName: aptType.name }
                    : apt
                ),
              }
            : floor
        )
      );
    }

    case 'SAVE_FLOOR_TYPE': {
      const { name, floor } = action.payload;
      const newType: FloorType = {
        id: crypto.randomUUID(),
        name,
        apartments: floor.apartments.map(apt => ({
          ...apt,
          id: crypto.randomUUID(),
          rows: apt.rows.map(row => ({ ...row, id: crypto.randomUUID() })),
        })),
      };
      // Also mark the source floor with this type name so it won't be overwritten
      const stateWithType = { ...state, floorTypes: [...state.floorTypes, newType] };
      return updateCurrentBuildingFloors(stateWithType, floors =>
        floors.map(f => f.id === floor.id ? { ...f, sourceFloorTypeName: name } : f)
      );
    }

    case 'DELETE_FLOOR_TYPE':
      return { ...state, floorTypes: state.floorTypes.filter(t => t.id !== action.payload) };

    case 'APPLY_FLOOR_TYPE': {
      const floorType = state.floorTypes.find(t => t.id === action.payload.typeId);
      if (!floorType) return state;
      let nextAptNum = getGlobalMaxAptNum(state.buildings) + 1;
      return updateCurrentBuildingFloors(state, floors =>
        floors.map(floor => {
          if (!action.payload.targetFloorIds.includes(floor.id)) return floor;
          // Skip floors that already have this type applied (don't overwrite source)
          if (floor.sourceFloorTypeName === floorType.name) return floor;
          return {
            ...floor,
            sourceFloorTypeName: floorType.name,
            apartments: floorType.apartments.map(apt => ({
              id: crypto.randomUUID(),
              label: `דירה ${nextAptNum++}`,
              sourceApartmentTypeName: apt.sourceApartmentTypeName || null,
              rows: apt.rows.map((row, idx) => ({
                ...row,
                id: crypto.randomUUID(),
                opening_no: idx + 1,
              })),
            })),
          };
        })
      );
    }

    case 'RESET':
      return initialState;
    
    default:
      return state;
  }
}

// Backward compatibility: convert old formats to { buildings, apartmentTypes, floorTypes }
function migrateFloorsData(raw: any): { buildings: WizardBuilding[]; apartmentTypes: ApartmentType[]; floorTypes: FloorType[] } {
  // V2 format: wrapper object with __v key
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && raw.__v === 2) {
    return {
      buildings: raw.buildings || [createEmptyBuilding('בניין 1')],
      apartmentTypes: raw.apartmentTypes || [],
      floorTypes: raw.floorTypes || [],
    };
  }
  // Legacy array format
  const floors = Array.isArray(raw) ? raw : [];
  if (floors.length === 0) {
    return { buildings: [createEmptyBuilding('בניין 1')], apartmentTypes: [], floorTypes: [] };
  }
  // Buildings format (has 'label' and 'floors' keys)
  if (floors[0] && 'floors' in floors[0] && 'label' in floors[0] && Array.isArray(floors[0].floors)) {
    return { buildings: floors as WizardBuilding[], apartmentTypes: [], floorTypes: [] };
  }
  // Old flat floors format
  return {
    buildings: [{ id: crypto.randomUUID(), label: 'בניין 1', floors: floors as WizardFloor[] }],
    apartmentTypes: [],
    floorTypes: [],
  };
}

// Context
interface WizardContextType {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  /** Convenience: floors of the currently selected building */
  currentFloors: WizardFloor[];
  saveDraft: () => Promise<void>;
  loadDraft: (draftId: string) => Promise<void>;
  createNewDraft: () => Promise<string | null>;
  deleteDraft: (draftId: string) => Promise<void>;
}

const WizardContext = createContext<WizardContextType | null>(null);

export function WizardProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(wizardReducer, initialState);
  const [userId, setUserId] = useState<string | null>(null);

  const currentFloors = getFloorsForBuilding(state);

  // Get user ID on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });
  }, []);

  // Auto-save draft when state changes
  useEffect(() => {
    if (!state.draftId || state.isSaving) return;
    
    const timeoutId = setTimeout(() => {
      saveDraft();
    }, 2000);
    
    return () => clearTimeout(timeoutId);
  }, [state.name, state.bankItems, state.buildings, state.projectType, state.contractPdfPath, state.apartmentTypes, state.floorTypes]);

  const saveDraft = useCallback(async () => {
    if (!state.draftId) {
      console.warn('saveDraft: No draftId available');
      toast.error('שגיאה בשמירת טיוטה: לא נמצא מזהה טיוטה');
      return;
    }
    if (!userId) {
      console.warn('saveDraft: No userId available');
      toast.error('שגיאה בשמירת טיוטה: משתמש לא מחובר');
      return;
    }
    
    dispatch({ type: 'SET_SAVING', payload: true });
    
    try {
      const updatePayload: any = {
        name: state.name,
        bank_items: JSON.parse(JSON.stringify(state.bankItems)),
        // Save buildings + types into the 'floors' JSONB column as a wrapper
        floors: JSON.parse(JSON.stringify({
          __v: 2,
          buildings: state.buildings,
          apartmentTypes: state.apartmentTypes,
          floorTypes: state.floorTypes,
        })),
        project_type: state.projectType,
        contract_pdf_path: state.contractPdfPath,
        contract_parse_result: state.contractParseResult ? JSON.parse(JSON.stringify(state.contractParseResult)) : null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('project_wizard_drafts')
        .update(updatePayload)
        .eq('id', state.draftId)
        .select();
      
      if (error) {
        console.error('Supabase update error:', error);
        throw error;
      }
      
      dispatch({ type: 'SET_LAST_SAVED', payload: new Date() });
    } catch (error: any) {
      console.error('Failed to save draft:', error);
      const errorMessage = error?.message || error?.code || 'שגיאה לא ידועה';
      toast.error(`שגיאה בשמירת טיוטה: ${errorMessage}`);
    } finally {
      dispatch({ type: 'SET_SAVING', payload: false });
    }
  }, [state.draftId, state.name, state.bankItems, state.buildings, state.projectType, state.contractPdfPath, state.contractParseResult, state.apartmentTypes, state.floorTypes, userId]);

  const loadDraft = useCallback(async (draftId: string) => {
    try {
      const { data, error } = await supabase
        .from('project_wizard_drafts')
        .select('*')
        .eq('id', draftId)
        .single();
      
      if (error) throw error;
      
      const rawFloors = data.floors as unknown as any;
      const { buildings, apartmentTypes, floorTypes } = migrateFloorsData(rawFloors);

      dispatch({
        type: 'SET_DRAFT',
        payload: {
          id: data.id,
          name: data.name || '',
          bankItems: (data.bank_items as unknown as BankItem[]) || [],
          buildings,
          projectType: (data as any).project_type || 'blind_jambs',
          contractPdfPath: (data as any).contract_pdf_path || null,
          contractParseResult: (data as any).contract_parse_result || null,
          apartmentTypes,
          floorTypes,
        },
      });
    } catch (error: any) {
      console.error('Failed to load draft:', error);
      toast.error('שגיאה בטעינת טיוטה');
    }
  }, []);

  const createNewDraft = useCallback(async (): Promise<string | null> => {
    if (!userId) return null;
    
    try {
      const defaultBuilding = createEmptyBuilding('בניין 1');
      const { data, error } = await supabase
        .from('project_wizard_drafts')
        .insert({
          created_by: userId,
          name: '',
          bank_items: [],
          floors: [defaultBuilding] as any,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      dispatch({
        type: 'SET_DRAFT',
        payload: {
          id: data.id,
          name: '',
          bankItems: [],
          buildings: [defaultBuilding],
        },
      });
      
      return data.id;
    } catch (error: any) {
      console.error('Failed to create draft:', error);
      toast.error('שגיאה ביצירת טיוטה');
      return null;
    }
  }, [userId]);

  const deleteDraft = useCallback(async (draftId: string) => {
    try {
      const { error } = await supabase
        .from('project_wizard_drafts')
        .delete()
        .eq('id', draftId);
      
      if (error) throw error;
      
      dispatch({ type: 'RESET' });
    } catch (error: any) {
      console.error('Failed to delete draft:', error);
      toast.error('שגיאה במחיקת טיוטה');
    }
  }, []);

  return (
    <WizardContext.Provider value={{ state, dispatch, currentFloors, saveDraft, loadDraft, createNewDraft, deleteDraft }}>
      {children}
    </WizardContext.Provider>
  );
}

export function useWizard() {
  const context = useContext(WizardContext);
  if (!context) {
    throw new Error('useWizard must be used within a WizardProvider');
  }
  return context;
}
