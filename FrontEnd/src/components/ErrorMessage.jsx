import React from 'react';
import { FiAlertTriangle, FiRefreshCw, FiHome, FiWifiOff } from 'react-icons/fi';

function ErrorMessage({
  error,
  onRetry,
  onGoHome,
  variant = "default",
  title,
  className = ""
}) {
  const getErrorIcon = () => {
    if (error?.includes('rede') || error?.includes('conexão') || error?.includes('network')) {
      return <FiWifiOff className="error-icon" />;
    }
    return <FiAlertTriangle className="error-icon" />;
  };

  const parseStatus = () => {
    const match = error && error.match(/(\d{3})/);
    return match ? parseInt(match[1], 10) : null;
  };

  const getErrorTitle = () => {
    if (title) return title;
    const status = parseStatus();
    if (status) {
      if (status >= 500) return "Erro do Servidor";
      if (status === 404) return "Conteúdo Não Encontrado";
      if (status === 401) return "Não Autorizado";
      if (status === 403) return "Acesso Proibido";
      if (status === 400) return "Requisição Inválida";
    }

    if (error?.includes('rede') || error?.includes('conexão') || error?.includes('network')) {
      return "Problema de Conexão";
    }
    return "Ops! Algo deu errado";
  };

  const getErrorMessage = () => {
    const status = parseStatus();
    if (status) {
      if (status >= 500) return "O servidor está temporariamente indisponível. Tente novamente em alguns minutos.";
      if (status === 404) return "O conteúdo que você está procurando não foi encontrado.";
      if (status === 401) return "Você não tem permissão para acessar este recurso.";
      if (status === 403) return "Acesso negado a este recurso.";
      if (status === 400) return "Dados inválidos enviados. Verifique e tente novamente.";
    }

    if (error?.includes('rede') || error?.includes('conexão') || error?.includes('network')) {
      return "Verifique sua conexão com a internet e tente novamente.";
    }
    return error || "Ocorreu um erro inesperado. Tente novamente.";
  };

  if (variant === "inline") {
    return (
      <div className={`error-inline ${className}`}>
        <FiAlertTriangle className="error-inline-icon" />
        <span className="error-inline-text">{error}</span>
      </div>
    );
  }

  if (variant === "banner") {
    return (
      <div className={`error-banner ${className}`}>
        <div className="error-banner-content">
          {getErrorIcon()}
          <div className="error-banner-text">
            <h4 className="error-banner-title">{getErrorTitle()}</h4>
            <p className="error-banner-message">{getErrorMessage()}</p>
          </div>
        </div>
        <div className="error-banner-actions">
          {onRetry && (
            <button onClick={onRetry} className="error-banner-btn retry">
              <FiRefreshCw className="error-btn-icon" />
              Tentar Novamente
            </button>
          )}
          {onGoHome && (
            <button onClick={onGoHome} className="error-banner-btn home">
              <FiHome className="error-btn-icon" />
              Ir para Início
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`error-state ${className}`}>
      <div className="error-content">
        {getErrorIcon()}
        <h3 className="error-title">{getErrorTitle()}</h3>
        <p className="error-message">{getErrorMessage()}</p>
        <div className="error-actions">
          {onRetry && (
            <button onClick={onRetry} className="error-btn retry">
              <FiRefreshCw className="error-btn-icon" />
              Tentar Novamente
            </button>
          )}
          {onGoHome && (
            <button onClick={onGoHome} className="error-btn home">
              <FiHome className="error-btn-icon" />
              Ir para Início
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ErrorMessage;
