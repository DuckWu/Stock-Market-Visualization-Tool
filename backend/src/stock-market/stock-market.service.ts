import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import yahooFinance from 'yahoo-finance2';
import { promisify } from 'util';
import { exec } from 'child_process';
import * as path from 'path';

const execAsync = promisify(exec);

export interface StockAnalysisData {
  sentiment: string;
  summary: string;
  keyPoints: string[];
  technicalAnalysis: string;
  riskFactors: string[];
  metrics: {
    priceToBookRatio?: number;
    priceToEarningsRatio?: number;
    movingAverageComparison?: string;
    volatility?: number;
  };
}

@Injectable()
export class StockMarketService {
  private readonly logger = new Logger(StockMarketService.name);
  private readonly modelPath: string;
  private readonly llamaCliPath: string;

  constructor(
    private readonly configService: ConfigService,
  ) {
    // Get paths from config or use defaults
    this.modelPath = this.configService.get<string>('TINYLLAMA_MODEL_PATH', './models/tinyllama.gguf');
    this.llamaCliPath = this.configService.get<string>('LLAMA_CLI_PATH', './build/bin/llama-cli');
    
    // Log configuration on startup
    this.logger.log(`Using TinyLlama model at: ${this.modelPath}`);
    this.logger.log(`Using llama-cli at: ${this.llamaCliPath}`);
  }

  async getDailyStockData(symbol: string) {
    try {
      // Default to uppercase symbol for consistency
      symbol = symbol.toUpperCase();
      console.log(`Fetching Yahoo Finance daily data for symbol: ${symbol}`);
      
      // Get 1 year of historical data
      const result = await yahooFinance.historical(symbol, {
        period1: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year ago
        period2: new Date(), // today
        interval: '1d',
      });
      
      if (!result || result.length === 0) {
        console.log(`No data returned from Yahoo Finance for ${symbol}`);
        throw new Error(`No data available for ${symbol}`);
      }
      
      console.log(`Successfully fetched ${result.length} data points for ${symbol}`);
      
      // Transform data to match your existing format
      return result.map(item => ({
        timestamp: item.date.toISOString().split('T')[0],
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        volume: item.volume,
      }))
      // Sort by timestamp in descending order (newest first)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error) {
      console.error(`Error fetching data for ${symbol}:`, error.message);
      
      // Return empty array instead of throwing to match previous behavior
      // This allows frontend to fall back to mock data
      return [];
    }
  }

  async getIntradayStockData(symbol: string) {
    try {
      // Default to uppercase symbol for consistency
      symbol = symbol.toUpperCase();
      console.log(`Fetching Yahoo Finance intraday data for symbol: ${symbol}`);
      
      // Get 5 days of daily data
      const result = await yahooFinance.historical(symbol, {
        period1: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        period2: new Date(), // today
        interval: '1d', // Using daily data since intraday is not supported
      });
      
      if (!result || result.length === 0) {
        console.log(`No intraday data returned from Yahoo Finance for ${symbol}`);
        throw new Error(`No intraday data available for ${symbol}`);
      }
      
      console.log(`Successfully fetched ${result.length} intraday data points for ${symbol}`);
      
      // Transform data to match your existing format
      return result.map(item => ({
        timestamp: item.date.toISOString(),
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        volume: item.volume,
      }))
      // Sort by timestamp in descending order (newest first)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error) {
      console.error(`Error fetching intraday data for ${symbol}:`, error.message);
      
      // Return empty array instead of throwing to match previous behavior
      // This allows frontend to fall back to mock data
      return [];
    }
  }

  async analyzeStock(data: { symbol: string; price: number; change: number; volume: number }): Promise<StockAnalysisData> {
    try {
      // Fetch additional stock data for analysis
      const quote = await yahooFinance.quote(data.symbol);
      
      // Fetch some historical data for basic calculations
      const historicalData = await yahooFinance.historical(data.symbol, {
        period1: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        interval: '1d'
      });
      
      // Perform simple calculations locally
      const prices = historicalData.map(d => d.close);
      const volatility = this.calculateVolatility(prices);
      const movingAvg = this.calculateSMA(prices, 10);
      const currentPrice = data.price;
      const movingAvgComparison = currentPrice > movingAvg ? "above" : "below";
      
      // Create a simpler prompt for TinyLlama
      const prompt = `Analyze stock ${data.symbol}:
Price: $${data.price.toFixed(2)}
Change: ${data.change.toFixed(2)}%
Volume: ${data.volume.toLocaleString()}
P/E: ${quote.trailingPE?.toFixed(2) || 'N/A'}
${currentPrice.toFixed(2)} is ${movingAvgComparison} 10-day average of ${movingAvg.toFixed(2)}
Volatility: ${(volatility * 100).toFixed(1)}%

Respond with JSON: {sentiment, summary, keyPoints:[], technicalAnalysis, riskFactors:[]}`;

      try {
        // Ensure the command is properly escaped
        const escapedPrompt = JSON.stringify(prompt);
        
        // Prepare the command with absolute paths
        const command = `${this.llamaCliPath} --model ${this.modelPath} --prompt ${escapedPrompt} --no-warmup --threads 1 --ctx-size 512`;
        
        this.logger.debug(`Executing command: ${command}`);
        const { stdout } = await execAsync(command);

        // Try to extract JSON from the response
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON found in TinyLlama response');
        }
        
        let analysis = JSON.parse(jsonMatch[0]);
        
        // Ensure all expected fields exist
        analysis = {
          sentiment: analysis.sentiment || 'neutral',
          summary: analysis.summary || 'No summary provided',
          keyPoints: Array.isArray(analysis.keyPoints) ? analysis.keyPoints : ['No key points provided'],
          technicalAnalysis: analysis.technicalAnalysis || 'No technical analysis provided',
          riskFactors: Array.isArray(analysis.riskFactors) ? analysis.riskFactors : ['No risk factors provided'],
          // Add our locally calculated metrics
          metrics: {
            priceToEarningsRatio: quote.trailingPE,
            priceToBookRatio: quote.priceToBook,
            movingAverageComparison: `${currentPrice.toFixed(2)} is ${movingAvgComparison} 10-day MA (${movingAvg.toFixed(2)})`,
            volatility: volatility
          }
        };
        
        return analysis;
      } catch (modelError) {
        this.logger.error(`TinyLlama model error: ${modelError.message}`);
        // Don't throw here - fall back to our own analysis below
        throw new Error('Failed to get analysis from local model');
      }
    } catch (error) {
      this.logger.error(`Error analyzing stock ${data.symbol}: ${error.message}`);
      
      // Return a basic analysis using whatever data we have
      try {
        const quote = await yahooFinance.quote(data.symbol).catch(() => null);
        
        // Generate sentiment based on price change
        let sentiment = 'neutral';
        if (data.change > 1) sentiment = 'positive';
        if (data.change < -1) sentiment = 'negative';
        
        return {
          sentiment,
          summary: `${data.symbol} is currently trading at $${data.price.toFixed(2)} with ${data.change > 0 ? 'a gain' : 'a loss'} of ${Math.abs(data.change).toFixed(2)}%.`,
          keyPoints: [
            `Current trading volume is ${data.volume.toLocaleString()}`,
            quote?.marketCap ? `Market cap is $${(quote.marketCap / 1e9).toFixed(2)} billion` : 'Market cap data unavailable'
          ],
          technicalAnalysis: `Basic analysis based on recent price movement of ${data.change.toFixed(2)}%.`,
          riskFactors: [
            'Market volatility may affect stock performance',
            'Past performance does not guarantee future results'
          ],
          metrics: {
            priceToEarningsRatio: quote?.trailingPE,
            priceToBookRatio: quote?.priceToBook,
            movingAverageComparison: undefined,
            volatility: undefined
          }
        };
      } catch (fallbackError) {
        // Absolute last resort
        return {
          sentiment: 'neutral',
          summary: 'Analysis currently unavailable',
          keyPoints: ['Service temporarily unavailable'],
          technicalAnalysis: 'Technical analysis unavailable',
          riskFactors: ['Analysis currently unavailable'],
          metrics: {}
        };
      }
    }
  }

  // Utility functions for local calculations
  private calculateSMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1] || 0;
    const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
    return sum / period;
  }
  
  private calculateVolatility(prices: number[]): number {
    if (prices.length < 2) return 0;
    
    // Calculate daily returns
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i-1]) / prices[i-1]);
    }
    
    // Calculate standard deviation of returns
    const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
    const squaredDiffs = returns.map(r => Math.pow(r - avg, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length;
    
    return Math.sqrt(variance);
  }
} 