import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppDataProvider } from './hooks/useAppData.jsx'
import { ThemeProvider } from './hooks/useTheme.jsx'
import { AppLayout } from './layouts/AppLayout.jsx'
import { DashboardPage } from './pages/Dashboard.jsx'
import { ExpensesPage } from './pages/Expenses.jsx'
import { InsightsPage } from './pages/Insights.jsx'
import { PlacesPage } from './pages/Places.jsx'
import { TripDetailsPage } from './pages/TripDetails.jsx'
import { TripsPage } from './pages/Trips.jsx'

export default function App() {
  return (
    <ThemeProvider>
      <AppDataProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/trips" element={<TripsPage />} />
              <Route path="/trips/:tripId" element={<TripDetailsPage />} />
              <Route path="/expenses" element={<ExpensesPage />} />
              <Route path="/places" element={<PlacesPage />} />
              <Route path="/insights" element={<InsightsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AppDataProvider>
    </ThemeProvider>
  )
}
