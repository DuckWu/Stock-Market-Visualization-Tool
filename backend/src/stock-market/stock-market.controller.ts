import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { StockMarketService, StockAnalysisData } from './stock-market.service';

@Controller('stock-market')
export class StockMarketController {
  constructor(private readonly stockMarketService: StockMarketService) {}

  @Get('daily')
  async getDailyStockData(@Query('symbol') symbol: string) {
    return this.stockMarketService.getDailyStockData(symbol);
  }

  @Get('intraday')
  async getIntradayStockData(@Query('symbol') symbol: string) {
    return this.stockMarketService.getIntradayStockData(symbol);
  }

  @Post('analyze')
  async analyzeStock(@Body() data: { symbol: string; price: number; change: number; volume: number }): Promise<StockAnalysisData> {
    return this.stockMarketService.analyzeStock(data);
  }
} 