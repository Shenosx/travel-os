import { useAppData } from './useAppData.jsx'

export function useExpenses() {
  const { expenses, addExpense, updateExpense, deleteExpense, restoreExpense } = useAppData()
  return { expenses, addExpense, updateExpense, deleteExpense, restoreExpense }
}
