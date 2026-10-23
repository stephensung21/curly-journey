import { create } from 'zustand';
import type { Connection } from './types';

type State = { conn: Connection | null; loading: boolean; authError: boolean };

/** In-memory mirror of the secure-store connection, shared by every consumer. */
export const useConnectionStore = create<State>(() => ({ conn: null, loading: true, authError: false }));
