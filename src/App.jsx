import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth.jsx'
import { AppDataProvider } from './hooks/useAppData.jsx'
import { ThemeProvider } from './hooks/useTheme.jsx'
import { AppLayout } from './layouts/AppLayout.jsx'
import { PublicLayout } from './layouts/PublicLayout.jsx'
import { AccountPage } from './pages/Account.jsx'
import { DashboardPage } from './pages/Dashboard.jsx'
import { ExpensesPage } from './pages/Expenses.jsx'
import { InsightsPage } from './pages/Insights.jsx'
import { LandingPage } from './pages/Landing.jsx'
import { PlacesPage } from './pages/Places.jsx'
import { JoinTripPage } from './pages/JoinTrip.jsx'
import { SignInPage } from './pages/SignIn.jsx'
import { SignUpPage } from './pages/SignUp.jsx'
import { TripDetailsPage } from './pages/TripDetails.jsx'
import { TripsPage } from './pages/Trips.jsx'

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppDataProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AppDataProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

function AppRoutes() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-canvas text-ink">
        <p className="font-display text-[28px] tracking-[-0.04em]">Travel OS</p>
      </div>
    )
  }

  if (!session) {
    return (
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/join/:inviteCode/:inviteToken" element={<JoinTripPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    )
  }

  return (
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
        <Route path="/signin" element={<Navigate to="/" replace />} />
        <Route path="/signup" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
