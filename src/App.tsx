import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthGate } from './components/AuthGate'
import { Layout } from './components/Layout'
import { AddWord } from './pages/AddWord'
import { Home } from './pages/Home'
import { Inbox } from './pages/Inbox'
import { Library } from './pages/Library'
import { ResetPassword } from './pages/ResetPassword'
import { Review } from './pages/Review'

/** Lazy: Z-mode CSS/JS only download when the user opens it. */
const ZMode = lazy(() => import('./pages/ZMode'))

function ZModeFallback() {
  return (
    <div className="z-fallback" role="status">
      Spinning up Z-mode…
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="reset-password" element={<ResetPassword />} />
        <Route
          path="*"
          element={
            <AuthGate>
              <Routes>
                <Route element={<Layout />}>
                  <Route index element={<Home />} />
                  <Route path="add" element={<AddWord />} />
                  <Route path="review" element={<Review />} />
                  <Route path="library" element={<Library />} />
                  <Route path="inbox" element={<Inbox />} />
                  <Route
                    path="z"
                    element={
                      <Suspense fallback={<ZModeFallback />}>
                        <ZMode />
                      </Suspense>
                    }
                  />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </AuthGate>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
