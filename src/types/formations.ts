// Formation type definitions - separated to avoid circular dependencies
export type FormationType =
  | '4-5-1 ATTACK'
  | '4-3-2-1'
  | '4-3-1-2'
  | '4-3-3 FLAT'
  | '4-4-2 FLAT'
  | '3-5-2'
  | '3-1-4-2'
  | '3-4-2-1'
  | '3-4-1-2'
  | '3-4-3 FLAT'
  | '4-2-2-2'
  | '4-5-1 FLAT'
  | '4-2-3-1 WIDE'
  | '4-2-3-1 NARROW'
  | '4-2-1-3'
  | '4-2-4'
  | '4-1-2-1-2 WIDE'
  | '4-1-2-1-2 NARROW'
  | '4-4-1-1'
  | '4-4-2 HOLD'
  | '5-4-1 FLAT'
  | '5-3-2'
  | '5-2-1-2'
  | '5-2-2-1'
  | '5-1-2-2'
  | '4-1-4-1'
  | '4-1-3-2'
  | '4-3-3 ATTACK'
  | '5-2-3';

export interface FormationPosition {
  position: string;
  x: number;
  y: number;
}
