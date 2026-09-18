import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from './useAuth.jsx'
import { getSupabaseClient } from '../lib/supabase/client.js'
import {
  cloudExpenseCapabilities,
  createCloudExpense,
  deleteCloudExpense,
  getCloudExpenseSettlement,
  getCloudTripExpenses,
  peopleForCloudExpenses,
  updateCloudExpense,
} from '../lib/trips/expenses.js'
import { getCloudTripMembers } from '../lib/trips/members.js'
import { createCloudRealtimeReload } from '../lib/realtime/cloudRealtime.js'
import { useCloudRealtimeRefresh } from './useCloudTripRealtime.js'
import { useCloudSync } from './useCloudSync.jsx'

export function useCloudTripExpenses(trip) {
  const { session, user } = useAuth()
  const { runCloudWrite } = useCloudSync()
  const tripId = trip?.id ?? null
  const [expenses, setExpenses] = useState([])
  const [members, setMembers] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!tripId || !session?.user) {
      setExpenses([])
      setMembers([])
      setError(null)
      setLoading(false)
      return { expenses: [], members: [], error: null }
    }

    const client = getSupabaseClient()
    setLoading(true)
    const [expenseResult, memberResult] = await Promise.all([
      getCloudTripExpenses({ client, session, tripId }),
      getCloudTripMembers({ client, session, tripId }),
    ])
    setExpenses(expenseResult.expenses)
    setMembers(memberResult.members)
    setError(expenseResult.error || memberResult.error)
    setLoading(false)
    return {
      expenses: expenseResult.expenses,
      members: memberResult.members,
      error: expenseResult.error || memberResult.error,
    }
  }, [session, tripId])

  useEffect(() => {
    reload()
  }, [reload])

  const handleRealtime = useCallback(
    createCloudRealtimeReload(reload, {
      userId: user?.id,
      clear(message) {
        setExpenses([])
        setMembers([])
        setError(message)
        setLoading(false)
      },
    }),
    [reload, user?.id],
  )
  const { liveError } = useCloudRealtimeRefresh(tripId, ['expenses', 'access', 'gone'], handleRealtime)

  const people = useMemo(() => peopleForCloudExpenses(members, expenses), [members, expenses])
  const memberIds = useMemo(() => members.map((member) => member.userId), [members])
  const actorIds = useMemo(() => people.map((person) => person.userId), [people])
  const settlement = useMemo(() => getCloudExpenseSettlement(expenses, memberIds), [expenses, memberIds])
  const myRole = members.find((member) => member.userId === user?.id)?.role ?? null
  const capabilities = cloudExpenseCapabilities(myRole, user?.id)

  const save = useCallback(
    async (input) => {
      const isUpdate = Boolean(input.id)
      const result = await runCloudWrite({
        op: {
          entity: 'expense',
          action: isUpdate ? 'update' : 'create',
          cloudTripId: tripId,
          cloudEntityId: isUpdate ? input.id : undefined,
          payload: { ...input, tripId, convertedCurrency: trip?.currency },
        },
        mutate: (op) => {
          const args = {
            client: getSupabaseClient(),
            session,
            tripId: op.cloudTripId,
            tripCurrency: trip?.currency,
            actorIds,
            input: op.payload,
            id: op.cloudEntityId,
          }
          return op.action === 'update' ? updateCloudExpense(args) : createCloudExpense(args)
        },
      })
      if (result.expense) await reload()
      return result
    },
    [actorIds, reload, runCloudWrite, session, trip?.currency, tripId],
  )

  const remove = useCallback(
    async (id) => {
      const result = await runCloudWrite({
        op: {
          entity: 'expense',
          action: 'delete',
          cloudTripId: tripId,
          cloudEntityId: id,
          payload: { id },
        },
        mutate: (op) => deleteCloudExpense({ client: getSupabaseClient(), session, id: op.cloudEntityId }),
      })
      if (result.ok) setExpenses((current) => current.filter((expense) => expense.id !== id))
      return result
    },
    [runCloudWrite, session, tripId],
  )

  return {
    expenses,
    members,
    people,
    settlement,
    error,
    liveError,
    loading,
    currentUserId: user?.id ?? null,
    role: myRole,
    canCreate: capabilities.canCreate,
    canMutateExpense: (expense) => cloudExpenseCapabilities(myRole, user?.id, expense).canEdit,
    reload,
    save,
    remove,
  }
}
