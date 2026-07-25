import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AddWord } from './pages/AddWord'
import { Home } from './pages/Home'
import { Library } from './pages/Library'
import { Review } from './pages/Review'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="add" element={<AddWord />} />
          <Route path="review" element={<Review />} />
          <Route path="library" element={<Library />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
