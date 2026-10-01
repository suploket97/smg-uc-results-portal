import type { Bracket } from './bracket';

export type DrawMode = 'manual' | 'random';

/** Details for the F1 qualifying certificate. Blank = not filled in. */
export interface F1Info {
  roomCode: string;
  questionPack: string;
  scoringMode: string;
  questionsPlayed: number | null;
  teamsPlayed: number | null;
  /** Teams level across the cut */
  cutLevel: 'no' | 'yes' | null;
  /** Decided by */
  cutDecidedBy: 'correct' | 'time' | 'all_through' | null;
  challengesLodged: number | null;
  questionsCorrected: number | null;
  f4Entries: string;
}

export const EMPTY_F1: F1Info = {
  roomCode: '', questionPack: '', scoringMode: '', questionsPlayed: null, teamsPlayed: null,
  cutLevel: null, cutDecidedBy: null, challengesLodged: null, questionsCorrected: null, f4Entries: '',
};

export interface EventInfo {
  name: string;
  date: string | null;
  qualifierCount: number;
  drawMode: DrawMode;
  f1: F1Info;
}

export interface Team {
  id: number;
  teamNo: string | null;
  name: string;
  source: 'import' | 'manual';
  selected: boolean;
  qualRank: number | null;
  qualScore: number | null;
  qualifyingRowId: number | null;
}

export interface Standing {
  rowId: number;
  rank: number | null;
  teamNo: string;
  team: string;
  score: number | null;
  correctAnswers: number | null;
  timeOnCorrect: number | null;
  qualified: boolean;
  qualifiedRaw: string;
  tieBreak: string;
  antiCheatFlags?: string; // admin only
}

export interface Placement {
  slot: number;
  teamId: number;
  teamName: string;
  pickOrder: number;
  method: DrawMode;
  placedAt: string;
  drawnBy: string | null;
}

export interface DrawInfo {
  id: number;
  status: 'open' | 'locked' | 'archived';
  mode: DrawMode;
  teamCount: number;
  bracketSize: number;
  byeSlots: number[];
  playableSlots: number[];
  placements: Placement[];
  place: string;
  software: string;
  createdAt: string;
  lockedAt: string | null;
  archivedAt?: string | null;
}

export interface UploadInfo {
  id: number;
  filename: string;
  sheetName: string | null;
  rowCount: number | null;
  questionCount: number | null;
  uploadedAt: string;
}

export interface MatchEdit {
  id: number;
  drawId: number;
  code: string;
  action: 'create' | 'update' | 'clear';
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  note: string | null;
  editedAt: string;
}

export interface ArchivedDraw extends DrawInfo {
  resultCount: number;
}

/** One competition (for example one year) in the list on the Setup page. */
export interface CompetitionSummary {
  id: number;
  name: string;
  date: string | null;
  createdAt: string;
  current: boolean;
  teamCount: number;
  resultCount: number;
  champion: string | null;
}

export interface AppState {
  /** Which competition this state shows. current = the one the admin pages and screens work on. */
  competition: { id: number; current: boolean };
  event: EventInfo;
  teams: Team[]; // active teams only
  teamNames: Record<number, string>; // every team ever, for history
  teamNos: Record<number, string>; // Team No., where known
  standings: Standing[];
  upload: UploadInfo | null;
  draw: DrawInfo | null;
  bracket: Bracket | null;
  serverTime: string;
  admin?: {
    edits: MatchEdit[];
    history: ArchivedDraw[];
    uploads: UploadInfo[];
    competitions: CompetitionSummary[];
  };
}
