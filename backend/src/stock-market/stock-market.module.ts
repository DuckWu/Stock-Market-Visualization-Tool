import { Module } from '@nestjs/common';
import { StockMarketController } from './stock-market.controller';
import { StockMarketService } from './stock-market.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [HttpModule, ConfigModule],
  controllers: [StockMarketController],
  providers: [StockMarketService],
})
export class StockMarketModule {} 