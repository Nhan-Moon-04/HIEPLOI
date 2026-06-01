import { create } from 'zustand';
import dayjs from 'dayjs';

const useMonthStore = create((set) => ({
  monthKey: dayjs().format('YYYY-MM'),
  setMonthKey: (monthKey) => set({ monthKey }),
}));

export default useMonthStore;
