import { db, riskSettingsTable, dailyPnlTable, auditLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { BinanceSymbolInfo } from "./binance.js";

export interface OrderRequest {
  symbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT";
  quantity: number;
  price?: number;
  source: "manual" | "strategy";
  strategyName?: string;
  mode: "paper" | "testnet" | "live";
}

export interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

export async function validateOrder(
  order: OrderRequest,
  symbolInfo: BinanceSymbolInfo | null,
  availableBalance: number,
  openPositionCount: number,
  currentExposureUsdt: number,
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const [risk] = await db.select().from(riskSettingsTable);
  if (!risk) {
    errors.push("風控設定不存在，請先初始化風控參數");
    return { passed: false, errors, warnings };
  }

  const maxPositionSizePct = Number(risk.maxPositionSizePct);
  const maxDailyLossPct = Number(risk.maxDailyLossPct);
  const maxLeverage = Number(risk.maxLeverage);
  const maxOpenPositions = risk.maxOpenPositions;
  const maxSingleOrderUsdt = Number(risk.maxSingleOrderUsdt);
  const maxTotalExposureUsdt = Number(risk.maxTotalExposureUsdt);
  const maxConsecutiveLosses = risk.maxConsecutiveLosses;
  const allowedSymbols = risk.allowedSymbols as string[];

  if (risk.emergencyStopEnabled) {
    errors.push("緊急停止已啟用，所有交易暫停中");
  }

  const normalizedSymbol = order.symbol.replace("/", "") !== order.symbol
    ? order.symbol
    : order.symbol.replace("USDT", "/USDT");

  if (allowedSymbols.length > 0 && !allowedSymbols.includes(normalizedSymbol) && !allowedSymbols.includes(order.symbol)) {
    errors.push(`交易對 ${order.symbol} 不在白名單中。允許：${allowedSymbols.join(", ")}`);
  }

  if (symbolInfo) {
    for (const filter of symbolInfo.filters) {
      if (filter.filterType === "LOT_SIZE") {
        const minQty = Number(filter.minQty ?? 0);
        const maxQty = Number(filter.maxQty ?? Infinity);
        const stepSize = Number(filter.stepSize ?? 0);

        if (order.quantity < minQty) {
          errors.push(`下單數量 ${order.quantity} 低於最小數量 ${minQty}`);
        }
        if (order.quantity > maxQty) {
          errors.push(`下單數量 ${order.quantity} 超過最大數量 ${maxQty}`);
        }
        if (stepSize > 0) {
          const steps = Math.round(order.quantity / stepSize);
          const rounded = steps * stepSize;
          if (Math.abs(rounded - order.quantity) > 1e-10) {
            warnings.push(`數量精度不符，建議使用 ${rounded.toFixed(8)}`);
          }
        }
      }

      if (filter.filterType === "PRICE_FILTER" && order.price !== undefined) {
        const tickSize = Number(filter.tickSize ?? 0);
        if (tickSize > 0) {
          const steps = Math.round(order.price / tickSize);
          const rounded = steps * tickSize;
          if (Math.abs(rounded - order.price) > 1e-10) {
            warnings.push(`價格精度不符，建議使用 ${rounded.toFixed(8)}`);
          }
        }
      }

      if (filter.filterType === "NOTIONAL" || filter.filterType === "MIN_NOTIONAL") {
        const minNotional = Number(filter.minNotional ?? filter.notional ?? 0);
        const orderValue = order.quantity * (order.price ?? 0);
        if (minNotional > 0 && orderValue < minNotional && order.type === "LIMIT") {
          errors.push(`訂單名義金額 ${orderValue.toFixed(2)} USDT 低於最小要求 ${minNotional} USDT`);
        }
      }
    }
  }

  const estimatedUsdt = order.quantity * (order.price ?? 0);

  if (estimatedUsdt > maxSingleOrderUsdt) {
    errors.push(`單筆下單金額 ${estimatedUsdt.toFixed(2)} USDT 超過上限 ${maxSingleOrderUsdt} USDT`);
  }

  const totalCapital = availableBalance + currentExposureUsdt;
  if (totalCapital > 0) {
    const orderPct = (estimatedUsdt / totalCapital) * 100;
    if (orderPct > maxPositionSizePct) {
      errors.push(`此訂單佔資金 ${orderPct.toFixed(2)}%，超過單筆風險上限 ${maxPositionSizePct}%`);
    }
  }

  if (order.side === "BUY") {
    if (availableBalance < estimatedUsdt) {
      errors.push(`可用餘額 ${availableBalance.toFixed(2)} USDT 不足（需要 ${estimatedUsdt.toFixed(2)} USDT）`);
    }

    if (currentExposureUsdt + estimatedUsdt > maxTotalExposureUsdt) {
      errors.push(`新增後總曝險 ${(currentExposureUsdt + estimatedUsdt).toFixed(2)} USDT 超過上限 ${maxTotalExposureUsdt} USDT`);
    }
  }

  if (openPositionCount >= maxOpenPositions) {
    errors.push(`已達最大持倉數 ${maxOpenPositions}，請先平倉後再開新倉`);
  }

  if (maxLeverage < 1.01) {
    warnings.push("系統設定為無槓桿模式（1x）");
  }

  const today = new Date().toISOString().split("T")[0];
  const [dailyPnl] = await db.select().from(dailyPnlTable).where(eq(dailyPnlTable.date, today));

  if (dailyPnl) {
    const dailyLoss = Number(dailyPnl.realizedPnl);
    if (dailyLoss < 0 && totalCapital > 0) {
      const dailyLossPct = Math.abs(dailyLoss / totalCapital) * 100;
      if (dailyLossPct >= maxDailyLossPct) {
        errors.push(`今日虧損 ${dailyLossPct.toFixed(2)}% 已達每日上限 ${maxDailyLossPct}%，交易暫停`);
      } else if (dailyLossPct >= maxDailyLossPct * 0.8) {
        warnings.push(`今日虧損 ${dailyLossPct.toFixed(2)}% 接近每日上限 ${maxDailyLossPct}%`);
      }
    }

    if (dailyPnl.consecutiveLosses >= maxConsecutiveLosses) {
      errors.push(`連續虧損 ${dailyPnl.consecutiveLosses} 次已達上限 ${maxConsecutiveLosses} 次，請手動重置後繼續`);
    }
  }

  await db.insert(auditLogsTable).values({
    action: "order_validation",
    details: {
      order: { symbol: order.symbol, side: order.side, type: order.type, quantity: order.quantity, price: order.price },
      result: errors.length === 0 ? "passed" : "failed",
      errors,
      warnings,
    },
    mode: order.mode,
    source: order.source,
    result: errors.length === 0 ? "success" : "rejected",
    errorMessage: errors.length > 0 ? errors[0] : undefined,
  });

  return { passed: errors.length === 0, errors, warnings };
}

export async function recordOrderResult(params: {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  fee: number;
  pnl: number;
  mode: string;
  source: string;
  exchangeOrderId?: string;
}): Promise<void> {
  const today = new Date().toISOString().split("T")[0];

  const [existing] = await db.select().from(dailyPnlTable).where(eq(dailyPnlTable.date, today));

  const newPnl = (Number(existing?.realizedPnl ?? 0)) + params.pnl;
  const newTradeCount = (existing?.tradeCount ?? 0) + 1;
  const wasLoss = params.pnl < 0;
  const newConsecutiveLosses = wasLoss
    ? (existing?.consecutiveLosses ?? 0) + 1
    : 0;

  if (existing) {
    await db.update(dailyPnlTable)
      .set({
        realizedPnl: String(newPnl),
        tradeCount: newTradeCount,
        consecutiveLosses: newConsecutiveLosses,
        updatedAt: new Date(),
      })
      .where(eq(dailyPnlTable.date, today));
  } else {
    await db.insert(dailyPnlTable).values({
      date: today,
      realizedPnl: String(params.pnl),
      tradeCount: 1,
      consecutiveLosses: wasLoss ? 1 : 0,
    });
  }

  await db.insert(auditLogsTable).values({
    action: "order_executed",
    details: {
      symbol: params.symbol,
      side: params.side,
      quantity: params.quantity,
      price: params.price,
      fee: params.fee,
      pnl: params.pnl,
      exchangeOrderId: params.exchangeOrderId,
    },
    mode: params.mode,
    source: params.source,
    result: "success",
  });
}
