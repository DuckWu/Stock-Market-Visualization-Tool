import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import yahooFinance from 'yahoo-finance2';
import { promisify } from 'util';
import { exec } from 'child_process';
import * as path from 'path';
import axios from 'axios';

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
  private readonly chatApiUrl: string;

  constructor(
    private readonly configService: ConfigService,
  ) {
    // Get paths from config or use defaults
    this.modelPath = this.configService.get<string>('TINYLLAMA_MODEL_PATH', '/home/ec2-user/llama.cpp/build/bin/tinyllama.gguf');
    this.llamaCliPath = this.configService.get<string>('LLAMA_CLI_PATH', '/home/ec2-user/llama.cpp/build/bin/llama-cli');
    this.modelTimeout = parseInt(this.configService.get<string>('LLM_TIMEOUT_SECONDS', '120')) * 1000;
    this.chatApiUrl = this.configService.get<string>('CHAT_API_URL', 'http://3.148.170.36:8080/v1/chat/completions');
    
    // Log configuration on startup
    this.logger.log(`Using chat API at: ${this.chatApiUrl}`);
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
      
      // Ensure we have valid price data
      const currentPrice = (data.price && data.price > 0) ? data.price : (quote.regularMarketPrice || 0);
      
      // Log raw values for debugging
      this.logger.debug(`Yahoo Finance data for ${data.symbol}:`, JSON.stringify({
        regularMarketPrice: quote.regularMarketPrice,
        regularMarketChangePercent: quote.regularMarketChangePercent,
        regularMarketChange: quote.regularMarketChange,
        regularMarketVolume: quote.regularMarketVolume
      }));
      
      // Handle price change - make sure we have a valid percentage value
      let priceChange = 0;
      if (data.change !== undefined && !isNaN(data.change) && data.change !== 0) {
        priceChange = data.change;
      } else if (quote.regularMarketChangePercent !== undefined) {
        // Yahoo Finance returns this as a decimal (e.g., 0.0234 for 2.34%)
        priceChange = quote.regularMarketChangePercent;
      }
      
      const tradeVolume = (data.volume && data.volume > 0) ? data.volume : (quote.regularMarketVolume || 0);
      
      // Log the final values we're using
      this.logger.debug(`Final values for ${data.symbol} analysis: price=${currentPrice}, change=${priceChange}, volume=${tradeVolume}`);
      
      // Fetch some historical data for basic calculations
      const historicalData = await yahooFinance.historical(data.symbol, {
        period1: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        interval: '1d'
      });
      
      // Perform simple calculations locally
      const prices = historicalData.map(d => d.close);
      const volatility = this.calculateVolatility(prices);
      const movingAvg = this.calculateSMA(prices, 10);
      const movingAvgComparison = currentPrice > movingAvg ? "above" : "below";
      
      // Calculate these metrics regardless of LLM response
      const metrics = {
        priceToEarningsRatio: quote.trailingPE,
        priceToBookRatio: quote.priceToBook,
        movingAverageComparison: `${currentPrice.toFixed(2)} is ${movingAvgComparison} 10-day MA (${movingAvg.toFixed(2)})`,
        volatility: volatility
      };
      
      // Format the price change for display with proper sign and percentage
      const changeSign = priceChange >= 0 ? '+' : '';
      const changeFormatted = `${changeSign}${priceChange.toFixed(2)}%`;
      
      // Create system and user messages for the chat API
      const systemMessage = "You are a helpful financial assistant.";
      const userMessage = `Summarize ${data.symbol} stock today:
Price: $${currentPrice.toFixed(2)}
Change: ${changeFormatted}
Volume: ${tradeVolume.toLocaleString()}
P/E Ratio: ${quote.trailingPE?.toFixed(2) || 'N/A'}
${currentPrice.toFixed(2)} is ${movingAvgComparison} 10-day average of ${movingAvg.toFixed(2)}
Volatility: ${(volatility * 100).toFixed(1)}%

Give a short sentiment (positive/negative/neutral), summary, key points, technical analysis and risk factors.`;

      try {
        this.logger.debug(`Calling chat API for symbol ${data.symbol}`);
        
        // Create request payload for the chat API
        const payload = {
          messages: [
            { role: "system", content: systemMessage },
            { role: "user", content: userMessage }
          ],
          max_tokens: 500
        };
        
        // Set timeout for the API call
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.modelTimeout);
        
        // Call the chat API
        const response = await axios.post(
          this.chatApiUrl,
          payload,
          { 
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            timeout: this.modelTimeout
          }
        );
        
        // Clear the timeout
        clearTimeout(timeoutId);
        
        // Process API response
        if (response.data && response.data.choices && response.data.choices.length > 0) {
          const content = response.data.choices[0].message.content;
          
          this.logger.debug(`Received API response for ${data.symbol}, length: ${content.length} chars`);
          
          // Extract first 1-2 sentences for summary (up to 150 chars)
          const sentenceEndRegex = /[.!?]\s+/g;
          const sentences = content.split(sentenceEndRegex);
          let summary = sentences[0] || '';
          if (sentences.length > 1 && summary.length < 100) {
            summary += '. ' + sentences[1];
          }
          summary = summary.substring(0, 150);
          
          // Try to determine sentiment from keywords
          let sentiment = 'neutral';
          const lowerText = content.toLowerCase();
          
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
          const paragraphs = content.split('\n').filter(p => p.trim().length > 20);
          
          // Find sections labeled as key points
          const keyPointSection = content.toLowerCase().indexOf('key point');
          if (keyPointSection !== -1) {
            const keyPointsText = content.substring(keyPointSection);
            const keyPointLines = keyPointsText.split('\n')
              .filter(line => line.trim().length > 0 && (line.includes('-') || line.includes('•') || /^\d+\./.test(line)))
              .slice(0, 3);
            
            if (keyPointLines.length > 0) {
              keyPointLines.forEach(line => {
                const point = line.replace(/^[•\-\d\.]+\s*/, '').trim();
                if (point.length > 0) {
                  keyPoints.push(point);
                }
              });
            }
          }
          
          // If we couldn't find specific key points, extract some sentences
          if (keyPoints.length === 0) {
            // Take up to 3 paragraphs and use them as key points
            for (let i = 0; i < Math.min(3, paragraphs.length); i++) {
              const paragraph = paragraphs[i].trim();
              if (paragraph && paragraph !== summary) {
                // Truncate long paragraphs
                keyPoints.push(paragraph.length > 100 ? paragraph.substring(0, 100) + '...' : paragraph);
              }
            }
          }
          
          // If we still couldn't extract key points, create some generic ones
          if (keyPoints.length === 0) {
            keyPoints.push('See full analysis in the raw response below');
          }
          
          // Look for technical analysis section
          let technicalAnalysis = 'Full technical analysis available in the raw AI response below.';
          const techIndex = content.toLowerCase().indexOf('technical analysis');
          if (techIndex !== -1) {
            const nextSectionIndex = content.toLowerCase().substring(techIndex + 20).search(/\n\s*([a-z]+\s+[a-z]+:|\d+\.)/i);
            if (nextSectionIndex !== -1) {
              technicalAnalysis = content.substring(techIndex, techIndex + 20 + nextSectionIndex).trim();
            } else {
              // Take a reasonable chunk
              technicalAnalysis = content.substring(techIndex, Math.min(techIndex + 200, content.length)).trim();
            }
          }
          
          // Look for risk factors
          const riskFactors: string[] = [];
          const riskIndex = content.toLowerCase().indexOf('risk');
          if (riskIndex !== -1) {
            const riskText = content.substring(riskIndex);
            const riskLines = riskText.split('\n')
              .filter(line => line.trim().length > 0 && (line.includes('-') || line.includes('•') || /^\d+\./.test(line)))
              .slice(0, 3);
            
            if (riskLines.length > 0) {
              riskLines.forEach(line => {
                const risk = line.replace(/^[•\-\d\.]+\s*/, '').trim();
                if (risk.length > 0) {
                  riskFactors.push(risk);
                }
              });
            }
          }
          
          if (riskFactors.length === 0) {
            riskFactors.push('For complete risk assessment, please refer to the raw AI response.');
          }
          
          // Return the analysis with the raw response
          return {
            sentiment,
            summary,
            keyPoints,
            technicalAnalysis,
            riskFactors,
            llmStatus: 'online',
            metrics,
            rawLlmResponse: content
          };
        } else {
          throw new Error('Invalid response format from chat API');
        }
      } catch (error) {
        this.logger.error(`Error calling chat API: ${error.message}`);
        
        // Check if this is a timeout error
        if (error.name === 'AbortError' || error.code === 'ECONNABORTED') {
          this.logger.warn(`Chat API request timed out after ${this.modelTimeout / 1000} seconds for symbol ${data.symbol}`);
          return {
            sentiment: 'neutral',
            summary: 'AI model processing timed out',
            keyPoints: ['The analysis request took too long to respond'],
            technicalAnalysis: 'Analysis could not be completed within the time limit.',
            riskFactors: ['Analysis unavailable due to timeout'],
            llmStatus: 'processing',
            metrics,
            rawLlmResponse: ''
          };
        }
        
        // Return error details
        return {
          sentiment: 'neutral',
          summary: 'Error running AI analysis',
          keyPoints: [
            'The stock analysis service encountered an error',
            `Error details: ${error.message.substring(0, 100)}`
          ],
          technicalAnalysis: 'Unable to generate analysis due to a technical error.',
          riskFactors: ['Analysis service is currently experiencing issues'],
          llmStatus: 'error',
          metrics,
          rawLlmResponse: JSON.stringify(error.response?.data || error.message || 'Unknown error')
        };
      }
    } catch (error) {
      this.logger.error(`Error analyzing stock ${data.symbol}: ${error.message}`);
      
      // Return a clear message that service is having issues
      return {
        sentiment: 'neutral',
        summary: 'AI analysis service error',
        keyPoints: [
          'The stock analysis service encountered an error',
          `Error details: ${error.message.substring(0, 100)}`
        ],
        technicalAnalysis: 'Unable to generate analysis due to a service error.',
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