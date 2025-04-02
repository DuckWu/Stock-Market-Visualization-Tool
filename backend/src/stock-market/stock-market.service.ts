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
    this.modelPath = this.configService.get<string>('TINYLLAMA_MODEL_PATH', '/home/ec2-user/llama.cpp/build/bin/tinyllama.gguf');
    this.llamaCliPath = this.configService.get<string>('LLAMA_CLI_PATH', '/home/ec2-user/llama.cpp/build/bin/llama-cli');
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
      const prompt = `You are a financial assistant who writes concise and insightful stock analyses.

Analyze stock ${data.symbol}:
Price: $${data.price.toFixed(2)}
Change: ${data.change > 0 ? '+' : ''}${data.change.toFixed(2)}%
Volume: ${data.volume.toLocaleString()}
P/E Ratio: ${quote.trailingPE?.toFixed(2) || 'N/A'}
${currentPrice.toFixed(2)} is ${movingAvgComparison} 10-day average of ${movingAvg.toFixed(2)}
Volatility: ${(volatility * 100).toFixed(1)}%

Give a short sentiment, summary, key points, technical analysis and risk factors.`;

      try {
        // Ensure the command is properly escaped with double backslashes for percent signs in Windows
        const escapedPrompt = JSON.stringify(prompt).replace(/%/g, '%%');
        
        // Prepare the command with absolute paths (no --system parameter)
        const command = `${this.llamaCliPath} --model ${this.modelPath} --prompt ${escapedPrompt} --no-warmup --threads 1 --ctx-size 512`;
        
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

        // Clean the response by removing the prompt
        const cleanedResponse = stdout
          .replace(prompt, '')  // Remove the input prompt
          .trim();
        
        this.logger.debug(`Raw LLM response (first 100 chars): ${cleanedResponse.substring(0, 100)}...`);
        
        // Extract first 1-2 sentences for summary (up to 150 chars)
        const sentenceEndRegex = /[.!?]\s+/g;
        const sentences = cleanedResponse.split(sentenceEndRegex);
        let summary = sentences[0] || '';
        if (sentences.length > 1 && summary.length < 100) {
          summary += '. ' + sentences[1];
        }
        summary = summary.substring(0, 150);
        
        // Try to determine sentiment from keywords
        let sentiment = 'neutral';
        const lowerText = cleanedResponse.toLowerCase();
        
        const positiveTerms = ['positive', 'bullish', 'uptrend', 'growth', 'increase', 'buy', 'strong', 'opportunity'];
        const negativeTerms = ['negative', 'bearish', 'downtrend', 'decline', 'decrease', 'sell', 'weak', 'risk', 'caution'];
        
        let positiveCount = 0;
        let negativeCount = 0;
        
        positiveTerms.forEach(term => {
          const matches = lowerText.match(new RegExp(term, 'g'));
          if (matches) positiveCount += matches.length;
        });
        
        negativeTerms.forEach(term => {
          const matches = lowerText.match(new RegExp(term, 'g'));
          if (matches) negativeCount += matches.length;
        });
        
        if (positiveCount > negativeCount + 1) {
          sentiment = 'positive';
        } else if (negativeCount > positiveCount + 1) {
          sentiment = 'negative';
        }
        
        // Extract some bullet points from the text
        const keyPoints: string[] = [];
        const paragraphs = cleanedResponse.split('\n').filter(p => p.trim().length > 20);
        
        // Take up to 3 paragraphs and use them as key points
        for (let i = 0; i < Math.min(3, paragraphs.length); i++) {
          const paragraph = paragraphs[i].trim();
          if (paragraph && paragraph !== summary) {
            // Truncate long paragraphs
            keyPoints.push(paragraph.length > 100 ? paragraph.substring(0, 100) + '...' : paragraph);
          }
        }
        
        // If we couldn't extract key points, create some generic ones
        if (keyPoints.length === 0) {
          keyPoints.push('See full analysis in the raw response below');
        }
        
        // Return the analysis with the raw response
        return {
          sentiment,
          summary,
          keyPoints,
          technicalAnalysis: 'Full technical analysis available in the raw AI response below.',
          riskFactors: ['For complete risk assessment, please refer to the raw AI response.'],
          llmStatus: 'text_only',
          metrics,
          rawLlmResponse: cleanedResponse.substring(0, 2000) // Increased character limit
        };
        
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