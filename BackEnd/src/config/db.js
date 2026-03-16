import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const requiredEnvVars = ["DB_HOST", "DB_USER", "DB_PASS", "DB_NAME"];

requiredEnvVars.forEach((envVar) => {
  if (!process.env[envVar]) {
    throw new Error(`Variável de ambiente obrigatória não encontrada: ${envVar}`);
  }
});

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || "3306", 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,

  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || "10", 10),
  queueLimit: 0,

  connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT || "10000", 10),
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,

  decimalNumbers: true,
  multipleStatements: false,
  supportBigNumbers: true,
  bigNumberStrings: false,
  charset: "utf8mb4",
  timezone: process.env.DB_TIMEZONE || "+00:00",
});

function isRetryableDbError(error) {
  return [
    "ECONNRESET",
    "ECONNREFUSED",
    "ENOTFOUND",
    "ETIMEDOUT",
    "EHOSTUNREACH",
    "EPIPE",
    "PROTOCOL_CONNECTION_LOST",
    "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR",
    "PROTOCOL_ENQUEUE_AFTER_DESTROY",
    "PROTOCOL_SEQUENCE_TIMEOUT",
  ].includes(error?.code);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executa query com retry para erros transitórios de conexão
 * Usa execute() para placeholders seguros
 */
export async function query(sql, params = [], retryCount = 2) {
  if (!sql || typeof sql !== "string") {
    throw new Error("SQL deve ser uma string não-vazia");
  }

  let attempt = 0;
  let lastError;

  while (attempt <= retryCount) {
    try {
      const start = Date.now();

      if (process.env.SQL_DEBUG === "true") {
        console.debug(
          `SQL START (${new Date().toISOString()}): ${sql.substring(0, 200)} params=${params.length}`
        );
      }

      const [rows] = await pool.execute(sql, params);

      const duration = Date.now() - start;
      if (process.env.SQL_DEBUG === "true") {
        console.debug(
          `SQL OK (${duration}ms): returned ${Array.isArray(rows) ? rows.length : "n/a"} rows`
        );
      }

      return rows;
    } catch (error) {
      lastError = error;

      if (isRetryableDbError(error) && attempt < retryCount) {
        const delay = Math.pow(2, attempt) * 500; // 500ms, 1000ms...
        console.warn(
          `Erro transitório no BD (${error.code}). Retry ${attempt + 1}/${retryCount} em ${delay}ms...`
        );
        await sleep(delay);
        attempt += 1;
        continue;
      }

      console.error("Erro na query:", {
        sql: sql.substring(0, 100),
        params: params.length,
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString(),
      });

      throw error;
    }
  }

  throw lastError;
}

/**
 * Inicia transação com liberação segura da conexão
 */
export async function beginTransaction() {
  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    return {
      query: async (sql, params = []) => {
        if (!sql || typeof sql !== "string") {
          throw new Error("SQL deve ser uma string não-vazia");
        }

        const [rows] = await connection.execute(sql, params);
        return rows;
      },
      commit: async () => {
        try {
          await connection.commit();
        } finally {
          connection.release();
        }
      },
      rollback: async () => {
        try {
          await connection.rollback();
        } finally {
          connection.release();
        }
      },
    };
  } catch (error) {
    if (connection) {
      try {
        connection.release();
      } catch {
        // ignore
      }
    }
    throw error;
  }
}

/**
 * Ping simples no banco
 */
export async function testConnection() {
  let connection;

  try {
    connection = await pool.getConnection();
    await connection.ping();
    console.log("Conexão com banco validada com sucesso");
    return true;
  } catch (error) {
    console.error("Erro ao testar conexão com banco:", {
      error: error.message,
      code: error.code,
      timestamp: new Date().toISOString(),
    });
    throw error;
  } finally {
    if (connection) {
      try {
        connection.release();
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Status do pool
 */
export function getPoolStatus() {
  const internalPool = pool.pool || pool;

  return {
    activeConnections: internalPool?._allConnections?.length || 0,
    idleConnections: internalPool?._freeConnections?.length || 0,
    waitingQueue: internalPool?._connectionQueue?.length || 0,
  };
}

/**
 * Graceful shutdown
 */
export async function closePool() {
  try {
    await pool.end();
    console.log("Pool de conexões encerrado com sucesso");
  } catch (error) {
    console.error("Erro ao encerrar pool:", error.message);
    throw error;
  }
}

export { pool };
export default pool;