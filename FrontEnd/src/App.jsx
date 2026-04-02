import { Routes, Route } from "react-router-dom";
import { Suspense, lazy } from "react";
// import { NavigationProvider } from "./contexts/NavigationContext";
import { CatalogProvider } from "./contexts/CatalogContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import ErrorBoundary from "./components/ErrorBoundary";
import CatalogPage from "./pages/CatalogPage";
import LoadingSpinner from "./components/LoadingSpinner";
import "./App.css";
import "./styles/notification.css";

// Lazy load da página de detalhes (carregada só quando necessário)
const ProductDetailsPage = lazy(() => import("./pages/ProductDetailsPage"));

function App() {
  return (
    // <NavigationProvider>
    <ErrorBoundary>
      <NotificationProvider>
        <CatalogProvider>
          <Routes>
            <Route path="/" element={<CatalogPage />} />
            <Route
              path="/produtos/:code"
              element={
                <Suspense fallback={<LoadingSpinner />}>
                  <ProductDetailsPage />
                </Suspense>
              }
            />
          </Routes>
        </CatalogProvider>
      </NotificationProvider>
    </ErrorBoundary>
    // </NavigationProvider>
  );
}

export default App;
