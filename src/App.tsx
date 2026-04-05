import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Privacy from './pages/Privacy';
import Support from './pages/Support';
import Terms from './pages/Terms';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/support" element={<Support />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
      </Routes>
    </BrowserRouter>
  );
}
