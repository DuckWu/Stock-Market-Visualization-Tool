'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';

interface StockAnalysisProps {
  symbol: string;
  price: number;
  change: number;
  volume: number;
}

interface AnalysisData {
  sentiment: string;
  summary: string;
  keyPoints: string[];
  technicalAnalysis: string;
  riskFactors: string[];
  llmStatus?: 'online' | 'offline' | 'processing' | 'error' | 'text_only';
  rawLlmResponse?: string;
  metrics?: {
    priceToBookRatio?: number;
    priceToEarningsRatio?: number;
    movingAverageComparison?: string;
    volatility?: number;
  };
}

export function StockAnalysis({ symbol, price, change, volume }: StockAnalysisProps) {
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAnalysis = async () => {
      if (!symbol) return;
      
      setLoading(true);
      setError(null);
      
      try {
        // Call our backend endpoint that uses DeepSeek
        const response = await axios.post('http://3.148.170.36:3002/stock-market/analyze', {
          symbol,
          price,
          change,
          volume
        }, {
          timeout: 200000, // Extended timeout for TinyLlama processing
          headers: {
            'Origin': ['http://localhost:3000', 'http://3.148.170.36:3000']
          }
        });
        
        setAnalysis(response.data);
      } catch (err) {
        console.error('Error fetching stock analysis:', err);
        setError('Failed to fetch stock analysis');
      } finally {
        setLoading(false);
      }
    };
    
    fetchAnalysis();
  }, [symbol, price, change, volume]);

  if (loading) {
    return (
      <div className="p-4 bg-white rounded-lg shadow">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-700 rounded-lg">
        {error}
      </div>
    );
  }

  if (!analysis) {
    return null;
  }

  return (
    <div className="p-4 bg-white rounded-lg shadow space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">AI Analysis</h3>
        <div className="flex items-center gap-2">
          {analysis.llmStatus && (
            <span className={`px-2 py-1 rounded text-xs ${
              analysis.llmStatus === 'online' ? 'bg-green-100 text-green-800' :
              analysis.llmStatus === 'processing' ? 'bg-blue-100 text-blue-800' :
              analysis.llmStatus === 'text_only' ? 'bg-purple-100 text-purple-800' :
              analysis.llmStatus === 'offline' ? 'bg-red-100 text-red-800' :
              'bg-yellow-100 text-yellow-800'
            }`}>
              {analysis.llmStatus === 'online' ? 'AI Online' :
               analysis.llmStatus === 'processing' ? 'AI Processing' :
               analysis.llmStatus === 'text_only' ? 'Raw AI Output' :
               analysis.llmStatus === 'offline' ? 'AI Offline' : 'AI Error'}
            </span>
          )}
          <span className={`px-2 py-1 rounded text-sm ${
            analysis.sentiment === 'positive' ? 'bg-green-100 text-green-800' :
            analysis.sentiment === 'negative' ? 'bg-red-100 text-red-800' :
            'bg-yellow-100 text-yellow-800'
          }`}>
            {analysis.sentiment.charAt(0).toUpperCase() + analysis.sentiment.slice(1)} Sentiment
          </span>
        </div>
      </div>
      
      <div className="prose max-w-none">
        <p className="text-gray-700">{analysis.summary}</p>
      </div>
      
      {/* Display metrics if available */}
      {analysis.metrics && (
        <div className="grid grid-cols-2 gap-4 text-sm">
          {analysis.metrics.priceToEarningsRatio && (
            <div className="bg-gray-50 p-2 rounded">
              <span className="font-medium">P/E Ratio:</span> {analysis.metrics.priceToEarningsRatio.toFixed(2)}
            </div>
          )}
          {analysis.metrics.priceToBookRatio && (
            <div className="bg-gray-50 p-2 rounded">
              <span className="font-medium">P/B Ratio:</span> {analysis.metrics.priceToBookRatio.toFixed(2)}
            </div>
          )}
          {analysis.metrics.movingAverageComparison && (
            <div className="bg-gray-50 p-2 rounded">
              <span className="font-medium">Moving Avg:</span> {analysis.metrics.movingAverageComparison}
            </div>
          )}
          {analysis.metrics.volatility && (
            <div className="bg-gray-50 p-2 rounded">
              <span className="font-medium">Volatility:</span> {(analysis.metrics.volatility * 100).toFixed(1)}%
            </div>
          )}
        </div>
      )}
      
      <div className="space-y-2">
        <h4 className="font-medium text-gray-900">Key Points</h4>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          {analysis.keyPoints.map((point, index) => (
            <li key={index}>{point}</li>
          ))}
        </ul>
      </div>
      
      <div className="space-y-2">
        <h4 className="font-medium text-gray-900">Technical Analysis</h4>
        <p className="text-gray-700">{analysis.technicalAnalysis}</p>
      </div>
      
      <div className="space-y-2">
        <h4 className="font-medium text-gray-900">Risk Factors</h4>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          {analysis.riskFactors.map((risk, index) => (
            <li key={index}>{risk}</li>
          ))}
        </ul>
      </div>

      {/* Display raw LLM response if available */}
      {analysis.rawLlmResponse && analysis.llmStatus === 'text_only' && (
        <div className="space-y-2 mt-4 border-t pt-4">
          <h4 className="font-medium text-gray-900">Raw AI Response</h4>
          <div className="bg-gray-50 p-3 rounded-md text-sm font-mono whitespace-pre-wrap overflow-auto max-h-60">
            {analysis.rawLlmResponse}
          </div>
        </div>
      )}
    </div>
  );
} 