import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN_X = 64
const MARGIN_TOP = 68
const MARGIN_BOTTOM = 56
const FOOTER_Y = 36
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2

const INK = rgb(0.086, 0.078, 0.071)
const MUTED = rgb(0.424, 0.404, 0.384)
const SUBTLE = rgb(0.561, 0.537, 0.514)
const LINE = rgb(0.906, 0.89, 0.871)
const ACCENT = rgb(0.769, 0.357, 0.447)

function pdfSafeText(value) {
  return String(value ?? '')
    .replace(/→|⟶/g, '->')
    .replace(/←/g, '<-')
    .replace(/[—–−]/g, '-')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/×/g, 'x')
    .replace(/…/g, '...')
    .replace(/€/g, 'EUR ')
    .replace(/£/g, 'GBP ')
    .replace(/¥/g, 'JPY ')
    .replace(/฿/g, 'THB ')
    .replace(/[^\t\r\n\u0020-\u007E\u00A0-\u00FF]/g, '')
}

function measure(font, text, size) {
  return font.widthOfTextAtSize(pdfSafeText(text), size)
}

function wrapForFont(text, font, size, width = CONTENT_WIDTH) {
  const source = pdfSafeText(text).replace(/\s+/g, ' ').trim()
  if (!source) return []
  const words = source.split(' ')
  const lines = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (measure(font, next, size) <= width) {
      line = next
      continue
    }
    if (line) lines.push(line)
    if (measure(font, word, size) <= width) {
      line = word
      continue
    }
    let chunk = ''
    for (const character of word) {
      const trial = chunk + character
      if (measure(font, trial, size) <= width) {
        chunk = trial
      } else {
        if (chunk) lines.push(chunk)
        chunk = character
      }
    }
    line = chunk
  }
  if (line) lines.push(line)
  return lines
}

function drawLine(page, x1, y, x2, color = LINE, thickness = 0.6) {
  page.drawLine({
    start: { x: x1, y },
    end: { x: x2, y },
    thickness,
    color,
  })
}

function drawText(page, text, x, y, font, size, color = INK) {
  page.drawText(pdfSafeText(text), { x, y, font, size, color })
}

/**
 * @param {Awaited<ReturnType<import('./tripPdf.js').buildTripPdfModel>>} model
 */
export async function renderTripPdf(model) {
  const doc = await PDFDocument.create()
  const serif = await doc.embedFont(StandardFonts.TimesRoman)
  const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold)
  const sans = await doc.embedFont(StandardFonts.Helvetica)
  const sansBold = await doc.embedFont(StandardFonts.HelveticaBold)
  const fonts = { serif, serifBold, sans, sansBold }

  drawCover(doc, fonts, model)

  const ctx = {
    doc,
    fonts,
    model,
    page: null,
    y: 0,
    pageNo: 0,
  }

  drawOverview(ctx)
  if (model.itinerary) drawItinerary(ctx)
  if (model.places) drawPlaces(ctx)
  if (model.bookings) drawBookings(ctx)
  if (model.expenses) drawExpenses(ctx)
  if (model.packing) drawPacking(ctx)
  if (model.checklist) drawChecklist(ctx)
  if (model.notes) drawNotes(ctx)
  stampFooter(ctx)

  return doc.save()
}

function drawCover(doc, fonts, model) {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const { cover } = model
  drawLine(page, MARGIN_X, PAGE_HEIGHT - 56, MARGIN_X + 36, ACCENT, 1.25)
  drawText(page, cover.brand, MARGIN_X, PAGE_HEIGHT - 92, fonts.sans, 10, ACCENT)

  let y = PAGE_HEIGHT * 0.58
  const titleLines = wrapForFont(cover.destination, fonts.serif, 36, CONTENT_WIDTH)
  for (const line of titleLines) {
    drawText(page, line, MARGIN_X, y, fonts.serif, 36, INK)
    y -= 44
  }
  if (cover.tripName) {
    y -= 4
    for (const line of wrapForFont(cover.tripName, fonts.sans, 11, CONTENT_WIDTH)) {
      drawText(page, line, MARGIN_X, y, fonts.sans, 11, MUTED)
      y -= 16
    }
  }
  y -= 18
  drawLine(page, MARGIN_X, y, MARGIN_X + 48, ACCENT, 0.9)
  y -= 28
  if (cover.dates) {
    drawText(page, cover.dates, MARGIN_X, y, fonts.sans, 12, INK)
    y -= 20
  }
  if (cover.country) {
    drawText(page, cover.country, MARGIN_X, y, fonts.sans, 11, MUTED)
    y -= 20
  }
  if (cover.countdown) {
    drawText(page, cover.countdown, MARGIN_X, y, fonts.sans, 10, SUBTLE)
  }
}

function addContentPage(ctx) {
  stampFooter(ctx)
  ctx.page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  ctx.pageNo += 1
  ctx.y = PAGE_HEIGHT - MARGIN_TOP
}

function ensurePage(ctx, needed = 24) {
  if (!ctx.page || ctx.y - needed < MARGIN_BOTTOM + 12) addContentPage(ctx)
}

function stampFooter(ctx) {
  if (!ctx.page || !ctx.pageNo) return
  const { page, fonts, model, pageNo } = ctx
  drawLine(page, MARGIN_X, FOOTER_Y + 14, PAGE_WIDTH - MARGIN_X, LINE, 0.4)
  drawText(page, `${model.footer.brand} · ${model.footer.destination}`, MARGIN_X, FOOTER_Y, fonts.sans, 8, SUBTLE)
  const label = String(pageNo)
  drawText(page, label, PAGE_WIDTH - MARGIN_X - measure(fonts.sans, label, 8), FOOTER_Y, fonts.sans, 8, SUBTLE)
}

function sectionTitle(ctx, title) {
  ensurePage(ctx, 48)
  ctx.y -= 8
  drawText(ctx.page, title.toUpperCase(), MARGIN_X, ctx.y, ctx.fonts.sans, 9, ACCENT)
  ctx.y -= 10
  drawLine(ctx.page, MARGIN_X, ctx.y, PAGE_WIDTH - MARGIN_X, LINE, 0.5)
  ctx.y -= 22
}

function flowLines(ctx, lines, font, size, color = INK, leading = size + 5) {
  for (const line of lines) {
    ensurePage(ctx, leading)
    drawText(ctx.page, line, MARGIN_X, ctx.y, font, size, color)
    ctx.y -= leading
  }
}

function flowWrapped(ctx, text, font, size, color = INK, leading = size + 5) {
  if (!presentable(text)) return
  flowLines(ctx, wrapForFont(text, font, size), font, size, color, leading)
}

function mutedLine(ctx, text) {
  flowWrapped(ctx, text, ctx.fonts.sans, 9, MUTED, 13)
}

function presentable(value) {
  return Boolean(String(value ?? '').trim())
}

function drawOverview(ctx) {
  sectionTitle(ctx, 'Overview')
  for (const fact of ctx.model.overview) {
    ensurePage(ctx, 18)
    drawText(ctx.page, fact.label, MARGIN_X, ctx.y, ctx.fonts.sans, 8, SUBTLE)
    drawText(ctx.page, fact.value, MARGIN_X + 92, ctx.y, ctx.fonts.sans, 10, INK)
    ctx.y -= 18
  }
}

function drawItinerary(ctx) {
  sectionTitle(ctx, 'Itinerary')
  for (const day of ctx.model.itinerary) {
    ensurePage(ctx, 42)
    const heading = day.dayNumber ? `Day ${day.dayNumber}` : 'Day'
    drawText(ctx.page, heading, MARGIN_X, ctx.y, ctx.fonts.serif, 16, INK)
    ctx.y -= 16
    const dateLine = [day.dateLabel, day.title].filter(Boolean).join('  ·  ')
    if (dateLine) {
      drawText(ctx.page, dateLine.toUpperCase(), MARGIN_X, ctx.y, ctx.fonts.sans, 8, SUBTLE)
      ctx.y -= 16
    }
    for (const item of day.items) {
      ensurePage(ctx, 28)
      const time = item.time || '—'
      drawText(ctx.page, time, MARGIN_X, ctx.y, ctx.fonts.sans, 9, ACCENT)
      const titleX = MARGIN_X + 42
      const titleWidth = CONTENT_WIDTH - 42
      const titleLines = wrapForFont(item.title || 'Untitled', ctx.fonts.serif, 12, titleWidth)
      for (const [index, line] of titleLines.entries()) {
        if (index) ensurePage(ctx, 16)
        drawText(ctx.page, line, titleX, ctx.y, ctx.fonts.serif, 12, INK)
        ctx.y -= 15
      }
      if (item.place) mutedLine(ctx, item.place)
      if (item.booking) mutedLine(ctx, item.booking)
      if (item.notes) flowWrapped(ctx, item.notes, ctx.fonts.sans, 9, MUTED, 13)
      ctx.y -= 8
    }
    ctx.y -= 6
  }
}

function drawMetaBlock(ctx, rows) {
  const visible = rows.filter((row) => presentable(row.value))
  for (const row of visible) {
    ensurePage(ctx, 14)
    drawText(ctx.page, row.label, MARGIN_X, ctx.y, ctx.fonts.sans, 8, SUBTLE)
    const lines = wrapForFont(row.value, ctx.fonts.sans, 10, CONTENT_WIDTH - 88)
    for (const [index, line] of lines.entries()) {
      if (index) ensurePage(ctx, 13)
      drawText(ctx.page, line, MARGIN_X + 88, ctx.y, ctx.fonts.sans, 10, INK)
      ctx.y -= 13
    }
  }
}

function drawPlaces(ctx) {
  sectionTitle(ctx, 'Places')
  for (const place of ctx.model.places) {
    ensurePage(ctx, 36)
    flowWrapped(ctx, place.name, ctx.fonts.serif, 13, INK, 16)
    drawMetaBlock(ctx, [
      { label: 'Status', value: place.status },
      { label: 'Category', value: place.category },
      { label: 'Location', value: place.area },
      { label: 'Rating', value: place.rating != null ? String(place.rating) : '' },
      { label: 'Cost', value: place.cost },
    ])
    if (place.notes) {
      ctx.y -= 2
      flowWrapped(ctx, place.notes, ctx.fonts.sans, 9, MUTED, 13)
    }
    ctx.y -= 14
  }
}

function drawBookings(ctx) {
  sectionTitle(ctx, 'Bookings')
  for (const booking of ctx.model.bookings) {
    ensurePage(ctx, 36)
    flowWrapped(ctx, booking.title, ctx.fonts.serif, 13, INK, 16)
    drawMetaBlock(ctx, [
      { label: 'Type', value: booking.type },
      { label: 'Date', value: booking.date },
      { label: 'Time', value: booking.time },
      { label: 'Location', value: booking.location },
      { label: 'Confirmation', value: booking.confirmation },
      { label: 'Cost', value: booking.cost },
      { label: 'Status', value: booking.status },
      { label: 'Documents', value: booking.documentAttached ? 'Document attached' : '' },
    ])
    ctx.y -= 14
  }
}

function drawExpenses(ctx) {
  const expenses = ctx.model.expenses
  sectionTitle(ctx, 'Expenses')
  drawMetaBlock(ctx, [
    { label: 'Trip spending', value: expenses.total },
    { label: 'Your spending', value: expenses.yourPaid },
    { label: 'Your share', value: expenses.yourShare },
    expenses.shared && expenses.outstanding
      ? { label: 'Outstanding', value: expenses.outstanding }
      : null,
  ].filter(Boolean))
  ctx.y -= 8

  if (expenses.shared && expenses.settlement) {
    ensurePage(ctx, 28)
    drawText(ctx.page, 'SETTLEMENT', MARGIN_X, ctx.y, ctx.fonts.sans, 8, SUBTLE)
    ctx.y -= 14
    mutedLine(ctx, `Net  ${expenses.settlement.net}`)
    for (const group of expenses.settlement.youOwe) {
      flowWrapped(ctx, `You owe ${group.name}  ${group.total}`, ctx.fonts.sans, 10, INK, 14)
      for (const item of group.items) mutedLine(ctx, `${item.label}  ${item.amount}`)
    }
    for (const group of expenses.settlement.youAreOwed) {
      flowWrapped(ctx, `${group.name} owes you  ${group.total}`, ctx.fonts.sans, 10, INK, 14)
      for (const item of group.items) mutedLine(ctx, `${item.label}  ${item.amount}`)
    }
    ctx.y -= 8
  }

  if (expenses.repayments?.length) {
    ensurePage(ctx, 28)
    drawText(ctx.page, 'REPAYMENTS', MARGIN_X, ctx.y, ctx.fonts.sans, 8, SUBTLE)
    ctx.y -= 14
    mutedLine(ctx, 'Transfers between people. Not included in trip spending.')
    for (const item of expenses.repayments) {
      ensurePage(ctx, 28)
      flowWrapped(ctx, `${item.from} → ${item.to}  ${item.amount}`, ctx.fonts.sans, 10, INK, 14)
      mutedLine(ctx, [item.date, item.method, item.note].filter(Boolean).join('  ·  '))
      ctx.y -= 6
    }
    ctx.y -= 4
  }

  ensurePage(ctx, 28)
  drawText(ctx.page, 'EXPENSE LIST', MARGIN_X, ctx.y, ctx.fonts.sans, 8, SUBTLE)
  ctx.y -= 16
  for (const row of expenses.rows) {
    ensurePage(ctx, 28)
    const amountWidth = measure(ctx.fonts.sans, row.amount, 10)
    drawText(ctx.page, row.amount, PAGE_WIDTH - MARGIN_X - amountWidth, ctx.y, ctx.fonts.sans, 10, INK)
    flowWrapped(ctx, row.description, ctx.fonts.serif, 11, INK, 14)
    mutedLine(
      ctx,
      [row.date, row.category, row.payer, row.currency].filter(Boolean).join('  ·  '),
    )
    ctx.y -= 8
  }
}

function drawPacking(ctx) {
  const packing = ctx.model.packing
  sectionTitle(ctx, 'Packing')
  mutedLine(ctx, packing.summary)
  ctx.y -= 6
  for (const category of packing.categories) {
    ensurePage(ctx, 24)
    drawText(ctx.page, category.name.toUpperCase(), MARGIN_X, ctx.y, ctx.fonts.sans, 8, SUBTLE)
    ctx.y -= 14
    for (const item of category.items) {
      ensurePage(ctx, 16)
      const mark = item.packed ? 'Packed' : 'Unpacked'
      const qty = item.quantity > 1 ? `  × ${item.quantity}` : ''
      flowWrapped(ctx, `${mark}  ·  ${item.name}${qty}`, ctx.fonts.sans, 10, INK, 14)
      if (item.note) mutedLine(ctx, item.note)
    }
    ctx.y -= 8
  }
}

function drawChecklist(ctx) {
  const checklist = ctx.model.checklist
  sectionTitle(ctx, 'Checklist')
  mutedLine(ctx, checklist.summary)
  ctx.y -= 6
  for (const phase of checklist.phases) {
    ensurePage(ctx, 24)
    drawText(ctx.page, phase.label, MARGIN_X, ctx.y, ctx.fonts.serif, 13, INK)
    ctx.y -= 16
    for (const category of phase.categories) {
      ensurePage(ctx, 18)
      drawText(ctx.page, category.name.toUpperCase(), MARGIN_X, ctx.y, ctx.fonts.sans, 8, SUBTLE)
      ctx.y -= 14
      for (const item of category.items) {
        ensurePage(ctx, 16)
        const mark = item.done ? 'Done' : 'Open'
        flowWrapped(ctx, `${mark}  ·  ${item.name}`, ctx.fonts.sans, 10, INK, 14)
        if (item.dueDate) mutedLine(ctx, item.dueDate)
        if (item.note) mutedLine(ctx, item.note)
      }
    }
    ctx.y -= 8
  }
}

function drawNotes(ctx) {
  sectionTitle(ctx, 'Notes')
  for (const note of ctx.model.notes) {
    ensurePage(ctx, 36)
    flowWrapped(ctx, note.title || 'Note', ctx.fonts.serif, 13, INK, 16)
    mutedLine(ctx, [note.date, note.updatedAt ? `Updated ${note.updatedAt}` : ''].filter(Boolean).join('  ·  '))
    ctx.y -= 2
    flowWrapped(ctx, note.body, ctx.fonts.sans, 10, INK, 14)
    ctx.y -= 14
  }
}
