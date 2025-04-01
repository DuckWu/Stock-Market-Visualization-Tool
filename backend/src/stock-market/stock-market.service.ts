import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import yahooFinance from 'yahoo-finance2';
import { InferenceClient } from "@huggingface/inference";

export interface StockAnalysisData {
  sentiment: string;
  summary: string;
  keyPoints: string[];
  technicalAnalysis: string;
  riskFactors: string[];
}

@Injectable()
export class StockMarketService {
  private readonly logger = new Logger(StockMarketService.name);
  private readonly client = new InferenceClient(process.env.QWEN_API_KEY);

  constructor(
    private readonly configService: ConfigService,
  ) {}

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
      const historicalData = await yahooFinance.historical(data.symbol, {
        period1: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        interval: '1d'
      });

      // Calculate technical indicators
      const prices = historicalData.map(d => d.close);
      const sma20 = this.calculateSMA(prices, 20);
      const sma50 = this.calculateSMA(prices, 50);
      const rsi = this.calculateRSI(prices);
      const currentPrice = prices[prices.length - 1];

      // Prepare the prompt for Hugging Face
      const prompt = `You are a stock analysis AI. Analyze the stock ${data.symbol} with the following data:
Current Price: $${data.price}
Price Change: ${data.change}%
Volume: ${data.volume}
Market Cap: $${(quote.marketCap || 0 / 1e9).toFixed(2)}B
P/E Ratio: ${quote.trailingPE?.toFixed(2) || 'N/A'}
52 Week High: $${quote.fiftyTwoWeekHigh?.toFixed(2) || 'N/A'}
52 Week Low: $${quote.fiftyTwoWeekLow?.toFixed(2) || 'N/A'}

Technical Indicators:
20-day SMA: $${sma20.toFixed(2)}
50-day SMA: $${sma50.toFixed(2)}
RSI: ${rsi.toFixed(2)}
Current Price vs 20-day SMA: ${((currentPrice - sma20) / sma20 * 100).toFixed(2)}%

IMPORTANT: You must respond with ONLY a valid JSON object, no other text. The JSON must have this exact structure:
{
  "sentiment": "positive/negative/neutral",
  "summary": "brief summary",
  "keyPoints": ["point 1", "point 2", "point 3"],
  "technicalAnalysis": "technical analysis text",
  "riskFactors": ["risk 1", "risk 2", "risk 3"]
}`;

      // Call Hugging Face API
      const chatCompletion = await this.client.chatCompletion({
        provider: "hf-inference",
        model: "Qwen/QwQ-32B",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1000,
      });

      // Parse the response
      const content = chatCompletion.choices[0].message.content;
      if (!content) {
        throw new Error('No content in response');
      }
      
      try {
        // Try to find JSON in the response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON found in response');
        }
        const analysis = JSON.parse(jsonMatch[0]);
        return analysis;
      } catch (parseError) {
        this.logger.error(`Failed to parse JSON response: ${content}`);
        throw new Error('Invalid JSON response from AI model');
      }
    } catch (error) {
      this.logger.error(`Error analyzing stock ${data.symbol}:`, error);
      // Return a default analysis in case of error
      return {
        sentiment: 'neutral',
        summary: 'Unable to analyze stock at this time.',
        keyPoints: ['Analysis temporarily unavailable'],
        technicalAnalysis: 'Technical analysis is currently unavailable.',
        riskFactors: ['Unable to assess risks at this time']
      };
    }
  }

  private calculateSMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1];
    const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
    return sum / period;
  }

  private calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) return 50; // Default to neutral if not enough data

    const changes = prices.slice(1).map((price, i) => price - prices[i]);
    const gains = changes.map(change => change > 0 ? change : 0);
    const losses = changes.map(change => change < 0 ? -change : 0);

    const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }
} 