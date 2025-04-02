import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import yahooFinance from 'yahoo-finance2';
import { promisify } from 'util';
import { exec, ChildProcess } from 'child_process';
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
  llmStatus?: 'online' | 'offline' | 'processing' | 'error' | 'text_only';
  rawLlmResponse: string;
}

@Injectable()
export class StockMarketService {
  private readonly logger = new Logger(StockMarketService.name);
  private readonly modelPath: string;
  private readonly llamaCliPath: string;
  private readonly modelTimeout: number;

  constructor(
    private readonly configService: ConfigService,
  ) {
    // Get paths from config or use defaults
    this.modelPath = this.configService.get<string>('TINYLLAMA_MODEL_PATH', './models/tinyllama.gguf');
    this.llamaCliPath = this.configService.get<string>('LLAMA_CLI_PATH', './build/bin/llama-cli');
    this.modelTimeout = parseInt(this.configService.get<string>('LLM_TIMEOUT_SECONDS', '120')) * 1000;
    
    // Log configuration on startup
    this.logger.log(`Using TinyLlama model at: ${this.modelPath}`);
    this.logger.log(`Using llama-cli at: ${this.llamaCliPath}`);
    this.logger.log(`LLM timeout set to: ${this.modelTimeout / 1000} seconds`);
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
      
      // Calculate these metrics regardless of LLM response
      const metrics = {
        priceToEarningsRatio: quote.trailingPE,
        priceToBookRatio: quote.priceToBook,
        movingAverageComparison: `${currentPrice.toFixed(2)} is ${movingAvgComparison} 10-day MA (${movingAvg.toFixed(2)})`,
        volatility: volatility
      };
      
      // Create a prompt optimized for llama-cli
      const systemMessage = "You are an expert financial analyst with 15+ years of Wall Street experience. Your analysis is always balanced, insightful and professional. Focus on key trends and important metrics that would help investors make informed decisions. Provide concise analysis in clear language without jargon.";
      
      const prompt = `Analyze ${data.symbol} (Price: $${data.price.toFixed(2)}, Change: ${data.change > 0 ? '+' : ''}${data.change.toFixed(2)}%, Volume: ${data.volume.toLocaleString()}, P/E: ${quote.trailingPE?.toFixed(2) || 'N/A'}, ${currentPrice.toFixed(2)} is ${movingAvgComparison} 10-day MA of ${movingAvg.toFixed(2)}, Volatility: ${(volatility * 100).toFixed(1)}%). What is your professional assessment? /`;

      try {
        // Ensure the command is properly escaped
        const escapedPrompt = JSON.stringify(prompt);
        const escapedSystemMessage = JSON.stringify(systemMessage);
        
        // Prepare the command with absolute paths, adding system message as parameter
        const command = `${this.llamaCliPath} --model ${this.modelPath} --prompt ${escapedPrompt} --system ${escapedSystemMessage} --no-warmup --threads 1 --ctx-size 512`;
        
        this.logger.debug(`Executing command: ${command}`);
        
        // Create a promise that will reject after timeout
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('LLM processing timeout')), this.modelTimeout);
        });
        
        // Create a promise for the execution
        const executionPromise = execAsync(command);
        
        // Race the execution against the timeout
        const { stdout } = await Promise.race([executionPromise, timeoutPromise])
          .catch(error => {
            if (error.message === 'LLM processing timeout') {
              this.logger.warn(`TinyLlama timeout after ${this.modelTimeout / 1000} seconds for symbol ${data.symbol}`);
              return { stdout: '', stderr: 'Timeout exceeded' };
            }
            throw error;
          }) as { stdout: string, stderr: string };
        
        // If we got an empty response due to timeout
        if (!stdout) {
          return {
            sentiment: 'neutral',
            summary: 'AI model still processing',
            keyPoints: ['The TinyLlama model is taking longer than expected to generate analysis'],
            technicalAnalysis: 'Analysis is still being generated. The model is running but hasn\'t completed yet.',
            riskFactors: ['Analysis is incomplete due to processing time limits'],
            llmStatus: 'processing',
            metrics,
            rawLlmResponse: ''
          };
        }

        // Try to extract JSON from the response first
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        let analysis: Partial<StockAnalysisData>;
        
        if (jsonMatch) {
          try {
            // If we found JSON, try to parse it
            const parsedJson = JSON.parse(jsonMatch[0]);
            analysis = {
              sentiment: parsedJson.sentiment || 'neutral',
              summary: parsedJson.summary || 'No summary provided',
              keyPoints: Array.isArray(parsedJson.keyPoints) ? parsedJson.keyPoints : ['No key points provided'],
              technicalAnalysis: parsedJson.technicalAnalysis || 'No technical analysis provided',
              riskFactors: Array.isArray(parsedJson.riskFactors) ? parsedJson.riskFactors : ['No risk factors provided'],
            };
          } catch (jsonError) {
            // JSON parsing failed, fall back to text analysis
            this.logger.warn(`Failed to parse JSON from LLM response: ${jsonError.message}`);
            throw new Error('JSON parsing failed');
          }
        } else {
          // No JSON found, use the text response as-is
          throw new Error('No JSON found in response');
        }
        
        // Clean up the raw response for safe display
        const cleanedResponse = stdout
          .replace(prompt, '')  // Remove the prompt
          .trim()
          .substring(0, 1500);  // Limit length to avoid overwhelming the UI
        
        // Return the complete analysis
        return {
          ...analysis,
          metrics,
          llmStatus: 'online',
          rawLlmResponse: cleanedResponse
        } as StockAnalysisData;
        
      } catch (modelError) {
        this.logger.error(`TinyLlama model error or parsing issue: ${modelError.message}`);

        // If we have output but couldn't parse it as JSON, return it as raw text
        let rawResponse = '';
        if (modelError.stdout) {
          rawResponse = modelError.stdout
            .replace(prompt, '')
            .trim()
            .substring(0, 1500);
        }
        
        // Return a response that includes the raw text from LLM
        return {
          sentiment: 'neutral',
          summary: 'Could not parse structured analysis',
          keyPoints: ['The model response could not be parsed as JSON'],
          technicalAnalysis: 'The raw LLM response is shown below',
          riskFactors: ['Analysis format error'],
          llmStatus: 'text_only',
          metrics,
          rawLlmResponse: rawResponse || 'No response text available'
        };
      }
    } catch (error) {
      this.logger.error(`Error analyzing stock ${data.symbol}: ${error.message}`);
      
      // Return a clear message that LLM service is having issues
      return {
        sentiment: 'neutral',
        summary: 'AI analysis service error',
        keyPoints: [
          'The stock analysis service encountered an error',
          `Error details: ${error.message.substring(0, 100)}`
        ],
        technicalAnalysis: 'Unable to generate analysis due to a service error. Our AI model could not process this request.',
        riskFactors: ['Analysis service is currently experiencing issues'],
        llmStatus: 'error',
        metrics: {
          priceToEarningsRatio: undefined,
          priceToBookRatio: undefined,
          movingAverageComparison: undefined,
          volatility: undefined
        },
        rawLlmResponse: ''
      };
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