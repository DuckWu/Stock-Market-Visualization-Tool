import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { StockMarketModule } from './stock-market/stock-market.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    StockMarketModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
