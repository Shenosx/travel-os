import { useState } from 'react'
import { exportTripPdf } from '../../lib/pdf/tripPdf.js'
import { Button } from '../ui/Button.jsx'
import { useToast } from '../ui/Toast.jsx'

export function ExportPdfButton({ input }) {
  const showToast = useToast()
  const [exporting, setExporting] = useState(false)

  async function handleExport() {
    if (exporting) return
    setExporting(true)
    try {
      await exportTripPdf(input)
    } catch {
      showToast({ message: 'Could not export the PDF.' })
    } finally {
      setExporting(false)
    }
  }

  return (
    <Button variant="outline" onClick={handleExport} disabled={exporting}>
      {exporting ? 'Exporting…' : 'Export PDF'}
    </Button>
  )
}
