import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useNotification } from "../hooks/useNotification";
// import { useProductNavigation } from "../hooks/useProductNavigation";
import LoadingSpinner from "../components/LoadingSpinner";
import ErrorMessage from "../components/ErrorMessage";
import EmptyState from "../components/EmptyState";
import ConjuntoGallery from "../components/ConjuntoGallery";
import { getImageUrl as utilGetImageUrl } from "../utils/imageUtils";
import ImageLightbox from "../components/ImageLightbox";
import Header from "../components/Header";
import { useCatalogState } from "../contexts/CatalogContext";
import { fetchProductDetails } from "../services/productService";
import ProductTransition from "../components/ProductTransition";
import NavigationProgress from "../components/NavigationProgress";
import "../styles/CatalogPage.css";
import "../styles/ProductDetails.css";
import caixasImg from "../assets/caixas_2.webp";

function ProductDetailsPage() {
  const { code } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const notify = useNotification();

  const { preloadState, getFromProductsCache } = useCatalogState();

  // ✅ Extrai valores estáveis para o Hook (corrige erro do ESLint no Vercel)
  const preloadLoaded = preloadState?.loaded;
  const preloadSnapshot = preloadState?.snapshot;

  // Navigation functions
  const navigateToProduct = useCallback((productCode, context = null, additionalState = {}) => {
    if (!productCode) return;
    const path = `/produtos/${encodeURIComponent(String(productCode))}`;
    const state = {
      ...additionalState,
      fromProduct: context?.fromProduct || null,
      context: context?.type || null,
      navigationTimestamp: Date.now(),
    };
    navigate(path, { state });
  }, [navigate]);

  const navigateToConjuntoPiece = useCallback((pieceCode, parentCode) => {
    if (!pieceCode) return;
    navigateToProduct(pieceCode, {
      type: 'from-conjunto',
      fromProduct: parentCode
    }, {
      parentProductCode: parentCode,
      navigationType: 'conjunto'
    });
  }, [navigateToProduct]);

  const navigateToMembershipConjunto = useCallback((conjuntoCode, pieceCode) => {
    if (!conjuntoCode) return;
    navigateToProduct(conjuntoCode, {
      type: 'from-membership',
      fromProduct: pieceCode
    }, {
      childProductCode: pieceCode,
      navigationType: 'membership'
    });
  }, [navigateToProduct]);

  const goBackToPreviousProduct = useCallback((fallbackPath = "/") => {
    if (window.history.length > 1) {
      navigate(-1);
      return true;
    } else {
      navigate(fallbackPath);
      return false;
    }
  }, [navigate]);

  const clearHistory = useCallback(() => {
    navigate("/");
  }, [navigate]);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [imageError, setImageError] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("conjuntos");
  const [isNavigating, setIsNavigating] = useState(false);

  const lastLoadedCode = useRef(null);
  const loadingTimeoutRef = useRef(null);

  // Quando o usuário clica numa aba, NÃO queremos que o loadData sobrescreva o activeTab
  const userSelectedTabRef = useRef(false);

  // refs para evitar dependências instáveis no loadData
  const dataRef = useRef(null);
  const loadingRef = useRef(false);

  const determineInitialTab = (
    conjuntosArr,
    membershipsArr,
    benchmarksArr,
    aplicacoesArr,
    context
  ) => {
    const conj = Array.isArray(conjuntosArr) ? conjuntosArr : [];
    const mem = Array.isArray(membershipsArr) ? membershipsArr : [];
    const bench = Array.isArray(benchmarksArr) ? benchmarksArr : [];
    const aplic = Array.isArray(aplicacoesArr) ? aplicacoesArr : [];

    if (context === "from-conjunto" && mem.length > 0) return "memberships";
    if (context === "from-piece" && conj.length > 0) return "conjuntos";

    if (conj.length > 0) return "conjuntos";
    if (mem.length > 0) return "memberships";
    if (bench.length > 0) return "benchmarks";
    if (aplic.length > 0) return "aplicacoes";
    return "conjuntos";
  };

  const getProduct = (d) => d?.data?.product || d?.product;
  const getConjuntos = (d) => {
    const raw = d?.data?.conjuntos || d?.conjuntos || [];
    return Array.isArray(raw) ? raw : [];
  };
  const getMemberships = (d) => {
    const raw = d?.data?.memberships || d?.memberships || [];
    return Array.isArray(raw) ? raw : [];
  };
  const getBenchmarks = (d) => {
    const raw = d?.data?.benchmarks || d?.benchmarks || [];
    return Array.isArray(raw) ? raw : [];
  };
  const getAplicacoes = (d) => {
    const raw = d?.data?.aplicacoes || d?.aplicacoes || [];
    return Array.isArray(raw) ? raw : [];
  };

  const normalizeConjuntoItem = (c) => {
    if (!c || typeof c !== "object") return null;
    const filho = (c.filho || c.codigo || c.code || c.child || c.filho_codigo || "").toString();
    const filho_des = c.filho_des || c.descricao || c.des || c.nome || "";
    const qtd_explosao = c.qtd_explosao ?? c.quantidade ?? c.qtd ?? 1;
    return { ...c, filho, filho_des, qtd_explosao };
  };

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    userSelectedTabRef.current = false;
    setImageError(false);
    setLightboxOpen(false);
  }, [code]);

  const handleTabClick = useCallback((tabKey) => {
    userSelectedTabRef.current = true;
    setActiveTab(tabKey);
  }, []);

  const loadData = useCallback(
    async (context = null) => {
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);

      try {
        loadingRef.current = true;
        setLoading(true);
        setError("");

        if (!code || typeof code !== "string" || code.trim().length === 0) {
          throw new Error("Código do produto inválido");
        }

        if (lastLoadedCode.current === code && dataRef.current) {
          loadingRef.current = false;
          setLoading(false);
          return;
        }

        const canAutoPickTab = !userSelectedTabRef.current;

        loadingTimeoutRef.current = setTimeout(() => {
          if (loadingRef.current) {
            console.warn(`Timeout no carregamento do produto ${code}`);
            loadingRef.current = false;
            setLoading(false);
            notify.warning("Carregamento está demorando mais que o esperado...");
          }
        }, 5000);

        let usedSnapshot = false;

        // ✅ Usa preloadLoaded/preloadSnapshot (não usa preloadState direto)
        if (preloadLoaded && preloadSnapshot) {
          const snap = preloadSnapshot;
          const normalizedCode = String(code || "").toUpperCase().replace(/\s+/g, "").trim();

          let product = (Array.isArray(snap.products) ? snap.products : []).find(
            (p) =>
              String(p.codigo || p.code || p.id || "")
                .toUpperCase()
                .replace(/\s+/g, "")
                .trim() === normalizedCode
          );

          if (!product) {
            const conjuntoRelations = (Array.isArray(snap.conjuntos) ? snap.conjuntos : []).filter(
              (c) =>
                String(c.pai || c.codigo_conjunto || "")
                  .toUpperCase()
                  .replace(/\s+/g, "") === normalizedCode
            );
            if (conjuntoRelations.length > 0) {
              product = (Array.isArray(snap.products) ? snap.products : []).find(
                (p) =>
                  String(p.codigo || p.code || p.id || "")
                    .toUpperCase()
                    .replace(/\s+/g, "")
                    .trim() === normalizedCode
              );
            }
          }

          if (product) {
            const conjuntos = Array.isArray(snap.conjuntos)
              ? snap.conjuntos
                .filter(
                  (c) =>
                    String(c.pai || c.codigo_conjunto || "")
                      .toUpperCase()
                      .replace(/\s+/g, "") === normalizedCode
                )
                .map((c) => ({
                  filho: c.filho || c.codigo || c.codigo_componente || "",
                  filho_des: c.filho_des || c.descricao || c.des || null,
                  qtd_explosao: c.qtd_explosao || c.quantidade || c.qtd || 1,
                }))
              : [];

            const aplicacoes = Array.isArray(snap.aplicacoes)
              ? snap.aplicacoes.filter(
                (a) =>
                  String(a.codigo_conjunto || "")
                    .toUpperCase()
                    .replace(/\s+/g, "") === normalizedCode
              )
              : [];

            const benchmarks = Array.isArray(snap.benchmarks)
              ? snap.benchmarks.filter(
                (b) =>
                  String(b.codigo || "")
                    .toUpperCase()
                    .replace(/\s+/g, "") === normalizedCode
              )
              : [];

            const memberships = Array.isArray(snap.conjuntos)
              ? snap.conjuntos
                .filter(
                  (c) =>
                    String(c.filho || "")
                      .toUpperCase()
                      .replace(/\s+/g, "") === normalizedCode
                )
                .map((c) => ({
                  codigo_conjunto: c.pai || c.codigo_conjunto || "",
                  quantidade: c.qtd_explosao || c.quantidade || c.qtd || 1,
                }))
              : [];

            setData({ data: { product, conjuntos, aplicacoes, benchmarks, memberships } });

            if (canAutoPickTab) {
              const tab = determineInitialTab(conjuntos, memberships, benchmarks, aplicacoes, context);
              setActiveTab(tab);
            }

            usedSnapshot = true;
            lastLoadedCode.current = code;
          }
        }

        if (!usedSnapshot) {
          const result = await fetchProductDetails(code);
          if (result && typeof result === "object") {
            setData(result);

            const conjuntosApi = Array.isArray(result?.data?.conjuntos)
              ? result.data.conjuntos
              : Array.isArray(result?.conjuntos)
                ? result.conjuntos
                : [];
            const membershipsApi = Array.isArray(result?.data?.memberships)
              ? result.data.memberships
              : Array.isArray(result?.memberships)
                ? result.memberships
                : [];
            const benchmarksApi = Array.isArray(result?.data?.benchmarks)
              ? result.data.benchmarks
              : Array.isArray(result?.benchmarks)
                ? result.benchmarks
                : [];
            const aplicacoesApi = Array.isArray(result?.data?.aplicacoes)
              ? result.data.aplicacoes
              : Array.isArray(result?.aplicacoes)
                ? result.aplicacoes
                : [];

            const pickApi = () => {
              if (context === "from-conjunto" && membershipsApi.length > 0) return "memberships";
              if (context === "from-piece" && conjuntosApi.length > 0) return "conjuntos";
              if (conjuntosApi.length > 0) return "conjuntos";
              if (membershipsApi.length > 0) return "memberships";
              if (benchmarksApi.length > 0) return "benchmarks";
              if (aplicacoesApi.length > 0) return "aplicacoes";
              return "conjuntos";
            };

            if (canAutoPickTab) setActiveTab(pickApi());
            lastLoadedCode.current = code;
          }
        }
      } catch (err) {
        const errorMsg = err?.message || "Erro desconhecido ao carregar detalhes";
        console.error("Erro ao carregar detalhes:", errorMsg);
        notify.error(errorMsg);
        setError(errorMsg);
        setData(null);
      } finally {
        loadingRef.current = false;
        setLoading(false);
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      }
    },
    // ✅ Agora ESLint fica satisfeito e Vercel não falha
    [code, notify, preloadLoaded, preloadSnapshot]
  );

  const context = searchParams.get("context");

  useEffect(() => {
    loadData(context);

    if (context) {
      setSearchParams(new URLSearchParams(), { replace: true });
    }

    return () => {
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      lastLoadedCode.current = null;
      dataRef.current = null;
    };
  }, [loadData, context, setSearchParams]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [code]);

  const product = useMemo(() => getProduct(data), [data]);
  const conjuntos = useMemo(() => getConjuntos(data), [data]);
  const memberships = useMemo(() => getMemberships(data), [data]);
  const benchmarks = useMemo(() => getBenchmarks(data), [data]);
  const aplicacoes = useMemo(() => getAplicacoes(data), [data]);

  const validConjuntos = useMemo(() => {
    const normalized = (Array.isArray(conjuntos) ? conjuntos : [])
      .map(normalizeConjuntoItem)
      .filter(Boolean);
    return normalized.filter((c) => String(c.filho).trim() !== "");
  }, [conjuntos]);

  const enrichedMemberships = useMemo(() => {
    const memArr = Array.isArray(memberships) ? memberships : [];
    return memArr.map((membership) => {
      const cachedProduct = getFromProductsCache(membership.codigo_conjunto);
      return {
        ...membership,
        nome_conjunto: cachedProduct?.descricao || `Conjunto ${membership.codigo_conjunto}`,
      };
    });
  }, [memberships, getFromProductsCache]);

  const handleBackClick = useCallback(() => {
    setIsNavigating(true);
    lastLoadedCode.current = null;
    dataRef.current = null;
    const success = goBackToPreviousProduct("/");
    setTimeout(() => setIsNavigating(false), 300);
    return success;
  }, [goBackToPreviousProduct]);

  const handlePieceClick = useCallback(
    (pieceCode, contextType = "from-conjunto") => {
      if (!pieceCode) return;

      setIsNavigating(true);
      setLightboxOpen(false);

      if (contextType === "from-conjunto") {
        navigateToConjuntoPiece(pieceCode, code);
      } else if (contextType === "from-piece") {
        navigateToMembershipConjunto(pieceCode, code);
      } else {
        navigateToProduct(pieceCode, { type: contextType });
      }

      setTimeout(() => setIsNavigating(false), 300);
    },
    [code, navigateToConjuntoPiece, navigateToMembershipConjunto, navigateToProduct]
  );

  const handleCopyCode = useCallback(() => {
    if (product?.codigo) {
      navigator.clipboard.writeText(product.codigo);
      notify.success("Código copiado!");
    }
  }, [product?.codigo, notify]);

  const getImageUrl = useCallback(() => {
    if (!product?.codigo) return "";
    return utilGetImageUrl(product.codigo);
  }, [product?.codigo]);

  const handlePrint = useCallback(() => {
    if (!product) return;

    const logoPath = "/logo192.png";
    const productImage = getImageUrl();

    const renderItemsList = (items) => {
      const useColumns = items.length > 10;
      const colCount = items.length > 20 ? 3 : 2;
      const style = useColumns ? `column-count: ${colCount}; column-gap: 24px;` : "";
      return `<ul class="print-list" style="${style}">${items
        .map(
          (it) =>
            `<li><strong>${it.filho || it.codigo || it.codigo_conjunto || it.numero_original || it.veiculo || ""}</strong> — ${it.filho_des || it.descricao || it.nome_conjunto || it.origem || it.fabricante || ""
            } ${it.modelo ? "- " + it.modelo : ""} ${it.ano ? "(" + it.ano + ")" : ""}</li>`
        )
        .join("")}</ul>`;
    };

    const style = `
      body{font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial; color:#222; margin:0}
      .page{padding:28px;box-sizing:border-box;width:100%;}
      .header{display:flex;gap:18px;align-items:center;margin-bottom:10px}
      .logo{width:88px;height:88px;object-fit:contain}
      .title{font-size:30px;font-weight:800;margin:0}
      .subtitle{font-size:16px;color:#444;margin-top:6px}
      .meta-line{margin-top:8px;font-size:14px;color:#333}
      .divider{height:1px;background:#e6e6e6;margin:12px 0}
      .product-image-large{width:100%;height:540px;object-fit:contain;border:1px solid #eee;padding:10px;background:#fff}
      h2.section-title{font-size:22px;margin:0 0 8px 0}
      .print-list{list-style:none;padding:0;margin:0;line-height:1.7}
      .print-list li{padding:8px 0;border-bottom:1px solid #f0f0f0}
      .print-table{width:100%;border-collapse:collapse}
      .print-table th,.print-table td{border:1px solid #e6e6e6;padding:8px;text-align:left}
      .page-break{page-break-after:always}
      @page { margin: 18mm }
      @media print{ .page{padding:12mm} .logo{width:72px;height:72px} }
    `;

    let pages = [];

    pages.push(`
      <div class="page">
        <div class="header">
          <img src="${logoPath}" class="logo" alt="Logo" />
          <div>
            <h1 class="title">${product.descricao || ""}</h1>
            <div class="subtitle">Código: <strong>${product.codigo || ""}</strong> &nbsp; • &nbsp; Grupo: <strong>${product.grupo || "—"}</strong></div>
            <div class="meta-line">Gerado em: ${new Date().toLocaleString()}</div>
          </div>
        </div>
        <div class="divider"></div>
        <div>
          <img src="${productImage}" class="product-image-large" alt="${product.codigo || ""} - ${product.descricao || ""}" />
        </div>
      </div>
      <div class="page-break"></div>
    `);

    const sections = [
      { key: "Peças do Conjunto", items: validConjuntos },
      { key: "Usado em Conjuntos", items: enrichedMemberships },
      { key: "Benchmarks", items: benchmarks },
      { key: "Aplicações", items: aplicacoes },
    ];

    sections.forEach((sec) => {
      const items = Array.isArray(sec.items) ? sec.items : [];
      if (items.length === 0) return;
      pages.push(`
        <div class="page">
          <div class="header">
            <img src="${logoPath}" class="logo" alt="Logo" />
            <div>
              <h2 class="section-title">${sec.key}</h2>
            </div>
          </div>
          <div class="divider"></div>
          ${renderItemsList(items)}
        </div>
        <div class="page-break"></div>
      `);
    });

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Ficha - ${product.codigo || ""}</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>${style}</style></head><body>${pages.join(
      ""
    )}</body></html>`;

    const w = window.open("", "_blank");
    if (!w) {
      notify.error("Não foi possível abrir a janela de impressão. Verifique bloqueadores de pop-up.");
      return;
    }

    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    w.onload = () => {
      setTimeout(() => {
        try {
          w.print();
        } catch (e) {
          console.warn("Erro ao imprimir:", e);
        }
        try {
          w.close();
        } catch (e) { }
      }, 500);
    };
  }, [product, getImageUrl, validConjuntos, enrichedMemberships, benchmarks, aplicacoes, notify]);

  return (
    <>
      <NavigationProgress isActive={isNavigating} />

      <Header
        showLogo={true}
        title="Detalhes do Produto"
        showBackButton={true}
        onBackClick={handleBackClick}
        onLogoClick={clearHistory}
        backButtonDisabled={isNavigating}
      />

      <ProductTransition productCode={code} isNavigating={isNavigating}>
        <main className="product-details-main">
          <div className="product-navigation">
            <div className="navigation-actions">
              <button
                type="button"
                className="action-btn copy-btn"
                onClick={handleCopyCode}
                title="Copiar código"
                disabled={isNavigating}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span>Copiar Código</span>
              </button>

              <a href="https://abr-ind.vercel.app/" className="abr-link" target="_blank" rel="noopener noreferrer">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                <span>Site ABR</span>
              </a>
            </div>
          </div>

          {loading && (
            <div className="product-loading-container">
              <LoadingSpinner variant="details" />
              <p className="loading-text">Carregando detalhes do produto...</p>
            </div>
          )}

          {error && !loading && (
            <div className="product-error-container">
              <ErrorMessage error={error} onRetry={loadData} variant="banner" />
            </div>
          )}

          {!loading && !error && product && (
            <div className="product-details-container">
              <div className="product-header">
                <div className="product-header-info">
                  <h1 className="product-title">{product.descricao}</h1>
                  <div className="product-subtitle">
                    <div className="product-code">
                      <span className="code-label">Código:</span>
                      <span
                        className="code-value"
                        onClick={handleCopyCode}
                        style={{ cursor: "pointer" }}
                        title="Clique para copiar"
                      >
                        {product.codigo}
                      </span>
                    </div>
                    <div className="product-group">
                      <span className="group-label">Grupo:</span>
                      <span className="group-value">{product.grupo || "Não especificado"}</span>
                    </div>
                  </div>
                </div>

                {product.grupo === "JOGOS DE JUNTAS" && (
                  <div className="product-header-desktop-image" aria-hidden="true">
                    <img src={caixasImg} alt="" loading="lazy" />
                  </div>
                )}

                <div className="product-image-preview">
                  {!imageError ? (
                    <div className="product-image-wrapper" onClick={() => setLightboxOpen(true)}>
                      <img
                        src={getImageUrl()}
                        alt={`${product.codigo} - ${product.descricao}`}
                        className="product-main-image"
                        onError={() => setImageError(true)}
                        loading="lazy"
                      />
                      <div className="image-overlay">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                          <circle cx="11" cy="11" r="8" />
                          <path d="m21 21-4.35-4.35" />
                        </svg>
                        <span>Clique para ampliar</span>
                      </div>
                    </div>
                  ) : (
                    <div className="product-image-placeholder">
                      <div className="placeholder-icon">📷</div>
                      <div className="placeholder-text">Imagem não disponível</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="product-tabs">
                {validConjuntos.length > 0 && (
                  <button
                    type="button"
                    className={`tab-btn ${activeTab === "conjuntos" ? "active" : ""}`}
                    onClick={() => handleTabClick("conjuntos")}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20.42 4.58a5.4 5.4 0 0 0-7.65 0l-.77.78-.77-.78a5.4 5.4 0 0 0-7.65 0C1.46 6.7 1.33 10.28 4 13l8 8 8-8c2.67-2.72 2.54-6.3.42-8.42z" />
                    </svg>
                    Peças do Conjunto
                    <span className="badge">{validConjuntos.length}</span>
                  </button>
                )}

                {memberships.length > 0 && (
                  <button
                    type="button"
                    className={`tab-btn ${activeTab === "memberships" ? "active" : ""}`}
                    onClick={() => handleTabClick("memberships")}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    Usado em Conjuntos
                    <span className="badge">{memberships.length}</span>
                  </button>
                )}

                {benchmarks.length > 0 && (
                  <button
                    type="button"
                    className={`tab-btn ${activeTab === "benchmarks" ? "active" : ""}`}
                    onClick={() => handleTabClick("benchmarks")}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    Benchmarks
                    <span className="badge">{benchmarks.length}</span>
                  </button>
                )}

                {aplicacoes.length > 0 && (
                  <button
                    type="button"
                    className={`tab-btn ${activeTab === "aplicacoes" ? "active" : ""}`}
                    onClick={() => handleTabClick("aplicacoes")}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                    </svg>
                    Aplicações
                    <span className="badge">{aplicacoes.length}</span>
                  </button>
                )}
              </div>

              <div className="tab-content">
                {activeTab === "conjuntos" && (
                  <div className="conjuntos-content">
                    <div className="section-header">
                      <h2>Peças do Conjunto</h2>
                      <p>Clique em uma peça para ver detalhes</p>
                    </div>

                    {validConjuntos.length === 0 ? (
                      <div className="conjuntos-empty">
                        <EmptyState message="Nenhuma peça vinculada a este produto" actionLabel="—" />
                      </div>
                    ) : (
                      <ConjuntoGallery
                        conjuntos={validConjuntos}
                        onPieceClick={(codigoPiece) => handlePieceClick(codigoPiece, "from-conjunto")}
                        isLoading={isNavigating}
                      />
                    )}
                  </div>
                )}

                {activeTab === "memberships" && memberships.length > 0 && (
                  <div className="conjuntos-content">
                    <div className="section-header">
                      <h2>Usado em Conjuntos</h2>
                      <p>Clique em um conjunto para ver detalhes</p>
                    </div>

                    <ConjuntoGallery
                      conjuntos={enrichedMemberships.map((m) => ({
                        filho: m.codigo_conjunto,
                        filho_des: m.nome_conjunto,
                        qtd_explosao: m.quantidade || 1,
                      }))}
                      onPieceClick={(codigoConj) => handlePieceClick(codigoConj, "from-piece")}
                      isLoading={isNavigating}
                    />
                  </div>
                )}

                {activeTab === "benchmarks" && benchmarks.length > 0 && (
                  <div className="benchmarks-content">
                    <div className="section-header">
                      <h2>Benchmarks do Produto</h2>
                      <p>Números originais e similares correspondentes</p>
                    </div>
                    <div className="benchmarks-table">
                      <div className="table-header">
                        <div className="header-cell">Número Original</div>
                        <div className="header-cell">Origem / Fabricante</div>
                        <div className="header-cell">Tipo</div>
                      </div>
                      {benchmarks.map((b, i) => (
                        <div key={b?.id || `${b?.numero_original || "x"}-${b?.origem || "y"}-${i}`} className="table-row">
                          <div className="table-cell original-number">
                            <strong>{b.numero_original || "—"}</strong>
                          </div>
                          <div className="table-cell">{b.origem || "—"}</div>
                          <div className="table-cell">{b.tipo || "Similar"}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === "aplicacoes" && (
                  <div className="aplicacoes-content">
                    <div className="section-header">
                      <h2>Aplicações do Produto</h2>
                      <p>Veículos e equipamentos onde este produto é utilizado</p>
                    </div>

                    {aplicacoes.length === 0 ? (
                      <div className="aplicacoes-empty">
                        <EmptyState message="Nenhuma aplicação encontrada para este produto" actionLabel="—" />
                      </div>
                    ) : (
                      <div className="aplicacoes-grid">
                        {aplicacoes.map((a, i) => {
                          const veiculo = a.veiculo || a.veiculo_nome || "Veículo não especificado";
                          const fabricante = a.fabricante || a.marca || "Fabricante não especificado";
                          const modelo = a.modelo || a.model || null;
                          const ano = a.ano || a.year || null;
                          const key = a.id || `${veiculo}-${fabricante}-${i}`;

                          return (
                            <div key={key} className="aplicacao-card">
                              <div className="aplicacao-header">
                                <h3>{veiculo}</h3>
                                <span className="aplicacao-type">{a.tipo || "—"}</span>
                              </div>
                              <div className="aplicacao-details">
                                <div className="aplicacao-info">
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M20 7h-9" />
                                    <path d="M14 17H5" />
                                    <circle cx="17" cy="17" r="3" />
                                    <circle cx="7" cy="7" r="3" />
                                  </svg>
                                  <span>{fabricante}</span>
                                </div>

                                {modelo && (
                                  <div className="aplicacao-info">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                      <line x1="3" y1="9" x2="21" y2="9" />
                                      <line x1="9" y1="21" x2="9" y2="9" />
                                    </svg>
                                    <span>Modelo: {modelo}</span>
                                  </div>
                                )}

                                {ano && (
                                  <div className="aplicacao-info">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <circle cx="12" cy="12" r="10" />
                                      <polyline points="12 6 12 12 16 14" />
                                    </svg>
                                    <span>Ano: {ano}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="product-actions-footer">
                <button type="button" className="action-btn secondary" onClick={handleBackClick} disabled={isNavigating}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                  {isNavigating ? "Voltando..." : "Voltar ao Catálogo"}
                </button>

                <div className="action-group">
                  <button type="button" className="action-btn" onClick={handlePrint} disabled={isNavigating}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 6 2 18 2 18 9" />
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                      <rect x="6" y="14" width="12" height="8" />
                    </svg>
                    Imprimir
                  </button>

                  <button type="button" className="action-btn primary" onClick={handleCopyCode} disabled={isNavigating}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Copiar Código
                  </button>
                </div>
              </div>
            </div>
          )}

          {!loading && !error && !product && (
            <div className="product-not-found">
              <EmptyState message="Produto não encontrado" onAction={handleBackClick} actionLabel="Voltar ao Catálogo" />
            </div>
          )}
        </main>
      </ProductTransition>

      {product && (
        <ImageLightbox
          isOpen={lightboxOpen}
          imageSrc={getImageUrl()}
          alt={`${product.codigo} - ${product.descricao}`}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
}

export default ProductDetailsPage;