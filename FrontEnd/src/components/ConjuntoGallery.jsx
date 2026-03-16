import { useMemo, useState, useCallback, useEffect } from "react";
import "../styles/ConjuntoGallery.css";
import { getThumbnailUrl } from "../utils/imageUtils";

function ConjuntoGallery({ conjuntos = [], onPieceClick }) {
  const [imageErrors, setImageErrors] = useState({});

  // ✅ Evita recriar a lista em todo render e diminui renders desnecessários
  const validPieces = useMemo(() => {
    if (!Array.isArray(conjuntos)) return [];
    return conjuntos.filter((p) => p && p.filho && String(p.filho).trim() !== "");
  }, [conjuntos]);

  // ✅ Logs só quando muda a lista (e só em dev) — sem spam infinito
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    console.group && console.group("ConjuntoGallery");
    console.log("ConjuntoGallery: conjuntos (raw from backend):", conjuntos);
    console.log("ConjuntoGallery: validPieces to render (filtered):", validPieces);
    if (Array.isArray(conjuntos)) {
      console.log(`ConjuntoGallery: counts -> raw: ${conjuntos.length}, filtered: ${validPieces.length}`);
    }
    console.groupEnd && console.groupEnd("ConjuntoGallery");
  }, [conjuntos, validPieces]);

  // ✅ Correção principal: não fazer setState repetido pro mesmo código
  const handleImageError = useCallback((codigo) => {
    if (!codigo) return;

    setImageErrors((prev) => {
      // se já está marcado como erro, não atualiza (evita loop)
      if (prev[codigo]) return prev;
      return { ...prev, [codigo]: true };
    });
  }, []);

  const handleClick = useCallback(
    (codigo) => {
      if (!codigo) return;
      if (typeof onPieceClick === "function") onPieceClick(codigo);
    },
    [onPieceClick]
  );

  const handleKeyDown = useCallback(
    (e, codigo) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleClick(codigo);
      }
    },
    [handleClick]
  );

  if (!validPieces || validPieces.length === 0) {
    return null;
  }

  // total de peças considerando qtd_explosao
  const totalPecas = validPieces.reduce((s, it) => s + (Number(it.qtd_explosao) || 1), 0);

  return (
    <section className="conjunto-gallery">
      <div className="conjunto-header">
        <h2>Peças do Conjunto</h2>
        <span className="conjunto-count">{totalPecas} peça(s)</span>
      </div>

      <div className="conjunto-grid">
        {validPieces.map((peca, idx) => {
          const codigo = peca.filho || "";
          const hasError = !!imageErrors[codigo];
          const qtd = peca.qtd_explosao ? Math.round(Number(peca.qtd_explosao)) : 1;

          return (
            <button
              key={codigo ? `${codigo}` : `piece-${idx}`}
              type="button"
              className="conjunto-item"
              onClick={() => handleClick(codigo)}
              onKeyDown={(e) => handleKeyDown(e, codigo)}
            >
              <div className="conjunto-item-image">
                {!hasError ? (
                  <img
                    src={getThumbnailUrl(codigo)}
                    alt={`${codigo} - ${peca.filho_des}`}
                    onError={() => handleImageError(codigo)}
                    loading="lazy"
                  />
                ) : (
                  <div className="conjunto-image-placeholder">
                    <span className="placeholder-icon">📷</span>
                  </div>
                )}
              </div>

              <div className="conjunto-item-info">
                <div className="conjunto-codigo">
                  <strong>{codigo || "N/A"}</strong>
                </div>

                <div className="conjunto-descricao">{peca.filho_des || "Sem descrição"}</div>

                <div className="conjunto-quantidade">
                  <span className="qtd-badge">Qtd: {qtd}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default ConjuntoGallery;