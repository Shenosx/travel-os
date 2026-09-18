import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth.jsx'
import { AppDataProvider } from './hooks/useAppData.jsx'
import { ThemeProvider } from './hooks/useTheme.jsx'
import { AppLayout } from './layouts/AppLayout.jsx'
import { AccountPage } from './pages/Account.jsx'
import { DashboardPage } from './pages/Dashboard.jsx'
import { ExpensesPage } from './pages/Expenses.jsx'
import { InsightsPage } from './pages/Insights.jsx'
import { PlacesPage } from './pages/Places.jsx'
import { JoinTripPage } from './pages/JoinTrip.jsx'
import { TripDetailsPage } from './pages/TripDetails.jsx'
import { TripsPage } from './pages/Trips.jsx'

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppDataProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/trips" element={<TripsPage />} />
                <Route path="/join/:inviteCode/:inviteToken" element={<JoinTripPage />} />
                <Route path="/trips/:tripId" element={<TripDetailsPage />} />
                <Route path="/expenses" element={<ExpensesPage />} />
                <Route path="/places" element={<PlacesPage />} />
                <Route path="/insights" element={<InsightsPage />} />
                <Route path="/account" element={<AccountPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AppDataProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
