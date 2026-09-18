/**
 * Practical SQL-level suite for the Travel OS backend foundation.
 *
 * Applies the auth stub + migrations to an in-memory Postgres (PGlite),
 * then runs the 20 required cases as an authenticated non-superuser.
 *
 * Usage: npm run test:sql
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const root = dirname(fileURLToPath(import.meta.url))
const repo = join(root, '..', '..')
const migrationsDir = join(repo, 'supabase', 'migrations')

const OWNER = '00000000-0000-0000-0000-000000000001'
const EDITOR = '00000000-0000-0000-0000-000000000002'
const VIEWER = '00000000-0000-0000-0000-000000000003'
const OUTSIDER = '00000000-0000-0000-0000-000000000004'
const INVITEE = '00000000-0000-0000-0000-000000000005'
const EDITOR_B = '00000000-0000-0000-0000-000000000006'

const users = [
  { id: OWNER, email: 'jamie@travelos.app', name: 'Jamie Lim' },
  { id: EDITOR, email: 'alex@example.com', name: 'Alex Wong' },
  { id: VIEWER, email: 'jason@example.com', name: 'Jason Tan' },
  { id: OUTSIDER, email: 'oliver@example.com', name: 'Oliver Berg' },
  { id: INVITEE, email: 'maya@example.com', name: 'Maya Chen' },
  { id: EDITOR_B, email: 'sofia@example.com', name: 'Sofia Rahman' },
]

function sqlFile(path) {
  return readFileSync(path, 'utf8')
}

async function exec(pg, sql) {
  await pg.exec(sql)
}

async function query(pg, sql, params = []) {
  return pg.query(sql, params)
}

async function asPostgres(pg) {
  await exec(pg, 'RESET ROLE;')
}

async function asUser(pg, id) {
  const user = users.find((item) => item.id === id)
  await asPostgres(pg)
  await query(
    pg,
    `SELECT set_config('request.jwt.claim.sub', $1, false),
            set_config('request.jwt.claim.email', $2, false),
            set_config('request.jwt.claim.role', 'authenticated', false),
            set_config('request.jwt.claims', $3, false)`,
    [
      id,
      user.email,
      JSON.stringify({ sub: id, email: user.email, role: 'authenticated' }),
    ],
  )
  await exec(pg, 'SET ROLE authenticated;')
}

function isMissing(error, ...needles) {
  const message = String(error?.message || error)
  return needles.some((needle) => message.toLowerCase().includes(needle.toLowerCase()))
}

async function expectOk(name, fn) {
  try {
    await fn()
    return { name, passed: true }
  } catch (error) {
    return { name, passed: false, detail: String(error.message || error) }
  }
}

async function expectFail(name, fn, ...needles) {
  try {
    await fn()
    return { name, passed: false, detail: 'expected an error but the statement succeeded' }
  } catch (error) {
    if (needles.length && !isMissing(error, ...needles)) {
      return { name, passed: false, detail: String(error.message || error) }
    }
    return { name, passed: true }
  }
}

async function expectDenied(name, mutate, stillHolds) {
  try {
    await mutate()
  } catch {
    return { name, passed: true }
  }
  if (stillHolds && !(await stillHolds())) {
    return { name, passed: false, detail: 'mutation was allowed' }
  }
  return { name, passed: true }
}

async function value(pg, sql, params = []) {
  const result = await query(pg, sql, params)
  return result.rows[0] ? Object.values(result.rows[0])[0] : undefined
}

async function applyMigrations(pg) {
  await exec(pg, sqlFile(join(root, 'auth_stub.sql')))
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
  for (const file of files) {
    await exec(pg, sqlFile(join(migrationsDir, file)))
  }
}

async function seedUsers(pg) {
  await asPostgres(pg)
  for (const user of users) {
    await query(
      pg,
      `INSERT INTO auth.users (id, email, raw_user_meta_data)
       VALUES ($1, $2, jsonb_build_object('name', $3::text))`,
      [user.id, user.email, user.name],
    )
  }
}

async function main() {
  const pg = new PGlite({ extensions: { pgcrypto } })
  await applyMigrations(pg)
  await seedUsers(pg)

  const results = []
  let tripId
  let otherTripId
  let ownerExpenseId
  let editorExpenseId
  let pollId
  let optionA
  let optionB
  let rawToken
  let expiredToken
  let inviteId

  results.push(
    await expectOk('1. Owner can create trip', async () => {
      await asUser(pg, OWNER)
      const created = await query(
        pg,
        `INSERT INTO trips (city, country, destination, start_date, end_date, budget_amount, currency, notes, timezone)
         VALUES ('Vienna', 'Austria', 'Vienna, Austria', '2026-12-12', '2026-12-19', 4000, 'MYR', 'Christmas markets', 'Europe/Vienna')
         RETURNING id, owner_id`,
      )
      tripId = created.rows[0].id
      if (created.rows[0].owner_id !== OWNER) {
        throw new Error(`owner_id was ${created.rows[0].owner_id}`)
      }
    }),
  )

  results.push(
    await expectOk('2. Owner gets owner membership', async () => {
      await asUser(pg, OWNER)
      const role = await value(
        pg,
        'SELECT role::text FROM trip_members WHERE trip_id = $1 AND user_id = $2',
        [tripId, OWNER],
      )
      if (role !== 'owner') throw new Error(`role was ${role}`)
      const owners = await value(
        pg,
        `SELECT count(*)::int FROM trip_members WHERE trip_id = $1 AND role = 'owner'`,
        [tripId],
      )
      if (owners !== 1) throw new Error(`owner count was ${owners}`)
    }),
  )

  await asPostgres(pg)
  await query(
    pg,
    `INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, 'editor'), ($1, $3, 'viewer')`,
    [tripId, EDITOR, VIEWER],
  )
  await asUser(pg, OWNER)
  const second = await query(
    pg,
    `INSERT INTO trips (city, country, destination, start_date, end_date, budget_amount, currency)
     VALUES ('Tokyo', 'Japan', 'Tokyo, Japan', '2027-03-18', '2027-03-28', 8000, 'MYR')
     RETURNING id`,
  )
  otherTripId = second.rows[0].id

  results.push(
    await expectOk('3. Editor can edit itinerary', async () => {
      await asUser(pg, EDITOR)
      await query(
        pg,
        `INSERT INTO itinerary_days (trip_id, date, day_number, title)
         VALUES ($1, '2026-12-12', 1, 'Arrival')`,
        [tripId],
      )
      const item = await query(
        pg,
        `INSERT INTO itinerary_items (trip_id, item_date, sort_order, time, title, category, place_label)
         VALUES ($1, '2026-12-12', 0, '14:00', 'Check-in', 'lodging', 'Hotel Sacher')
         RETURNING id, created_by`,
        [tripId],
      )
      if (item.rows[0].created_by !== EDITOR) {
        throw new Error('created_by was not forced to the editor')
      }
    }),
  )

  results.push(
    await expectFail(
      '4. Editor cannot manage members',
      async () => {
        await asUser(pg, EDITOR)
        await query(pg, `SELECT public.create_invitation($1, 'maya@example.com', 'viewer')`, [tripId])
      },
      'owner',
      'permission',
    ),
  )

  results.push(
    await expectDenied(
      '4b. Editor cannot change member roles',
      async () => {
        await asUser(pg, EDITOR)
        await query(
          pg,
          `UPDATE trip_members SET role = 'owner' WHERE trip_id = $1 AND user_id = $2`,
          [tripId, VIEWER],
        )
      },
      async () => {
        await asUser(pg, OWNER)
        const role = await value(
          pg,
          'SELECT role::text FROM trip_members WHERE trip_id = $1 AND user_id = $2',
          [tripId, VIEWER],
        )
        return role === 'viewer'
      },
    ),
  )

  results.push(
    await expectOk('5. Viewer can read', async () => {
      await asUser(pg, VIEWER)
      const city = await value(pg, 'SELECT city FROM trips WHERE id = $1', [tripId])
      if (city !== 'Vienna') throw new Error(`city was ${city}`)
      const items = await value(pg, 'SELECT count(*)::int FROM itinerary_items WHERE trip_id = $1', [tripId])
      if (items < 1) throw new Error('viewer could not read itinerary')
    }),
  )

  results.push(
    await expectFail(
      '6. Viewer cannot mutate',
      async () => {
        await asUser(pg, VIEWER)
        await query(
          pg,
          `INSERT INTO itinerary_items (trip_id, item_date, title, category)
           VALUES ($1, '2026-12-13', 'Secret edit', 'free')`,
          [tripId],
        )
      },
      'policy',
      'permission',
      '0 rows',
    ),
  )

  results.push(
    await expectFail(
      '6b. Viewer cannot create expenses',
      async () => {
        await asUser(pg, VIEWER)
        await query(
          pg,
          `SELECT public.save_expense(
             $1::uuid, 10, 'MYR', 10, 'MYR', 'food', '2026-12-12', 'Snack', $2::uuid,
             jsonb_build_array(jsonb_build_object('user_id', $2::text, 'amount', 10))
           )`,
          [tripId, VIEWER],
        )
      },
      'cannot create',
      'Viewers',
    ),
  )

  await asUser(pg, EDITOR)
  await query(
    pg,
    `INSERT INTO polls (trip_id, question) VALUES ($1, 'Dinner?')`,
    [tripId],
  )
  pollId = await value(pg, 'SELECT id FROM polls WHERE trip_id = $1', [tripId])
  await query(
    pg,
    `INSERT INTO poll_options (poll_id, label, sort_order) VALUES ($1, 'Schnitzel', 0), ($1, 'Tafelsptiz', 1)`,
    [pollId],
  )
  const options = await query(pg, 'SELECT id, label FROM poll_options WHERE poll_id = $1 ORDER BY sort_order', [pollId])
  optionA = options.rows[0].id
  optionB = options.rows[1].id

  results.push(
    await expectOk('7. Viewer can vote', async () => {
      await asUser(pg, VIEWER)
      await query(
        pg,
        `INSERT INTO poll_votes (poll_id, user_id, option_id) VALUES ($1, $2, $3)`,
        [pollId, OWNER, optionA],
      )
      const voteUser = await value(
        pg,
        'SELECT user_id FROM poll_votes WHERE poll_id = $1',
        [pollId],
      )
      if (voteUser !== VIEWER) throw new Error('vote user_id was not forced to the viewer')
      await query(
        pg,
        `UPDATE poll_votes SET option_id = $1 WHERE poll_id = $2 AND user_id = $3`,
        [optionB, pollId, VIEWER],
      )
      const changed = await value(pg, 'SELECT option_id FROM poll_votes WHERE poll_id = $1 AND user_id = $2', [pollId, VIEWER])
      if (changed !== optionB) throw new Error('viewer could not change their vote')
    }),
  )

  results.push(
    await expectOk('8. Editor can create expense', async () => {
      await asUser(pg, EDITOR)
      editorExpenseId = await value(
        pg,
        `SELECT public.save_expense(
           $1::uuid, 150, 'MYR', 150, 'MYR', 'food', '2026-12-12', 'First dinner', $2::uuid,
           jsonb_build_array(
             jsonb_build_object('user_id', $3::text, 'amount', 60),
             jsonb_build_object('user_id', $2::text, 'amount', 40),
             jsonb_build_object('user_id', $4::text, 'amount', 50)
           )
         )`,
        [tripId, EDITOR, OWNER, VIEWER],
      )
      const paidBy = await value(pg, 'SELECT paid_by FROM expenses WHERE id = $1', [editorExpenseId])
      const createdBy = await value(pg, 'SELECT created_by FROM expenses WHERE id = $1', [editorExpenseId])
      if (paidBy !== EDITOR) throw new Error('paid_by was not stored independently')
      if (createdBy !== EDITOR) throw new Error('created_by was not the editor')
      const shareSum = await value(
        pg,
        'SELECT sum(amount)::numeric FROM expense_shares WHERE expense_id = $1',
        [editorExpenseId],
      )
      if (Number(shareSum) !== 150) throw new Error(`share sum was ${shareSum}`)
    }),
  )

  await asUser(pg, OWNER)
  ownerExpenseId = await value(
    pg,
    `SELECT public.save_expense(
       $1::uuid, 80, 'MYR', 80, 'MYR', 'transport', '2026-12-13', 'Airport taxi', $2::uuid,
       jsonb_build_array(
         jsonb_build_object('user_id', $2::text, 'amount', 40),
         jsonb_build_object('user_id', $3::text, 'amount', 40)
       )
     )`,
    [tripId, OWNER, EDITOR],
  )

  results.push(
    await expectFail(
      "9. Editor cannot edit another user's expense",
      async () => {
        await asUser(pg, EDITOR)
        await query(
          pg,
          `SELECT public.save_expense(
             $1::uuid, 90, 'MYR', 90, 'MYR', 'transport', '2026-12-13', 'Hacked taxi', $2::uuid,
             jsonb_build_array(
               jsonb_build_object('user_id', $2::text, 'amount', 50),
               jsonb_build_object('user_id', $3::text, 'amount', 40)
             ),
             $4::uuid
           )`,
          [tripId, OWNER, EDITOR, ownerExpenseId],
        )
      },
      'their own',
    ),
  )

  results.push(
    await expectOk("10. Owner can edit another user's expense", async () => {
      await asUser(pg, OWNER)
      const updated = await value(
        pg,
        `SELECT public.save_expense(
           $1::uuid, 150, 'MYR', 150, 'MYR', 'food', '2026-12-12', 'First dinner (updated)', $2::uuid,
           jsonb_build_array(
             jsonb_build_object('user_id', $3::text, 'amount', 70),
             jsonb_build_object('user_id', $2::text, 'amount', 30),
             jsonb_build_object('user_id', $4::text, 'amount', 50)
           ),
           $5::uuid
         )`,
        [tripId, EDITOR, OWNER, VIEWER, editorExpenseId],
      )
      if (updated !== editorExpenseId) throw new Error('owner update did not keep the expense id')
      const createdBy = await value(pg, 'SELECT created_by FROM expenses WHERE id = $1', [editorExpenseId])
      if (createdBy !== EDITOR) throw new Error('owner edit must not rewrite created_by')
      const description = await value(pg, 'SELECT description FROM expenses WHERE id = $1', [editorExpenseId])
      if (description !== 'First dinner (updated)') throw new Error('owner could not edit the expense')
    }),
  )

  results.push(
    await expectFail(
      '11. Expense shares cannot violate the amount invariant',
      async () => {
        await asUser(pg, EDITOR)
        await query(
          pg,
          `SELECT public.save_expense(
             $1::uuid, 150, 'MYR', 150, 'MYR', 'food', '2026-12-14', 'Broken split', $2::uuid,
             jsonb_build_array(
               jsonb_build_object('user_id', $2::text, 'amount', 60),
               jsonb_build_object('user_id', $3::text, 'amount', 40)
             )
           )`,
          [tripId, EDITOR, OWNER],
        )
      },
      'sum to the expense amount',
    ),
  )

  results.push(
    await expectFail(
      '11b. Direct expense_share writes are blocked',
      async () => {
        await asUser(pg, EDITOR)
        await query(
          pg,
          `INSERT INTO expense_shares (expense_id, user_id, amount) VALUES ($1, $2, 1)`,
          [editorExpenseId, EDITOR_B],
        )
      },
      'permission',
      'must be written',
      'save_expense',
    ),
  )

  results.push(
    await expectOk('12. Historical shares survive member removal', async () => {
      await asPostgres(pg)
      await query(
        pg,
        `INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, 'editor')`,
        [tripId, EDITOR_B],
      )
      await asUser(pg, EDITOR)
      const historicalExpense = await value(
        pg,
        `SELECT public.save_expense(
           $1::uuid, 30, 'MYR', 30, 'MYR', 'other', '2026-12-15', 'Museum', $2::uuid,
           jsonb_build_array(
             jsonb_build_object('user_id', $2::text, 'amount', 10),
             jsonb_build_object('user_id', $3::text, 'amount', 20)
           )
         )`,
        [tripId, EDITOR, EDITOR_B],
      )
      await asUser(pg, OWNER)
      await query(
        pg,
        `DELETE FROM trip_members WHERE trip_id = $1 AND user_id = $2`,
        [tripId, EDITOR_B],
      )
      const remaining = await value(
        pg,
        'SELECT count(*)::int FROM expense_shares WHERE expense_id = $1',
        [historicalExpense],
      )
      if (remaining !== 2) throw new Error(`shares remaining: ${remaining}`)
      const paidBy = await value(pg, 'SELECT paid_by FROM expenses WHERE id = $1', [historicalExpense])
      if (paidBy !== EDITOR) throw new Error('paid_by was deleted with the member')
    }),
  )

  results.push(
    await expectOk('13. Invitation token cannot be reused', async () => {
      await asUser(pg, OWNER)
      const created = await query(
        pg,
        `SELECT public.create_invitation($1, 'maya@example.com', 'editor', 'Maya') AS payload`,
        [tripId],
      )
      rawToken = created.rows[0].payload.token
      inviteId = created.rows[0].payload.id
      await asUser(pg, INVITEE)
      const joinedTrip = await value(pg, 'SELECT public.accept_invitation($1)', [rawToken])
      if (joinedTrip !== tripId) throw new Error('accept did not join the trip')
      const role = await value(
        pg,
        'SELECT role::text FROM trip_members WHERE trip_id = $1 AND user_id = $2',
        [tripId, INVITEE],
      )
      if (role !== 'editor') throw new Error(`stored role was ${role}`)
      const visibility = await value(pg, 'SELECT visibility::text FROM trips WHERE id = $1', [tripId])
      if (visibility !== 'shared') throw new Error('trip was not marked shared')
      const joinActivity = await value(
        pg,
        `SELECT count(*)::int FROM activities WHERE trip_id = $1 AND type = 'member.join' AND actor_id = $2`,
        [tripId, INVITEE],
      )
      if (joinActivity < 1) throw new Error('member.join activity was not recorded')
    }),
  )

  results.push(
    await expectFail(
      '13b. Reused invitation token is rejected',
      async () => {
        await asUser(pg, INVITEE)
        await query(pg, 'SELECT public.accept_invitation($1)', [rawToken])
      },
      'reused',
      'invalid',
      'Already a member',
    ),
  )

  results.push(
    await expectFail(
      '14. Wrong email cannot accept invitation',
      async () => {
        await asUser(pg, OWNER)
        const created = await query(
          pg,
          `SELECT public.create_invitation($1, 'oliver@example.com', 'viewer') AS payload`,
          [tripId],
        )
        const token = created.rows[0].payload.token
        await asUser(pg, EDITOR)
        await query(pg, 'SELECT public.accept_invitation($1)', [token])
      },
      'someone else',
    ),
  )

  results.push(
    await expectFail(
      '15. Expired invitation cannot be accepted',
      async () => {
        await asUser(pg, OWNER)
        const created = await query(
          pg,
          `SELECT public.create_invitation($1, 'oliver@example.com', 'viewer') AS payload`,
          [otherTripId],
        )
        expiredToken = created.rows[0].payload.token
        await asPostgres(pg)
        await query(
          pg,
          `UPDATE trip_invitations SET expires_at = now() - interval '1 hour'
           WHERE trip_id = $1 AND email = 'oliver@example.com' AND status IN ('pending', 'invited')`,
          [otherTripId],
        )
        await asUser(pg, OUTSIDER)
        await query(pg, 'SELECT public.accept_invitation($1)', [expiredToken])
      },
      'expired',
    ),
  )

  results.push(
    await expectFail(
      '16. Invitation cannot grant owner role',
      async () => {
        await asUser(pg, OWNER)
        await query(pg, `SELECT public.create_invitation($1, 'oliver@example.com', 'owner')`, [otherTripId])
      },
      'cannot grant owner',
      'Invitations cannot grant owner',
    ),
  )

  results.push(
    await expectOk('17. Users cannot read another unrelated trip', async () => {
      await asUser(pg, EDITOR)
      const seen = await value(pg, 'SELECT count(*)::int FROM trips WHERE id = $1', [otherTripId])
      if (seen !== 0) throw new Error('editor read an unrelated trip')
      const items = await value(pg, 'SELECT count(*)::int FROM itinerary_items WHERE trip_id = $1', [otherTripId])
      if (items !== 0) throw new Error('editor read unrelated itinerary')
    }),
  )

  results.push(
    await expectFail(
      '18. Users cannot spoof actor_id',
      async () => {
        await asUser(pg, EDITOR)
        await query(
          pg,
          `INSERT INTO activities (trip_id, actor_id, type) VALUES ($1, $2, 'expense.add')`,
          [tripId, OWNER],
        )
      },
      'permission',
      'policy',
      'Must be authenticated',
    ),
  )

  results.push(
    await expectOk('18b. created_by is forced to auth.uid()', async () => {
      await asUser(pg, EDITOR)
      const place = await query(
        pg,
        `INSERT INTO places (trip_id, name, status, created_by)
         VALUES ($1, 'Belvedere', 'saved', $2)
         RETURNING created_by`,
        [tripId, OWNER],
      )
      if (place.rows[0].created_by !== EDITOR) {
        throw new Error('created_by spoof succeeded')
      }
    }),
  )

  results.push(
    await expectFail(
      '18c. Users cannot spoof paid_by onto an unrelated profile',
      async () => {
        await asUser(pg, EDITOR)
        await query(
          pg,
          `SELECT public.save_expense(
             $1::uuid, 20, 'MYR', 20, 'MYR', 'other', '2026-12-16', 'Spoof payer', $2::uuid,
             jsonb_build_array(jsonb_build_object('user_id', $3::text, 'amount', 20))
           )`,
          [tripId, OUTSIDER, EDITOR],
        )
      },
      'historical',
      'members',
    ),
  )

  results.push(
    await expectDenied(
      '19. Owner cannot be deleted through membership mutation',
      async () => {
        await asUser(pg, OWNER)
        await query(pg, `DELETE FROM trip_members WHERE trip_id = $1 AND user_id = $2`, [tripId, OWNER])
      },
      async () => {
        await asUser(pg, OWNER)
        const role = await value(
          pg,
          'SELECT role::text FROM trip_members WHERE trip_id = $1 AND user_id = $2',
          [tripId, OWNER],
        )
        return role === 'owner'
      },
    ),
  )

  results.push(
    await expectFail(
      '19b. Owner membership delete is rejected at the database level',
      async () => {
        await asPostgres(pg)
        await query(pg, `DELETE FROM trip_members WHERE trip_id = $1 AND user_id = $2`, [tripId, OWNER])
      },
      'cannot be deleted',
    ),
  )

  results.push(
    await expectFail(
      '20. owner_id cannot be changed directly',
      async () => {
        await asUser(pg, OWNER)
        await query(pg, `UPDATE trips SET owner_id = $1 WHERE id = $2`, [EDITOR, tripId])
      },
      'not permitted',
    ),
  )

  results.push(
    await expectOk('owner can delete a trip that has expenses and members', async () => {
      await asUser(pg, OWNER)
      const doomed = await query(
        pg,
        `INSERT INTO trips (city, country, destination, start_date, end_date, budget_amount, currency)
         VALUES ('Bangkok', 'Thailand', 'Bangkok, Thailand', '2026-08-03', '2026-08-09', 2500, 'MYR')
         RETURNING id`,
      )
      const doomedId = doomed.rows[0].id
      await asPostgres(pg)
      await query(
        pg,
        `INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, 'editor')`,
        [doomedId, EDITOR],
      )
      await asUser(pg, OWNER)
      await query(
        pg,
        `SELECT public.save_expense(
           $1::uuid, 25, 'MYR', 25, 'MYR', 'food', '2026-08-04', 'Noodles', $2::uuid,
           jsonb_build_array(jsonb_build_object('user_id', $2::text, 'amount', 25))
         )`,
        [doomedId, OWNER],
      )
      await query(pg, 'DELETE FROM trips WHERE id = $1', [doomedId])
      const remaining = await value(pg, 'SELECT count(*)::int FROM trips WHERE id = $1', [doomedId])
      if (remaining !== 0) throw new Error('trip was not deleted')
    }),
  )

  results.push(
    await expectFail(
      '20b. Client cannot insert an owner membership',
      async () => {
        await asUser(pg, OWNER)
        await query(
          pg,
          `INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1, $2, 'owner')`,
          [otherTripId, EDITOR],
        )
      },
      'cannot be created',
      'policy',
      'permission',
    ),
  )

  results.push(
    await expectFail(
      'token_hash is not exposed to authenticated clients',
      async () => {
        await asUser(pg, OWNER)
        await query(pg, 'SELECT token_hash FROM trip_invitations')
      },
      'permission',
      'token_hash',
    ),
  )

  let viennaDayId
  let tokyoDayId
  let viennaPlaceId
  let tokyoPlaceId
  let viennaBookingId
  let tokyoBookingId
  let linkedItemId
  let nullRefItemId

  await asUser(pg, OWNER)
  viennaDayId = await value(
    pg,
    `SELECT id FROM itinerary_days WHERE trip_id = $1 AND date = '2026-12-12'`,
    [tripId],
  )
  const tokyoDay = await query(
    pg,
    `INSERT INTO itinerary_days (trip_id, date, day_number, title)
     VALUES ($1, '2027-03-18', 1, 'Arrival')
     RETURNING id`,
    [otherTripId],
  )
  tokyoDayId = tokyoDay.rows[0].id
  viennaPlaceId = await value(pg, `SELECT id FROM places WHERE trip_id = $1 AND name = 'Belvedere'`, [tripId])
  const tokyoPlace = await query(
    pg,
    `INSERT INTO places (trip_id, name, status) VALUES ($1, 'Senso-ji', 'saved') RETURNING id`,
    [otherTripId],
  )
  tokyoPlaceId = tokyoPlace.rows[0].id
  const viennaBooking = await query(
    pg,
    `INSERT INTO bookings (trip_id, type, title, status) VALUES ($1, 'hotel', 'Hotel Sacher', 'confirmed') RETURNING id`,
    [tripId],
  )
  viennaBookingId = viennaBooking.rows[0].id
  const tokyoBooking = await query(
    pg,
    `INSERT INTO bookings (trip_id, type, title, status) VALUES ($1, 'train', 'Narita Express', 'confirmed') RETURNING id`,
    [otherTripId],
  )
  tokyoBookingId = tokyoBooking.rows[0].id

  results.push(
    await expectOk('same-trip day reference succeeds', async () => {
      await asUser(pg, OWNER)
      const inserted = await query(
        pg,
        `INSERT INTO itinerary_items (trip_id, day_id, item_date, sort_order, title, category)
         VALUES ($1, $2, '2026-12-12', 20, 'Same-trip day', 'free')
         RETURNING id, day_id`,
        [tripId, viennaDayId],
      )
      if (inserted.rows[0].day_id !== viennaDayId) throw new Error('same-trip day_id was not stored')
    }),
  )

  results.push(
    await expectFail(
      'cross-trip day reference fails',
      async () => {
        await asUser(pg, OWNER)
        await query(
          pg,
          `INSERT INTO itinerary_items (trip_id, day_id, item_date, title, category)
           VALUES ($1, $2, '2026-12-12', 'Cross-trip day', 'free')`,
          [tripId, tokyoDayId],
        )
      },
      'foreign key',
      'day_trip',
      'violates',
    ),
  )

  results.push(
    await expectOk('same-trip place reference succeeds', async () => {
      await asUser(pg, OWNER)
      const inserted = await query(
        pg,
        `INSERT INTO itinerary_items (trip_id, item_date, sort_order, title, category, place_id)
         VALUES ($1, '2026-12-12', 21, 'Same-trip place', 'sight', $2)
         RETURNING id, place_id`,
        [tripId, viennaPlaceId],
      )
      if (inserted.rows[0].place_id !== viennaPlaceId) throw new Error('same-trip place_id was not stored')
      linkedItemId = inserted.rows[0].id
    }),
  )

  results.push(
    await expectFail(
      'cross-trip place reference fails',
      async () => {
        await asUser(pg, OWNER)
        await query(
          pg,
          `INSERT INTO itinerary_items (trip_id, item_date, title, category, place_id)
           VALUES ($1, '2026-12-12', 'Cross-trip place', 'sight', $2)`,
          [tripId, tokyoPlaceId],
        )
      },
      'foreign key',
      'place_trip',
      'violates',
    ),
  )

  results.push(
    await expectOk('same-trip booking reference succeeds', async () => {
      await asUser(pg, OWNER)
      const inserted = await query(
        pg,
        `INSERT INTO itinerary_items (trip_id, item_date, sort_order, title, category, booking_id)
         VALUES ($1, '2026-12-12', 22, 'Same-trip booking', 'lodging', $2)
         RETURNING booking_id`,
        [tripId, viennaBookingId],
      )
      if (inserted.rows[0].booking_id !== viennaBookingId) {
        throw new Error('same-trip booking_id was not stored')
      }
    }),
  )

  results.push(
    await expectFail(
      'cross-trip booking reference fails',
      async () => {
        await asUser(pg, OWNER)
        await query(
          pg,
          `INSERT INTO itinerary_items (trip_id, item_date, title, category, booking_id)
           VALUES ($1, '2026-12-12', 'Cross-trip booking', 'lodging', $2)`,
          [tripId, tokyoBookingId],
        )
      },
      'foreign key',
      'booking_trip',
      'violates',
    ),
  )

  results.push(
    await expectFail(
      'cross-trip place cannot be introduced during UPDATE',
      async () => {
        await asUser(pg, OWNER)
        await query(pg, `UPDATE itinerary_items SET place_id = $1 WHERE id = $2`, [tokyoPlaceId, linkedItemId])
      },
      'foreign key',
      'place_trip',
      'violates',
    ),
  )

  results.push(
    await expectFail(
      'cross-trip booking cannot be introduced during UPDATE',
      async () => {
        await asUser(pg, OWNER)
        await query(pg, `UPDATE itinerary_items SET booking_id = $1 WHERE id = $2`, [tokyoBookingId, linkedItemId])
      },
      'foreign key',
      'booking_trip',
      'violates',
    ),
  )

  results.push(
    await expectFail(
      'cross-trip day cannot be introduced during UPDATE',
      async () => {
        await asUser(pg, OWNER)
        await query(pg, `UPDATE itinerary_items SET day_id = $1 WHERE id = $2`, [tokyoDayId, linkedItemId])
      },
      'foreign key',
      'day_trip',
      'violates',
    ),
  )

  results.push(
    await expectOk('NULL place_id remains valid', async () => {
      await asUser(pg, OWNER)
      const inserted = await query(
        pg,
        `INSERT INTO itinerary_items (trip_id, item_date, sort_order, title, category, place_id, booking_id)
         VALUES ($1, '2026-12-13', 0, 'No place', 'free', NULL, NULL)
         RETURNING id, place_id, booking_id`,
        [tripId],
      )
      nullRefItemId = inserted.rows[0].id
      if (inserted.rows[0].place_id != null) throw new Error('place_id should stay null')
    }),
  )

  results.push(
    await expectOk('NULL booking_id remains valid', async () => {
      await asUser(pg, OWNER)
      const bookingId = await value(pg, 'SELECT booking_id FROM itinerary_items WHERE id = $1', [nullRefItemId])
      if (bookingId != null) throw new Error('booking_id should stay null')
    }),
  )

  results.push(
    await expectOk('deleting a place sets itinerary place_id NULL', async () => {
      await asUser(pg, OWNER)
      const disposable = await query(
        pg,
        `INSERT INTO places (trip_id, name, status) VALUES ($1, 'Temporary cafe', 'saved') RETURNING id`,
        [tripId],
      )
      const placeId = disposable.rows[0].id
      const item = await query(
        pg,
        `INSERT INTO itinerary_items (trip_id, item_date, sort_order, title, category, place_id)
         VALUES ($1, '2026-12-14', 0, 'Cafe stop', 'food', $2)
         RETURNING id`,
        [tripId, placeId],
      )
      const itemId = item.rows[0].id
      await query(pg, 'DELETE FROM places WHERE id = $1', [placeId])
      const remainingPlace = await value(pg, 'SELECT count(*)::int FROM places WHERE id = $1', [placeId])
      if (remainingPlace !== 0) throw new Error('place was not deleted')
      const remainingItem = await value(pg, 'SELECT count(*)::int FROM itinerary_items WHERE id = $1', [itemId])
      if (remainingItem !== 1) throw new Error('itinerary item was deleted with the place')
      const cleared = await value(pg, 'SELECT place_id FROM itinerary_items WHERE id = $1', [itemId])
      if (cleared != null) throw new Error('place_id was not set null')
    }),
  )

  results.push(
    await expectOk('deleting a day sets itinerary day_id NULL', async () => {
      await asUser(pg, OWNER)
      const day = await query(
        pg,
        `INSERT INTO itinerary_days (trip_id, date, day_number, title)
         VALUES ($1, '2026-12-16', 5, 'Temporary day')
         RETURNING id`,
        [tripId],
      )
      const dayId = day.rows[0].id
      const item = await query(
        pg,
        `INSERT INTO itinerary_items (trip_id, day_id, item_date, title, category)
         VALUES ($1, $2, '2026-12-16', 'Day-linked stop', 'free')
         RETURNING id`,
        [tripId, dayId],
      )
      const itemId = item.rows[0].id
      await query(pg, 'DELETE FROM itinerary_days WHERE id = $1', [dayId])
      const remainingItem = await value(pg, 'SELECT count(*)::int FROM itinerary_items WHERE id = $1', [itemId])
      if (remainingItem !== 1) throw new Error('itinerary item was deleted with the day')
      const cleared = await value(pg, 'SELECT day_id FROM itinerary_items WHERE id = $1', [itemId])
      if (cleared != null) throw new Error('day_id was not set null')
    }),
  )

  results.push(
    await expectOk('deleting a booking sets itinerary booking_id NULL', async () => {
      await asUser(pg, OWNER)
      const disposable = await query(
        pg,
        `INSERT INTO bookings (trip_id, type, title, status) VALUES ($1, 'ticket', 'Temp ticket', 'pending') RETURNING id`,
        [tripId],
      )
      const bookingId = disposable.rows[0].id
      const item = await query(
        pg,
        `INSERT INTO itinerary_items (trip_id, item_date, sort_order, title, category, booking_id)
         VALUES ($1, '2026-12-14', 1, 'Ticket stop', 'arrival', $2)
         RETURNING id`,
        [tripId, bookingId],
      )
      const itemId = item.rows[0].id
      await query(pg, 'DELETE FROM bookings WHERE id = $1', [bookingId])
      const remainingItem = await value(pg, 'SELECT count(*)::int FROM itinerary_items WHERE id = $1', [itemId])
      if (remainingItem !== 1) throw new Error('itinerary item was deleted with the booking')
      const cleared = await value(pg, 'SELECT booking_id FROM itinerary_items WHERE id = $1', [itemId])
      if (cleared != null) throw new Error('booking_id was not set null')
    }),
  )

  results.push(
    await expectOk('deleting an itinerary item does not delete place or booking', async () => {
      await asUser(pg, OWNER)
      const place = await query(
        pg,
        `INSERT INTO places (trip_id, name, status) VALUES ($1, 'Keep me', 'saved') RETURNING id`,
        [tripId],
      )
      const booking = await query(
        pg,
        `INSERT INTO bookings (trip_id, type, title, status) VALUES ($1, 'other', 'Keep booking', 'pending') RETURNING id`,
        [tripId],
      )
      const item = await query(
        pg,
        `INSERT INTO itinerary_items (trip_id, item_date, title, category, place_id, booking_id)
         VALUES ($1, '2026-12-15', 'Disposable stop', 'free', $2, $3)
         RETURNING id`,
        [tripId, place.rows[0].id, booking.rows[0].id],
      )
      await query(pg, 'DELETE FROM itinerary_items WHERE id = $1', [item.rows[0].id])
      const placesLeft = await value(pg, 'SELECT count(*)::int FROM places WHERE id = $1', [place.rows[0].id])
      const bookingsLeft = await value(pg, 'SELECT count(*)::int FROM bookings WHERE id = $1', [booking.rows[0].id])
      if (placesLeft !== 1) throw new Error('place was deleted with the itinerary item')
      if (bookingsLeft !== 1) throw new Error('booking was deleted with the itinerary item')
    }),
  )

  results.push(
    await expectFail(
      'changing itinerary trip_id cannot keep another trip place',
      async () => {
        await asUser(pg, OWNER)
        await query(pg, `UPDATE itinerary_items SET trip_id = $1 WHERE id = $2`, [otherTripId, linkedItemId])
      },
      'foreign key',
      'place_trip',
      'violates',
    ),
  )

  results.push(
    await expectDenied(
      'viewer cannot mutate itinerary items',
      async () => {
        await asUser(pg, VIEWER)
        await query(pg, `UPDATE itinerary_items SET title = 'Viewer edit' WHERE id = $1`, [linkedItemId])
      },
      async () => {
        await asUser(pg, OWNER)
        const title = await value(pg, 'SELECT title FROM itinerary_items WHERE id = $1', [linkedItemId])
        return title !== 'Viewer edit'
      },
    ),
  )

  results.push(
    await expectOk('editor can still create a same-trip itinerary item', async () => {
      await asUser(pg, EDITOR)
      const inserted = await query(
        pg,
        `INSERT INTO itinerary_items (trip_id, day_id, item_date, title, category, place_id, booking_id)
         VALUES ($1, $2, '2026-12-12', 'Editor stop', 'sight', $3, $4)
         RETURNING created_by, place_id, booking_id`,
        [tripId, viennaDayId, viennaPlaceId, viennaBookingId],
      )
      if (inserted.rows[0].created_by !== EDITOR) throw new Error('editor created_by was not forced')
      if (inserted.rows[0].place_id !== viennaPlaceId) throw new Error('editor could not attach same-trip place')
      if (inserted.rows[0].booking_id !== viennaBookingId) throw new Error('editor could not attach same-trip booking')
    }),
  )

  results.push(
    await expectOk('editor still cannot read an unrelated trip itinerary', async () => {
      await asUser(pg, EDITOR)
      const seenTrips = await value(pg, 'SELECT count(*)::int FROM trips WHERE id = $1', [otherTripId])
      const seenItems = await value(pg, 'SELECT count(*)::int FROM itinerary_items WHERE trip_id = $1', [otherTripId])
      const seenPlaces = await value(pg, 'SELECT count(*)::int FROM places WHERE id = $1', [tokyoPlaceId])
      if (seenTrips !== 0) throw new Error('editor read an unrelated trip')
      if (seenItems !== 0) throw new Error('editor read unrelated itinerary')
      if (seenPlaces !== 0) throw new Error('editor read an unrelated place')
    }),
  )

  results.push(
    await expectOk('existing expense place and booking references still work', async () => {
      await asUser(pg, OWNER)
      const expenseId = await value(
        pg,
        `SELECT public.save_expense(
           $1::uuid, 45, 'MYR', 45, 'MYR', 'lodging', '2026-12-12', 'Hotel deposit', $2::uuid,
           jsonb_build_array(jsonb_build_object('user_id', $2::text, 'amount', 45)),
           NULL::uuid,
           $3::uuid,
           $4::uuid
         )`,
        [tripId, OWNER, viennaBookingId, viennaPlaceId],
      )
      const stored = await query(pg, 'SELECT booking_id, place_id FROM expenses WHERE id = $1', [expenseId])
      if (stored.rows[0].booking_id !== viennaBookingId) throw new Error('expense booking_id was not stored')
      if (stored.rows[0].place_id !== viennaPlaceId) throw new Error('expense place_id was not stored')
    }),
  )

  let sameTripPlaceExpenseId
  let sameTripBookingExpenseId
  let nullableExpenseId

  results.push(
    await expectOk('same-trip expense place reference succeeds', async () => {
      await asUser(pg, OWNER)
      sameTripPlaceExpenseId = await value(
        pg,
        `SELECT public.save_expense(
           $1::uuid, 12, 'MYR', 12, 'MYR', 'food', '2026-12-12', 'Same-trip place expense', $2::uuid,
           jsonb_build_array(jsonb_build_object('user_id', $2::text, 'amount', 12)),
           NULL::uuid, NULL::uuid, $3::uuid
         )`,
        [tripId, OWNER, viennaPlaceId],
      )
      const placeId = await value(pg, 'SELECT place_id FROM expenses WHERE id = $1', [sameTripPlaceExpenseId])
      if (placeId !== viennaPlaceId) throw new Error('same-trip place_id was not stored')
    }),
  )

  results.push(
    await expectFail(
      'cross-trip expense place reference fails',
      async () => {
        await asUser(pg, OWNER)
        await query(
          pg,
          `SELECT public.save_expense(
             $1::uuid, 12, 'MYR', 12, 'MYR', 'food', '2026-12-12', 'Cross-trip place expense', $2::uuid,
             jsonb_build_array(jsonb_build_object('user_id', $2::text, 'amount', 12)),
             NULL::uuid, NULL::uuid, $3::uuid
           )`,
          [tripId, OWNER, tokyoPlaceId],
        )
      },
      'foreign key',
      'place_trip',
      'violates',
    ),
  )

  results.push(
    await expectOk('same-trip expense booking reference succeeds', async () => {
      await asUser(pg, OWNER)
      sameTripBookingExpenseId = await value(
        pg,
        `SELECT public.save_expense(
           $1::uuid, 18, 'MYR', 18, 'MYR', 'lodging', '2026-12-12', 'Same-trip booking expense', $2::uuid,
           jsonb_build_array(jsonb_build_object('user_id', $2::text, 'amount', 18)),
           NULL::uuid, $3::uuid, NULL::uuid
         )`,
        [tripId, OWNER, viennaBookingId],
      )
      const bookingId = await value(pg, 'SELECT booking_id FROM expenses WHERE id = $1', [sameTripBookingExpenseId])
      if (bookingId !== viennaBookingId) throw new Error('same-trip booking_id was not stored')
    }),
  )

  results.push(
    await expectFail(
      'cross-trip expense booking reference fails',
      async () => {
        await asUser(pg, OWNER)
        await query(
          pg,
          `SELECT public.save_expense(
             $1::uuid, 18, 'MYR', 18, 'MYR', 'lodging', '2026-12-12', 'Cross-trip booking expense', $2::uuid,
             jsonb_build_array(jsonb_build_object('user_id', $2::text, 'amount', 18)),
             NULL::uuid, $3::uuid, NULL::uuid
           )`,
          [tripId, OWNER, tokyoBookingId],
        )
      },
      'foreign key',
      'booking_trip',
      'violates',
    ),
  )

  results.push(
    await expectFail(
      'cross-trip place fails through save_expense',
      async () => {
        await asUser(pg, OWNER)
        await query(
          pg,
          `SELECT public.save_expense(
             $1::uuid, 9, 'MYR', 9, 'MYR', 'other', '2026-12-12', 'save_expense cross place', $2::uuid,
             jsonb_build_array(jsonb_build_object('user_id', $2::text, 'amount', 9)),
             NULL::uuid, NULL::uuid, $3::uuid
           )`,
          [tripId, OWNER, tokyoPlaceId],
        )
      },
      'foreign key',
      'place_trip',
      'violates',
    ),
  )

  results.push(
    await expectFail(
      'cross-trip booking fails through save_expense',
      async () => {
        await asUser(pg, OWNER)
        await query(
          pg,
          `SELECT public.save_expense(
             $1::uuid, 9, 'MYR', 9, 'MYR', 'other', '2026-12-12', 'save_expense cross booking', $2::uuid,
             jsonb_build_array(jsonb_build_object('user_id', $2::text, 'amount', 9)),
             NULL::uuid, $3::uuid, NULL::uuid
           )`,
          [tripId, OWNER, tokyoBookingId],
        )
      },
      'foreign key',
      'booking_trip',
      'violates',
    ),
  )

  results.push(
    await expectFail(
      'cross-trip place fails during expense UPDATE',
      async () => {
        await asUser(pg, OWNER)
        await query(
          pg,
          `SELECT public.save_expense(
             $1::uuid, 12, 'MYR', 12, 'MYR', 'food', '2026-12-12', 'Same-trip place expense', $2::uuid,
             jsonb_build_array(jsonb_build_object('user_id', $2::text, 'amount', 12)),
             $3::uuid, NULL::uuid, $4::uuid
           )`,
          [tripId, OWNER, sameTripPlaceExpenseId, tokyoPlaceId],
        )
      },
      'foreign key',
      'place_trip',
      'violates',
    ),
  )

  results.push(
    await expectFail(
      'cross-trip booking fails during expense UPDATE',
      async () => {
        await asUser(pg, OWNER)
        await query(
          pg,
          `SELECT public.save_expense(
             $1::uuid, 18, 'MYR', 18, 'MYR', 'lodging', '2026-12-12', 'Same-trip booking expense', $2::uuid,
             jsonb_build_array(jsonb_build_object('user_id', $2::text, 'amount', 18)),
             $3::uuid, $4::uuid, NULL::uuid
           )`,
          [tripId, OWNER, sameTripBookingExpenseId, tokyoBookingId],
        )
      },
      'foreign key',
      'booking_trip',
      'violates',
    ),
  )

  results.push(
    await expectOk('NULL expense place_id remains valid', async () => {
      await asUser(pg, OWNER)
      nullableExpenseId = await value(
        pg,
        `SELECT public.save_expense(
           $1::uuid, 7, 'MYR', 7, 'MYR', 'other', '2026-12-13', 'Null refs expense', $2::uuid,
           jsonb_build_array(jsonb_build_object('user_id', $2::text, 'amount', 7)),
           NULL::uuid, NULL::uuid, NULL::uuid
         )`,
        [tripId, OWNER],
      )
      const placeId = await value(pg, 'SELECT place_id FROM expenses WHERE id = $1', [nullableExpenseId])
      if (placeId != null) throw new Error('place_id should stay null')
    }),
  )

  results.push(
    await expectOk('NULL expense booking_id remains valid', async () => {
      await asUser(pg, OWNER)
      const bookingId = await value(pg, 'SELECT booking_id FROM expenses WHERE id = $1', [nullableExpenseId])
      if (bookingId != null) throw new Error('booking_id should stay null')
    }),
  )

  results.push(
    await expectOk('deleting a place sets expense place_id NULL', async () => {
      await asUser(pg, OWNER)
      const disposable = await query(
        pg,
        `INSERT INTO places (trip_id, name, status) VALUES ($1, 'Expense cafe', 'saved') RETURNING id`,
        [tripId],
      )
      const placeId = disposable.rows[0].id
      const expenseId = await value(
        pg,
        `SELECT public.save_expense(
           $1::uuid, 6, 'MYR', 6, 'MYR', 'food', '2026-12-14', 'Cafe tab', $2::uuid,
           jsonb_build_array(jsonb_build_object('user_id', $2::text, 'amount', 6)),
           NULL::uuid, NULL::uuid, $3::uuid
         )`,
        [tripId, OWNER, placeId],
      )
      await query(pg, 'DELETE FROM places WHERE id = $1', [placeId])
      const remaining = await value(pg, 'SELECT count(*)::int FROM expenses WHERE id = $1', [expenseId])
      if (remaining !== 1) throw new Error('expense was deleted with the place')
      const cleared = await value(pg, 'SELECT place_id FROM expenses WHERE id = $1', [expenseId])
      if (cleared != null) throw new Error('expense place_id was not set null')
    }),
  )

  results.push(
    await expectOk('deleting a booking sets expense booking_id NULL', async () => {
      await asUser(pg, OWNER)
      const disposable = await query(
        pg,
        `INSERT INTO bookings (trip_id, type, title, status) VALUES ($1, 'ticket', 'Expense ticket', 'pending') RETURNING id`,
        [tripId],
      )
      const bookingId = disposable.rows[0].id
      const expenseId = await value(
        pg,
        `SELECT public.save_expense(
           $1::uuid, 8, 'MYR', 8, 'MYR', 'activity', '2026-12-14', 'Ticket fee', $2::uuid,
           jsonb_build_array(jsonb_build_object('user_id', $2::text, 'amount', 8)),
           NULL::uuid, $3::uuid, NULL::uuid
         )`,
        [tripId, OWNER, bookingId],
      )
      await query(pg, 'DELETE FROM bookings WHERE id = $1', [bookingId])
      const remaining = await value(pg, 'SELECT count(*)::int FROM expenses WHERE id = $1', [expenseId])
      if (remaining !== 1) throw new Error('expense was deleted with the booking')
      const cleared = await value(pg, 'SELECT booking_id FROM expenses WHERE id = $1', [expenseId])
      if (cleared != null) throw new Error('expense booking_id was not set null')
    }),
  )

  results.push(
    await expectOk('expense shares remain atomic on a failed update', async () => {
      await asUser(pg, OWNER)
      const expenseId = await value(
        pg,
        `SELECT public.save_expense(
           $1::uuid, 20, 'MYR', 20, 'MYR', 'food', '2026-12-15', 'Atomic shares', $2::uuid,
           jsonb_build_array(jsonb_build_object('user_id', $2::text, 'amount', 20)),
           NULL::uuid, NULL::uuid, $3::uuid
         )`,
        [tripId, OWNER, viennaPlaceId],
      )
      try {
        await query(
          pg,
          `SELECT public.save_expense(
             $1::uuid, 20, 'MYR', 20, 'MYR', 'food', '2026-12-15', 'Atomic shares broken', $2::uuid,
             jsonb_build_array(jsonb_build_object('user_id', $2::text, 'amount', 5)),
             $3::uuid, NULL::uuid, $4::uuid
           )`,
          [tripId, OWNER, expenseId, viennaPlaceId],
        )
        throw new Error('expected share mismatch to fail')
      } catch (error) {
        if (String(error.message || error).includes('expected share mismatch')) throw error
        if (!isMissing(error, 'sum to the expense amount')) throw error
      }
      const description = await value(pg, 'SELECT description FROM expenses WHERE id = $1', [expenseId])
      if (description !== 'Atomic shares') throw new Error('failed update changed the expense header')
      const shareSum = await value(pg, 'SELECT sum(amount)::numeric FROM expense_shares WHERE expense_id = $1', [expenseId])
      if (Number(shareSum) !== 20) throw new Error(`share sum after failed update was ${shareSum}`)
    }),
  )

  results.push(
    await expectOk('failed save_expense leaves no partial expense', async () => {
      await asUser(pg, OWNER)
      const beforeExpenses = await value(pg, 'SELECT count(*)::int FROM expenses')
      const beforeShares = await value(pg, 'SELECT count(*)::int FROM expense_shares')
      try {
        await query(
          pg,
          `SELECT public.save_expense(
             $1::uuid, 11, 'MYR', 11, 'MYR', 'other', '2026-12-16', 'Partial leak', $2::uuid,
             jsonb_build_array(jsonb_build_object('user_id', $2::text, 'amount', 11)),
             NULL::uuid, NULL::uuid, $3::uuid
           )`,
          [tripId, OWNER, tokyoPlaceId],
        )
        throw new Error('expected cross-trip save_expense to fail')
      } catch (error) {
        if (String(error.message || error).includes('expected cross-trip')) throw error
        if (!isMissing(error, 'foreign key', 'place_trip', 'violates')) throw error
      }
      const afterExpenses = await value(pg, 'SELECT count(*)::int FROM expenses')
      const afterShares = await value(pg, 'SELECT count(*)::int FROM expense_shares')
      const leaked = await value(pg, `SELECT count(*)::int FROM expenses WHERE description = 'Partial leak'`)
      if (afterExpenses !== beforeExpenses) throw new Error('partial expense header was committed')
      if (afterShares !== beforeShares) throw new Error('partial expense shares were committed')
      if (leaked !== 0) throw new Error('leaked expense row survived the failed save')
    }),
  )

  results.push(
    await expectFail(
      'owner of both trips cannot attach another trip place to an expense',
      async () => {
        await asUser(pg, OWNER)
        await query(
          pg,
          `SELECT public.save_expense(
             $1::uuid, 4, 'MYR', 4, 'MYR', 'other', '2026-12-16', 'Owner bypass place', $2::uuid,
             jsonb_build_array(jsonb_build_object('user_id', $2::text, 'amount', 4)),
             NULL::uuid, NULL::uuid, $3::uuid
           )`,
          [tripId, OWNER, tokyoPlaceId],
        )
      },
      'foreign key',
      'place_trip',
      'violates',
    ),
  )

  results.push(
    await expectFail(
      'owner of both trips cannot attach another trip booking to an expense',
      async () => {
        await asUser(pg, OWNER)
        await query(
          pg,
          `SELECT public.save_expense(
             $1::uuid, 4, 'MYR', 4, 'MYR', 'other', '2026-12-16', 'Owner bypass booking', $2::uuid,
             jsonb_build_array(jsonb_build_object('user_id', $2::text, 'amount', 4)),
             NULL::uuid, $3::uuid, NULL::uuid
           )`,
          [tripId, OWNER, tokyoBookingId],
        )
      },
      'foreign key',
      'booking_trip',
      'violates',
    ),
  )

  results.push(
    await expectFail(
      'viewer cannot mutate expenses via save_expense',
      async () => {
        await asUser(pg, VIEWER)
        await query(
          pg,
          `SELECT public.save_expense(
             $1::uuid, 3, 'MYR', 3, 'MYR', 'other', '2026-12-16', 'Viewer expense', $2::uuid,
             jsonb_build_array(jsonb_build_object('user_id', $2::text, 'amount', 3))
           )`,
          [tripId, VIEWER],
        )
      },
      'cannot create',
      'Viewers',
    ),
  )

  results.push(
    await expectOk('editor can still create a same-trip expense', async () => {
      await asUser(pg, EDITOR)
      const expenseId = await value(
        pg,
        `SELECT public.save_expense(
           $1::uuid, 15, 'MYR', 15, 'MYR', 'food', '2026-12-16', 'Editor same-trip', $2::uuid,
           jsonb_build_array(jsonb_build_object('user_id', $2::text, 'amount', 15)),
           NULL::uuid, $3::uuid, $4::uuid
         )`,
        [tripId, EDITOR, viennaBookingId, viennaPlaceId],
      )
      const stored = await query(pg, 'SELECT created_by, place_id, booking_id FROM expenses WHERE id = $1', [expenseId])
      if (stored.rows[0].created_by !== EDITOR) throw new Error('editor created_by was not stored')
      if (stored.rows[0].place_id !== viennaPlaceId) throw new Error('editor could not attach same-trip place')
      if (stored.rows[0].booking_id !== viennaBookingId) throw new Error('editor could not attach same-trip booking')
    }),
  )

  results.push(
    await expectOk('owner can still update an expense they did not create', async () => {
      await asUser(pg, OWNER)
      const updated = await value(
        pg,
        `SELECT public.save_expense(
           $1::uuid, 12, 'MYR', 12, 'MYR', 'food', '2026-12-12', 'Same-trip place expense (owner)', $2::uuid,
           jsonb_build_array(jsonb_build_object('user_id', $2::text, 'amount', 12)),
           $3::uuid, NULL::uuid, $4::uuid
         )`,
        [tripId, OWNER, sameTripPlaceExpenseId, viennaPlaceId],
      )
      if (updated !== sameTripPlaceExpenseId) throw new Error('owner update did not keep the expense id')
      const description = await value(pg, 'SELECT description FROM expenses WHERE id = $1', [sameTripPlaceExpenseId])
      if (description !== 'Same-trip place expense (owner)') throw new Error('owner could not update the expense')
    }),
  )

  results.push(
    await expectOk('editor still cannot read unrelated trip expenses', async () => {
      await asUser(pg, EDITOR)
      const seen = await value(pg, 'SELECT count(*)::int FROM expenses WHERE trip_id = $1', [otherTripId])
      const seenPlace = await value(pg, 'SELECT count(*)::int FROM places WHERE id = $1', [tokyoPlaceId])
      if (seen !== 0) throw new Error('editor read unrelated expenses')
      if (seenPlace !== 0) throw new Error('editor read an unrelated place')
    }),
  )

  let viennaPollId
  let tokyoPollId
  let viennaOptionA
  let viennaOptionB
  let tokyoOptionA
  let disposablePollId

  results.push(
    await expectOk('same-trip poll creation succeeds', async () => {
      await asUser(pg, OWNER)
      viennaPollId = await value(
        pg,
        `SELECT public.create_poll($1, 'Where should we eat tonight?', ARRAY['Schnitzel', 'Tafelsptiz'])`,
        [tripId],
      )
      const createdBy = await value(pg, 'SELECT created_by FROM polls WHERE id = $1', [viennaPollId])
      if (createdBy !== OWNER) throw new Error('created_by was not forced to the owner')
      const optionCount = await value(pg, 'SELECT count(*)::int FROM poll_options WHERE poll_id = $1', [viennaPollId])
      if (optionCount !== 2) throw new Error(`option count was ${optionCount}`)
      const options = await query(pg, 'SELECT id, label FROM poll_options WHERE poll_id = $1 ORDER BY sort_order', [viennaPollId])
      viennaOptionA = options.rows[0].id
      viennaOptionB = options.rows[1].id
    }),
  )

  results.push(
    await expectOk('cross-trip poll isolation', async () => {
      await asUser(pg, OWNER)
      tokyoPollId = await value(
        pg,
        `SELECT public.create_poll($1, 'Sushi or ramen?', ARRAY['Sushi', 'Ramen'])`,
        [otherTripId],
      )
      await asUser(pg, EDITOR)
      const seen = await value(pg, 'SELECT count(*)::int FROM polls WHERE id = $1', [tokyoPollId])
      if (seen !== 0) throw new Error('editor read a poll from another trip')
    }),
  )

  results.push(
    await expectOk('same-poll option creation succeeds', async () => {
      await asUser(pg, OWNER)
      const extra = await query(
        pg,
        `INSERT INTO poll_options (poll_id, label, sort_order) VALUES ($1, 'Both', 2) RETURNING poll_id`,
        [viennaPollId],
      )
      if (extra.rows[0].poll_id !== viennaPollId) throw new Error('option was not stored on the poll')
    }),
  )

  results.push(
    await expectFail(
      'cross-poll option move fails',
      async () => {
        await asUser(pg, OWNER)
        const tokyoOptions = await query(pg, 'SELECT id FROM poll_options WHERE poll_id = $1 ORDER BY sort_order', [tokyoPollId])
        tokyoOptionA = tokyoOptions.rows[0].id
        await query(pg, `UPDATE poll_options SET poll_id = $1 WHERE id = $2`, [viennaPollId, tokyoOptionA])
      },
      'cannot move',
      'another poll',
    ),
  )

  results.push(
    await expectOk('poll read is trip-scoped', async () => {
      await asUser(pg, EDITOR)
      const vienna = await value(pg, 'SELECT count(*)::int FROM polls WHERE trip_id = $1', [tripId])
      const tokyo = await value(pg, 'SELECT count(*)::int FROM polls WHERE trip_id = $1', [otherTripId])
      if (vienna < 1) throw new Error('editor could not read same-trip polls')
      if (tokyo !== 0) throw new Error('editor read another trip poll')
    }),
  )

  results.push(
    await expectOk('viewer can read polls', async () => {
      await asUser(pg, VIEWER)
      const question = await value(pg, 'SELECT question FROM polls WHERE id = $1', [viennaPollId])
      if (question !== 'Where should we eat tonight?') throw new Error(`question was ${question}`)
    }),
  )

  results.push(
    await expectDenied(
      'viewer cannot mutate polls',
      async () => {
        await asUser(pg, VIEWER)
        await query(pg, `UPDATE polls SET question = 'Hacked' WHERE id = $1`, [viennaPollId])
      },
      async () => {
        await asUser(pg, OWNER)
        const question = await value(pg, 'SELECT question FROM polls WHERE id = $1', [viennaPollId])
        return question !== 'Hacked'
      },
    ),
  )

  results.push(
    await expectOk('owner can vote', async () => {
      await asUser(pg, OWNER)
      await query(
        pg,
        `INSERT INTO poll_votes (poll_id, user_id, option_id) VALUES ($1, $2, $3)`,
        [viennaPollId, VIEWER, viennaOptionA],
      )
      const stored = await query(pg, 'SELECT user_id, option_id FROM poll_votes WHERE poll_id = $1 AND user_id = $2', [
        viennaPollId,
        OWNER,
      ])
      if (stored.rows[0].user_id !== OWNER) throw new Error('vote user_id was not forced to the owner')
      if (stored.rows[0].option_id !== viennaOptionA) throw new Error('owner vote was not stored')
    }),
  )

  results.push(
    await expectOk('editor can vote', async () => {
      await asUser(pg, EDITOR)
      await query(
        pg,
        `INSERT INTO poll_votes (poll_id, option_id) VALUES ($1, $2)`,
        [viennaPollId, viennaOptionA],
      )
      const optionId = await value(pg, 'SELECT option_id FROM poll_votes WHERE poll_id = $1 AND user_id = $2', [
        viennaPollId,
        EDITOR,
      ])
      if (optionId !== viennaOptionA) throw new Error('editor vote was not stored')
    }),
  )

  results.push(
    await expectOk('viewer can vote', async () => {
      await asUser(pg, VIEWER)
      await query(
        pg,
        `INSERT INTO poll_votes (poll_id, option_id) VALUES ($1, $2)`,
        [viennaPollId, viennaOptionB],
      )
      const optionId = await value(pg, 'SELECT option_id FROM poll_votes WHERE poll_id = $1 AND user_id = $2', [
        viennaPollId,
        VIEWER,
      ])
      if (optionId !== viennaOptionB) throw new Error('viewer vote was not stored')
    }),
  )

  results.push(
    await expectFail(
      'one user gets one vote per poll',
      async () => {
        await asUser(pg, OWNER)
        await query(
          pg,
          `INSERT INTO poll_votes (poll_id, option_id) VALUES ($1, $2)`,
          [viennaPollId, viennaOptionB],
        )
      },
      'duplicate',
      'unique',
    ),
  )

  results.push(
    await expectOk('re-voting does not create duplicate votes', async () => {
      await asUser(pg, OWNER)
      await query(
        pg,
        `UPDATE poll_votes SET option_id = $1 WHERE poll_id = $2`,
        [viennaOptionA, viennaPollId],
      )
      const count = await value(pg, 'SELECT count(*)::int FROM poll_votes WHERE poll_id = $1 AND user_id = $2', [
        viennaPollId,
        OWNER,
      ])
      if (count !== 1) throw new Error(`owner votes after re-vote: ${count}`)
    }),
  )

  results.push(
    await expectOk('changing vote works', async () => {
      await asUser(pg, OWNER)
      await query(
        pg,
        `UPDATE poll_votes SET option_id = $1 WHERE poll_id = $2`,
        [viennaOptionB, viennaPollId],
      )
      const optionId = await value(pg, 'SELECT option_id FROM poll_votes WHERE poll_id = $1 AND user_id = $2', [
        viennaPollId,
        OWNER,
      ])
      if (optionId !== viennaOptionB) throw new Error('vote did not change')
    }),
  )

  results.push(
    await expectFail(
      'cross-poll option vote fails',
      async () => {
        await asUser(pg, OWNER)
        tokyoOptionA = await value(pg, 'SELECT id FROM poll_options WHERE poll_id = $1 ORDER BY sort_order LIMIT 1', [
          tokyoPollId,
        ])
        await query(
          pg,
          `INSERT INTO poll_votes (poll_id, option_id) VALUES ($1, $2)`,
          [viennaPollId, tokyoOptionA],
        )
      },
      'does not belong',
      'foreign key',
      'option_poll',
    ),
  )

  results.push(
    await expectFail(
      'cross-trip vote attempt fails',
      async () => {
        await asUser(pg, EDITOR)
        await query(
          pg,
          `INSERT INTO poll_votes (poll_id, option_id) VALUES ($1, $2)`,
          [tokyoPollId, tokyoOptionA],
        )
      },
      'members can vote',
      'Poll not found',
      'policy',
      'permission',
    ),
  )

  results.push(
    await expectFail(
      'unauthenticated vote fails',
      async () => {
        await asPostgres(pg)
        await exec(pg, `SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '{}', false)`)
        await exec(pg, 'SET ROLE authenticated;')
        await query(
          pg,
          `INSERT INTO poll_votes (poll_id, option_id) VALUES ($1, $2)`,
          [viennaPollId, viennaOptionA],
        )
      },
      'authenticated',
    ),
  )

  results.push(
    await expectOk('owner can create and manage a poll', async () => {
      await asUser(pg, OWNER)
      await query(pg, `UPDATE polls SET question = 'Dinner plans?' WHERE id = $1`, [viennaPollId])
      const question = await value(pg, 'SELECT question FROM polls WHERE id = $1', [viennaPollId])
      if (question !== 'Dinner plans?') throw new Error('owner could not update the question')
    }),
  )

  results.push(
    await expectOk('editor can create a poll', async () => {
      await asUser(pg, EDITOR)
      const id = await value(
        pg,
        `SELECT public.create_poll($1, 'Museum or palace?', ARRAY['Museum', 'Palace'])`,
        [tripId],
      )
      const createdBy = await value(pg, 'SELECT created_by FROM polls WHERE id = $1', [id])
      if (createdBy !== EDITOR) throw new Error('editor created_by was not forced')
    }),
  )

  results.push(
    await expectFail(
      'viewer cannot create a poll',
      async () => {
        await asUser(pg, VIEWER)
        await query(pg, `SELECT public.create_poll($1, 'Secret poll?', ARRAY['Yes', 'No'])`, [tripId])
      },
      'policy',
      'permission',
    ),
  )

  results.push(
    await expectOk('activity is readable by trip members', async () => {
      await asUser(pg, EDITOR)
      const count = await value(pg, 'SELECT count(*)::int FROM activities WHERE trip_id = $1', [tripId])
      if (count < 1) throw new Error('editor could not read trip activity')
      const pollAdd = await value(
        pg,
        `SELECT count(*)::int FROM activities WHERE trip_id = $1 AND type = 'poll.add' AND actor_id = $2`,
        [tripId, OWNER],
      )
      if (pollAdd < 1) throw new Error('poll.create did not record activity')
    }),
  )

  results.push(
    await expectOk('cross-trip activity is not readable', async () => {
      await asUser(pg, EDITOR)
      const seen = await value(pg, 'SELECT count(*)::int FROM activities WHERE trip_id = $1', [otherTripId])
      if (seen !== 0) throw new Error('editor read another trip activity')
    }),
  )

  results.push(
    await expectFail(
      'normal client cannot spoof activity actor_id',
      async () => {
        await asUser(pg, EDITOR)
        await query(
          pg,
          `INSERT INTO activities (trip_id, actor_id, type) VALUES ($1, $2, 'poll.vote')`,
          [tripId, OWNER],
        )
      },
      'permission',
      'policy',
    ),
  )

  results.push(
    await expectOk('activity actor is database-derived', async () => {
      await asUser(pg, VIEWER)
      const actor = await value(
        pg,
        `SELECT actor_id FROM activities WHERE trip_id = $1 AND type = 'poll.vote' AND actor_id = $2 ORDER BY created_at DESC LIMIT 1`,
        [tripId, VIEWER],
      )
      if (actor !== VIEWER) throw new Error('vote activity actor was not the viewer')
    }),
  )

  results.push(
    await expectOk('activity is not directly writable by authenticated clients', async () => {
      await asUser(pg, OWNER)
      try {
        await query(pg, `INSERT INTO activities (trip_id, actor_id, type) VALUES ($1, $2, 'place.add')`, [tripId, OWNER])
        throw new Error('expected activity insert to fail')
      } catch (error) {
        if (String(error.message || error).includes('expected activity insert')) throw error
      }
    }),
  )

  results.push(
    await expectOk('existing expense activity trigger behavior remains intact', async () => {
      await asUser(pg, OWNER)
      const expenseActivity = await value(
        pg,
        `SELECT count(*)::int FROM activities WHERE trip_id = $1 AND type IN ('expense.add', 'expense.update')`,
        [tripId],
      )
      if (expenseActivity < 1) throw new Error('expense RPCs no longer record activity')
    }),
  )

  results.push(
    await expectOk('delete poll cleans up options and votes', async () => {
      await asUser(pg, OWNER)
      disposablePollId = await value(
        pg,
        `SELECT public.create_poll($1, 'Keep or go?', ARRAY['Keep', 'Go'])`,
        [tripId],
      )
      const optionId = await value(pg, 'SELECT id FROM poll_options WHERE poll_id = $1 ORDER BY sort_order LIMIT 1', [
        disposablePollId,
      ])
      await query(pg, `INSERT INTO poll_votes (poll_id, option_id) VALUES ($1, $2)`, [disposablePollId, optionId])
      await query(pg, 'DELETE FROM polls WHERE id = $1', [disposablePollId])
      const optionsLeft = await value(pg, 'SELECT count(*)::int FROM poll_options WHERE poll_id = $1', [disposablePollId])
      const votesLeft = await value(pg, 'SELECT count(*)::int FROM poll_votes WHERE poll_id = $1', [disposablePollId])
      if (optionsLeft !== 0) throw new Error('poll options survived poll delete')
      if (votesLeft !== 0) throw new Error('poll votes survived poll delete')
    }),
  )

  results.push(
    await expectOk('delete trip cleans up polls and activity', async () => {
      await asUser(pg, OWNER)
      const doomed = await query(
        pg,
        `INSERT INTO trips (city, country, destination, start_date, end_date, budget_amount, currency)
         VALUES ('Lisbon', 'Portugal', 'Lisbon, Portugal', '2027-05-01', '2027-05-06', 3000, 'MYR')
         RETURNING id`,
      )
      const doomedId = doomed.rows[0].id
      await query(pg, `SELECT public.create_poll($1, 'Tram or walk?', ARRAY['Tram', 'Walk'])`, [doomedId])
      await query(pg, 'DELETE FROM trips WHERE id = $1', [doomedId])
      const pollsLeft = await value(pg, 'SELECT count(*)::int FROM polls WHERE trip_id = $1', [doomedId])
      const activityLeft = await value(pg, 'SELECT count(*)::int FROM activities WHERE trip_id = $1', [doomedId])
      if (pollsLeft !== 0) throw new Error('polls survived trip delete')
      if (activityLeft !== 0) throw new Error('activity survived trip delete')
    }),
  )

  await asUser(pg, OWNER)
  const viennaDocBookingId = await value(
    pg,
    `INSERT INTO bookings (trip_id, type, title, status)
     VALUES ($1, 'hotel', 'Document Hotel', 'confirmed')
     RETURNING id`,
    [tripId],
  )
  const tokyoDocBookingId = await value(
    pg,
    `INSERT INTO bookings (trip_id, type, title, status)
     VALUES ($1, 'train', 'Document Train', 'confirmed')
     RETURNING id`,
    [otherTripId],
  )
  const viennaDocId = await value(pg, 'SELECT gen_random_uuid()')
  const viennaDocPath = `${tripId}/${viennaDocBookingId}/${viennaDocId}.pdf`
  const tokyoDocId = await value(pg, 'SELECT gen_random_uuid()')
  const tokyoDocPath = `${otherTripId}/${tokyoDocBookingId}/${tokyoDocId}.pdf`

  results.push(
    await expectOk('same-trip booking document metadata succeeds', async () => {
      await asUser(pg, OWNER)
      const created = await query(
        pg,
        `INSERT INTO booking_documents (id, booking_id, name, storage_path, mime_type, size_bytes, created_by)
         VALUES ($1, $2, 'invoice.pdf', $3, 'application/pdf', 1200, $4)
         RETURNING id, trip_id, created_by, storage_bucket`,
        [viennaDocId, viennaDocBookingId, viennaDocPath, VIEWER],
      )
      if (created.rows[0].trip_id !== tripId) throw new Error('trip_id was not forced from the booking')
      if (created.rows[0].created_by !== OWNER) throw new Error('created_by was not forced to the owner')
      if (created.rows[0].storage_bucket !== 'booking-docs') throw new Error('bucket was not forced')
    }),
  )

  results.push(
    await expectFail(
      'cross-trip booking document reference fails',
      async () => {
        await asUser(pg, OWNER)
        const spoofId = await value(pg, 'SELECT gen_random_uuid()')
        await query(
          pg,
          `INSERT INTO booking_documents (id, booking_id, trip_id, name, storage_path, mime_type, size_bytes)
           VALUES ($1, $2, $3, 'wrong.pdf', $4, 'application/pdf', 800)`,
          [spoofId, tokyoDocBookingId, tripId, `${tripId}/${tokyoDocBookingId}/${spoofId}.pdf`],
        )
      },
      'path',
      'trip',
      'foreign',
      'Booking',
    ),
  )

  results.push(
    await expectOk('viewer can read permitted document metadata', async () => {
      await asUser(pg, VIEWER)
      const name = await value(pg, 'SELECT name FROM booking_documents WHERE id = $1', [viennaDocId])
      if (name !== 'invoice.pdf') throw new Error(`viewer read ${name}`)
    }),
  )

  results.push(
    await expectDenied(
      'viewer cannot insert document metadata',
      async () => {
        await asUser(pg, VIEWER)
        const id = await value(pg, 'SELECT gen_random_uuid()')
        await query(
          pg,
          `INSERT INTO booking_documents (id, booking_id, name, storage_path, mime_type, size_bytes)
           VALUES ($1, $2, 'secret.pdf', $3, 'application/pdf', 400)`,
          [id, viennaDocBookingId, `${tripId}/${viennaDocBookingId}/${id}.pdf`],
        )
      },
      async () => {
        await asUser(pg, OWNER)
        const count = await value(pg, 'SELECT count(*)::int FROM booking_documents WHERE booking_id = $1', [
          viennaDocBookingId,
        ])
        return count === 1
      },
    ),
  )

  results.push(
    await expectDenied(
      'viewer cannot delete document metadata',
      async () => {
        await asUser(pg, VIEWER)
        await query(pg, 'DELETE FROM booking_documents WHERE id = $1', [viennaDocId])
      },
      async () => {
        await asUser(pg, OWNER)
        const remaining = await value(pg, 'SELECT count(*)::int FROM booking_documents WHERE id = $1', [viennaDocId])
        return remaining === 1
      },
    ),
  )

  results.push(
    await expectOk('editor can create document metadata', async () => {
      await asUser(pg, EDITOR)
      const id = await value(pg, 'SELECT gen_random_uuid()')
      await query(
        pg,
        `INSERT INTO booking_documents (id, booking_id, name, storage_path, mime_type, size_bytes)
         VALUES ($1, $2, 'editor.pdf', $3, 'application/pdf', 500)`,
        [id, viennaDocBookingId, `${tripId}/${viennaDocBookingId}/${id}.pdf`],
      )
    }),
  )

  results.push(
    await expectFail(
      'document cannot be moved across bookings',
      async () => {
        await asUser(pg, OWNER)
        await query(pg, 'UPDATE booking_documents SET booking_id = $1 WHERE id = $2', [
          tokyoDocBookingId,
          viennaDocId,
        ])
      },
      'cannot move',
      'path',
      'another booking',
    ),
  )

  results.push(
    await expectOk('created_by cannot be spoofed on booking documents', async () => {
      await asUser(pg, OWNER)
      await query(pg, 'UPDATE booking_documents SET created_by = $1 WHERE id = $2', [VIEWER, viennaDocId])
      const actor = await value(pg, 'SELECT created_by FROM booking_documents WHERE id = $1', [viennaDocId])
      if (actor !== OWNER) throw new Error('created_by was changed')
    }),
  )

  results.push(
    await expectOk('booking document add records database-derived activity', async () => {
      await asUser(pg, OWNER)
      const actor = await value(
        pg,
        `SELECT actor_id FROM activities
         WHERE trip_id = $1 AND type = 'booking.document.add' AND meta->>'title' = 'invoice.pdf'
         ORDER BY created_at DESC LIMIT 1`,
        [tripId],
      )
      if (actor !== OWNER) throw new Error('document activity actor was not the owner')
    }),
  )

  results.push(
    await expectOk('private booking-docs bucket exists', async () => {
      await asPostgres(pg)
      const bucket = await query(
        pg,
        `SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'booking-docs'`,
      )
      if (!bucket.rows[0]) throw new Error('booking-docs bucket missing')
      if (bucket.rows[0].public !== false) throw new Error('bucket is public')
      if (Number(bucket.rows[0].file_size_limit) !== 10485760) throw new Error('file size limit is wrong')
    }),
  )

  results.push(
    await expectOk('authorized member can insert a trip-scoped storage object', async () => {
      await asUser(pg, OWNER)
      await query(
        pg,
        `INSERT INTO storage.objects (bucket_id, name) VALUES ('booking-docs', $1)`,
        [viennaDocPath],
      )
      await asUser(pg, VIEWER)
      const visible = await value(
        pg,
        `SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'booking-docs' AND name = $1`,
        [viennaDocPath],
      )
      if (visible !== 1) throw new Error('viewer could not read the permitted object')
    }),
  )

  results.push(
    await expectDenied(
      'viewer cannot upload a storage object',
      async () => {
        await asUser(pg, VIEWER)
        const id = await value(pg, 'SELECT gen_random_uuid()')
        await query(
          pg,
          `INSERT INTO storage.objects (bucket_id, name) VALUES ('booking-docs', $1)`,
          [`${tripId}/${viennaDocBookingId}/${id}.pdf`],
        )
      },
      async () => {
        await asUser(pg, OWNER)
        const count = await value(
          pg,
          `SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'booking-docs' AND name LIKE $1`,
          [`${tripId}/${viennaDocBookingId}/%`],
        )
        return count === 1
      },
    ),
  )

  results.push(
    await expectDenied(
      'viewer cannot delete a storage object',
      async () => {
        await asUser(pg, VIEWER)
        await query(pg, `DELETE FROM storage.objects WHERE name = $1`, [viennaDocPath])
      },
      async () => {
        await asUser(pg, OWNER)
        const remaining = await value(
          pg,
          `SELECT count(*)::int FROM storage.objects WHERE name = $1`,
          [viennaDocPath],
        )
        return remaining === 1
      },
    ),
  )

  results.push(
    await expectOk('editor can upload a storage object', async () => {
      await asUser(pg, EDITOR)
      const id = await value(pg, 'SELECT gen_random_uuid()')
      await query(
        pg,
        `INSERT INTO storage.objects (bucket_id, name) VALUES ('booking-docs', $1)`,
        [`${tripId}/${viennaDocBookingId}/${id}.pdf`],
      )
    }),
  )

  results.push(
    await expectFail(
      'cross-trip storage object path is rejected',
      async () => {
        await asUser(pg, OWNER)
        const id = await value(pg, 'SELECT gen_random_uuid()')
        await query(
          pg,
          `INSERT INTO storage.objects (bucket_id, name) VALUES ('booking-docs', $1)`,
          [`${otherTripId}/${viennaDocBookingId}/${id}.pdf`],
        )
      },
      'policy',
      'permission',
      '0 rows',
      'violates row-level',
    ),
  )

  results.push(
    await expectOk('cross-trip member cannot read another trip object', async () => {
      await asUser(pg, OWNER)
      await query(
        pg,
        `INSERT INTO storage.objects (bucket_id, name) VALUES ('booking-docs', $1)`,
        [tokyoDocPath],
      )
      await asUser(pg, EDITOR)
      const visible = await value(
        pg,
        `SELECT count(*)::int FROM storage.objects WHERE name = $1`,
        [tokyoDocPath],
      )
      if (visible !== 0) throw new Error('editor read a Tokyo object')
    }),
  )

  results.push(
    await expectFail(
      'invalid storage object path is rejected',
      async () => {
        await asUser(pg, OWNER)
        await query(
          pg,
          `INSERT INTO storage.objects (bucket_id, name)
           VALUES ('booking-docs', '../secrets/invoice.pdf')`,
        )
      },
      'policy',
      'permission',
      '0 rows',
      'violates row-level',
    ),
  )

  results.push(
    await expectFail(
      'arbitrary storage bucket is rejected',
      async () => {
        await asPostgres(pg)
        await query(
          pg,
          `INSERT INTO storage.buckets (id, name, public)
           VALUES ('avatars', 'avatars', false)
           ON CONFLICT (id) DO NOTHING`,
        )
        await asUser(pg, OWNER)
        const id = await value(pg, 'SELECT gen_random_uuid()')
        await query(
          pg,
          `INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', $1)`,
          [`${tripId}/${viennaDocBookingId}/${id}.pdf`],
        )
      },
      'policy',
      'permission',
      '0 rows',
      'violates row-level',
    ),
  )

  results.push(
    await expectOk('owner can delete a storage object', async () => {
      await asUser(pg, OWNER)
      await query(pg, `DELETE FROM storage.objects WHERE name = $1`, [viennaDocPath])
      const remaining = await value(pg, `SELECT count(*)::int FROM storage.objects WHERE name = $1`, [viennaDocPath])
      if (remaining !== 0) throw new Error('owner could not delete the object')
    }),
  )

  results.push(
    await expectOk('delete booking cleans up document metadata and catalog objects', async () => {
      await asUser(pg, OWNER)
      const doomedBooking = await value(
        pg,
        `INSERT INTO bookings (trip_id, type, title, status)
         VALUES ($1, 'ticket', 'Disposable ticket', 'pending')
         RETURNING id`,
        [tripId],
      )
      const doomedDoc = await value(pg, 'SELECT gen_random_uuid()')
      const doomedPath = `${tripId}/${doomedBooking}/${doomedDoc}.pdf`
      await query(
        pg,
        `INSERT INTO booking_documents (id, booking_id, name, storage_path, mime_type, size_bytes)
         VALUES ($1, $2, 'pass.pdf', $3, 'application/pdf', 300)`,
        [doomedDoc, doomedBooking, doomedPath],
      )
      await query(
        pg,
        `INSERT INTO storage.objects (bucket_id, name) VALUES ('booking-docs', $1)`,
        [doomedPath],
      )
      await query(pg, 'DELETE FROM bookings WHERE id = $1', [doomedBooking])
      const docsLeft = await value(pg, 'SELECT count(*)::int FROM booking_documents WHERE booking_id = $1', [
        doomedBooking,
      ])
      const objectsLeft = await value(
        pg,
        `SELECT count(*)::int FROM storage.objects WHERE name = $1`,
        [doomedPath],
      )
      if (docsLeft !== 0) throw new Error('documents survived booking delete')
      if (objectsLeft !== 0) throw new Error('storage catalog row survived booking delete')
    }),
  )

  results.push(
    await expectOk('delete trip cleans up booking documents', async () => {
      await asUser(pg, OWNER)
      const doomed = await query(
        pg,
        `INSERT INTO trips (city, country, destination, start_date, end_date, budget_amount, currency)
         VALUES ('Oslo', 'Norway', 'Oslo, Norway', '2027-06-01', '2027-06-06', 2800, 'MYR')
         RETURNING id`,
      )
      const doomedId = doomed.rows[0].id
      const doomedBooking = await value(
        pg,
        `INSERT INTO bookings (trip_id, type, title, status)
         VALUES ($1, 'hotel', 'Oslo hotel', 'confirmed')
         RETURNING id`,
        [doomedId],
      )
      const doomedDoc = await value(pg, 'SELECT gen_random_uuid()')
      await query(
        pg,
        `INSERT INTO booking_documents (id, booking_id, name, storage_path, mime_type, size_bytes)
         VALUES ($1, $2, 'oslo.pdf', $3, 'application/pdf', 200)`,
        [doomedDoc, doomedBooking, `${doomedId}/${doomedBooking}/${doomedDoc}.pdf`],
      )
      await query(pg, 'DELETE FROM trips WHERE id = $1', [doomedId])
      const docsLeft = await value(pg, 'SELECT count(*)::int FROM booking_documents WHERE trip_id = $1', [doomedId])
      if (docsLeft !== 0) throw new Error('documents survived trip delete')
    }),
  )

  results.push(
    await expectOk('realtime publication includes trip-scoped cloud tables', async () => {
      await asPostgres(pg)
      const rows = await query(
        pg,
        `SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime'`,
      )
      const names = new Set(rows.rows.map((row) => row.tablename))
      for (const table of [
        'trips',
        'trip_members',
        'trip_invitations',
        'itinerary_days',
        'itinerary_items',
        'places',
        'bookings',
        'booking_documents',
        'expenses',
        'polls',
        'activities',
      ]) {
        if (!names.has(table)) throw new Error(`${table} missing from supabase_realtime`)
      }
    }),
  )

  results.push(
    await expectOk('realtime publication omits tables without a trip filter', async () => {
      await asPostgres(pg)
      const rows = await query(
        pg,
        `SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime'`,
      )
      const names = new Set(rows.rows.map((row) => row.tablename))
      for (const table of ['profiles', 'expense_shares', 'poll_options', 'poll_votes']) {
        if (names.has(table)) throw new Error(`${table} should not be in supabase_realtime`)
      }
    }),
  )

  results.push(
    await expectOk('booking document RLS is unchanged after realtime migration', async () => {
      await asUser(pg, VIEWER)
      const readable = await value(pg, 'SELECT count(*)::int FROM booking_documents WHERE trip_id = $1', [tripId])
      if (readable < 1) throw new Error('viewer can no longer read document metadata')
      await asUser(pg, VIEWER)
      try {
        const id = await value(pg, 'SELECT gen_random_uuid()')
        await query(
          pg,
          `INSERT INTO booking_documents (id, booking_id, name, storage_path, mime_type, size_bytes)
           VALUES ($1, $2, 'nope.pdf', $3, 'application/pdf', 100)`,
          [id, viennaDocBookingId, `${tripId}/${viennaDocBookingId}/${id}.pdf`],
        )
        throw new Error('viewer insert succeeded')
      } catch (error) {
        if (String(error.message || error).includes('viewer insert succeeded')) throw error
      }
    }),
  )

  const failed = results.filter((item) => !item.passed)
  for (const item of results) {
    const mark = item.passed ? 'ok' : 'not ok'
    const suffix = item.detail ? ` - ${item.detail}` : ''
    console.log(`${mark} ${item.name}${suffix}`)
  }
  console.log(`# ${results.length - failed.length}/${results.length} passed`)
  if (failed.length) {
    process.exitCode = 1
  }

  void inviteId
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
