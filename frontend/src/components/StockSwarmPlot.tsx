'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import axios from 'axios';

interface StockData {
  symbol: string;
  name: string;
  sector: string;
  marketCap: number;
  price: number;
  percentChange: number;
  volume: number;
  _timeIndex: number;
  // For visualization
  x?: number;
  y?: number;
  // For historical data
  timestamp?: string;
  cumulativePercentChange?: number;
  isRealData?: boolean;
}

interface StockSwarmPlotProps {
  symbol: string;
  timeframe: string;
  onStockSelect: (symbol: string) => void;
  onPriceUpdate: (price: number, change: number, volume: number) => void;
}

// Real S&P 500 sectors for grouping
const SP500_SECTORS = [
  "Information Technology",
  "Financials",
  "Health Care",
  "Consumer Discretionary",
  "Communication Services",
  "Industrials",
  "Consumer Staples",
  "Energy",
  "Utilities",
  "Real Estate",
  "Materials"
];

export function StockSwarmPlot({ symbol, timeframe, onStockSelect, onPriceUpdate }: StockSwarmPlotProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [data, setData] = useState<StockData[][]>([]);
  const [currentTimeIndex, setCurrentTimeIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedTimeframe, setSelectedTimeframe] = useState<'5d' | '1m' | '3m' | '6m' | '1y' | 'ytd'>('ytd');
  const intervalRef = useRef<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  
  // Define interfaces for the data structures
  interface PriceDataPoint {
    date: string;
    close: number;
    volume: number;
    dailyPercentChange: number;
    percentChange: number;
  }
  
  interface StockDataResponse {
    symbol: string;
    name: string;
    sector: string;
    marketCap: number;
    priceData: PriceDataPoint[];
    isRealData: boolean;
  }

  useEffect(() => {
    const fetchRealStockData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Define the time range based on selected timeframe
        const endDate = new Date();
        let startDate = new Date();
        
        if (selectedTimeframe === '5d') {
          startDate.setDate(endDate.getDate() - 5);
        } else if (selectedTimeframe === '1m') {
          startDate.setMonth(endDate.getMonth() - 1);
        } else if (selectedTimeframe === '3m') {
          startDate.setMonth(endDate.getMonth() - 3);
        } else if (selectedTimeframe === '6m') {
          startDate.setMonth(endDate.getMonth() - 6);
        } else if (selectedTimeframe === '1y') {
          startDate.setFullYear(endDate.getFullYear() - 1);
        } else { // ytd
          startDate = new Date(endDate.getFullYear(), 0, 1);
        }
        
        // Calculate number of periods based on timeframe
        const periods = selectedTimeframe === '5d' ? 5 :
                       selectedTimeframe === '1m' ? 20 :
                       selectedTimeframe === '3m' ? 12 :
                       selectedTimeframe === '6m' ? 24 :
                       selectedTimeframe === '1y' ? 12 : 10; // ytd default
        
        console.log(`Fetching data for ${periods} time periods from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
        
        // Define representative stocks for each sector based on S&P 500 composition
        const sectorStocks = [
          // Information Technology - 31.15% of S&P 500
          { symbol: 'AAPL', name: 'Apple Inc.', sector: 'Information Technology', baseMarketCap: 2700 },
          { symbol: 'MSFT', name: 'Microsoft Corp.', sector: 'Information Technology', baseMarketCap: 2400 },
          { symbol: 'NVDA', name: 'NVIDIA Corp.', sector: 'Information Technology', baseMarketCap: 2500 },
          { symbol: 'AVGO', name: 'Broadcom Inc.', sector: 'Information Technology', baseMarketCap: 550 },
          { symbol: 'ADBE', name: 'Adobe Inc.', sector: 'Information Technology', baseMarketCap: 250 },
          { symbol: 'CRM', name: 'Salesforce Inc.', sector: 'Information Technology', baseMarketCap: 250 },
          { symbol: 'CSCO', name: 'Cisco Systems Inc.', sector: 'Information Technology', baseMarketCap: 200 },
          { symbol: 'AMD', name: 'Advanced Micro Devices', sector: 'Information Technology', baseMarketCap: 230 },
          { symbol: 'ORCL', name: 'Oracle Corp.', sector: 'Information Technology', baseMarketCap: 220 },
          { symbol: 'ACN', name: 'Accenture Plc', sector: 'Information Technology', baseMarketCap: 210 },
          { symbol: 'QCOM', name: 'Qualcomm Inc.', sector: 'Information Technology', baseMarketCap: 180 },
          { symbol: 'INTC', name: 'Intel Corp.', sector: 'Information Technology', baseMarketCap: 150 },
          { symbol: 'IBM', name: 'International Business Machines', sector: 'Information Technology', baseMarketCap: 140 },
          { symbol: 'NOW', name: 'ServiceNow Inc.', sector: 'Information Technology', baseMarketCap: 130 },
          { symbol: 'INTU', name: 'Intuit Inc.', sector: 'Information Technology', baseMarketCap: 125 },
          { symbol: 'TXN', name: 'Texas Instruments', sector: 'Information Technology', baseMarketCap: 120 },
          { symbol: 'AMAT', name: 'Applied Materials', sector: 'Information Technology', baseMarketCap: 115 },
          { symbol: 'MU', name: 'Micron Technology', sector: 'Information Technology', baseMarketCap: 110 },
          { symbol: 'PYPL', name: 'PayPal Holdings', sector: 'Information Technology', baseMarketCap: 90 },
          { symbol: 'ADI', name: 'Analog Devices', sector: 'Information Technology', baseMarketCap: 85 },
          { symbol: 'LRCX', name: 'Lam Research', sector: 'Information Technology', baseMarketCap: 80 },
          { symbol: 'SNPS', name: 'Synopsys Inc.', sector: 'Information Technology', baseMarketCap: 75 },
          { symbol: 'CDNS', name: 'Cadence Design Systems', sector: 'Information Technology', baseMarketCap: 70 },
          { symbol: 'PLTR', name: 'Palantir Technologies', sector: 'Information Technology', baseMarketCap: 65 },
          { symbol: 'DELL', name: 'Dell Technologies', sector: 'Information Technology', baseMarketCap: 60 },
          { symbol: 'HPQ', name: 'HP Inc.', sector: 'Information Technology', baseMarketCap: 50 },
          
          // Financials - 13.04% of S&P 500
          { symbol: 'BRK.B', name: 'Berkshire Hathaway Inc.', sector: 'Financials', baseMarketCap: 800 },
          { symbol: 'JPM', name: 'JPMorgan Chase & Co.', sector: 'Financials', baseMarketCap: 600 },
          { symbol: 'V', name: 'Visa Inc.', sector: 'Financials', baseMarketCap: 550 },
          { symbol: 'MA', name: 'Mastercard Inc.', sector: 'Financials', baseMarketCap: 450 },
          { symbol: 'BAC', name: 'Bank of America Corp.', sector: 'Financials', baseMarketCap: 350 },
          { symbol: 'WFC', name: 'Wells Fargo & Co.', sector: 'Financials', baseMarketCap: 230 },
          { symbol: 'MS', name: 'Morgan Stanley', sector: 'Financials', baseMarketCap: 190 },
          { symbol: 'GS', name: 'Goldman Sachs Group Inc.', sector: 'Financials', baseMarketCap: 180 },
          { symbol: 'BLK', name: 'BlackRock Inc.', sector: 'Financials', baseMarketCap: 150 },
          { symbol: 'C', name: 'Citigroup Inc.', sector: 'Financials', baseMarketCap: 140 },
          { symbol: 'SPGI', name: 'S&P Global Inc.', sector: 'Financials', baseMarketCap: 130 },
          { symbol: 'AXP', name: 'American Express Co.', sector: 'Financials', baseMarketCap: 120 },
          { symbol: 'CB', name: 'Chubb Limited', sector: 'Financials', baseMarketCap: 110 },
          { symbol: 'PGR', name: 'Progressive Corp.', sector: 'Financials', baseMarketCap: 105 },
          { symbol: 'BX', name: 'Blackstone Inc.', sector: 'Financials', baseMarketCap: 100 },
          { symbol: 'TFC', name: 'Truist Financial', sector: 'Financials', baseMarketCap: 95 },
          { symbol: 'USB', name: 'U.S. Bancorp', sector: 'Financials', baseMarketCap: 90 },
          { symbol: 'PNC', name: 'PNC Financial Services', sector: 'Financials', baseMarketCap: 85 },
          { symbol: 'MMC', name: 'Marsh & McLennan', sector: 'Financials', baseMarketCap: 80 },
          { symbol: 'APO', name: 'Apollo Global Management', sector: 'Financials', baseMarketCap: 75 },
          { symbol: 'ICE', name: 'Intercontinental Exchange', sector: 'Financials', baseMarketCap: 70 },
          { symbol: 'AON', name: 'Aon plc', sector: 'Financials', baseMarketCap: 65 },
          { symbol: 'CME', name: 'CME Group Inc.', sector: 'Financials', baseMarketCap: 60 },
          
          // Health Care - 13.21% of S&P 500
          { symbol: 'UNH', name: 'UnitedHealth Group Inc.', sector: 'Health Care', baseMarketCap: 500 },
          { symbol: 'LLY', name: 'Eli Lilly & Co.', sector: 'Health Care', baseMarketCap: 450 },
          { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'Health Care', baseMarketCap: 400 },
          { symbol: 'MRK', name: 'Merck & Co. Inc.', sector: 'Health Care', baseMarketCap: 300 },
          { symbol: 'ABBV', name: 'AbbVie Inc.', sector: 'Health Care', baseMarketCap: 280 },
          { symbol: 'PFE', name: 'Pfizer Inc.', sector: 'Health Care', baseMarketCap: 200 },
          { symbol: 'TMO', name: 'Thermo Fisher Scientific', sector: 'Health Care', baseMarketCap: 180 },
          { symbol: 'ABT', name: 'Abbott Laboratories', sector: 'Health Care', baseMarketCap: 190 },
          { symbol: 'DHR', name: 'Danaher Corp.', sector: 'Health Care', baseMarketCap: 175 },
          { symbol: 'BMY', name: 'Bristol-Myers Squibb', sector: 'Health Care', baseMarketCap: 165 },
          { symbol: 'AMGN', name: 'Amgen Inc.', sector: 'Health Care', baseMarketCap: 155 },
          { symbol: 'ISRG', name: 'Intuitive Surgical', sector: 'Health Care', baseMarketCap: 145 },
          { symbol: 'GILD', name: 'Gilead Sciences', sector: 'Health Care', baseMarketCap: 135 },
          { symbol: 'ELV', name: 'Elevance Health', sector: 'Health Care', baseMarketCap: 125 },
          { symbol: 'CVS', name: 'CVS Health Corp.', sector: 'Health Care', baseMarketCap: 115 },
          { symbol: 'VRTX', name: 'Vertex Pharmaceuticals', sector: 'Health Care', baseMarketCap: 105 },
          { symbol: 'ZTS', name: 'Zoetis Inc.', sector: 'Health Care', baseMarketCap: 95 },
          { symbol: 'REGN', name: 'Regeneron Pharmaceuticals', sector: 'Health Care', baseMarketCap: 85 },
          { symbol: 'CI', name: 'Cigna Group', sector: 'Health Care', baseMarketCap: 75 },
          { symbol: 'HUM', name: 'Humana Inc.', sector: 'Health Care', baseMarketCap: 65 },
          { symbol: 'MRNA', name: 'Moderna Inc.', sector: 'Health Care', baseMarketCap: 55 },
          { symbol: 'BSX', name: 'Boston Scientific', sector: 'Health Care', baseMarketCap: 45 },
          { symbol: 'BIIB', name: 'Biogen Inc.', sector: 'Health Care', baseMarketCap: 40 },
          
          // Consumer Discretionary - 10.17% of S&P 500
          { symbol: 'AMZN', name: 'Amazon.com Inc.', sector: 'Consumer Discretionary', baseMarketCap: 1500 },
          { symbol: 'TSLA', name: 'Tesla Inc.', sector: 'Consumer Discretionary', baseMarketCap: 650 },
          { symbol: 'HD', name: 'Home Depot Inc.', sector: 'Consumer Discretionary', baseMarketCap: 330 },
          { symbol: 'MCD', name: 'McDonald\'s Corp.', sector: 'Consumer Discretionary', baseMarketCap: 200 },
          { symbol: 'NKE', name: 'Nike Inc.', sector: 'Consumer Discretionary', baseMarketCap: 170 },
          { symbol: 'LOW', name: 'Lowe\'s Companies Inc.', sector: 'Consumer Discretionary', baseMarketCap: 130 },
          { symbol: 'SBUX', name: 'Starbucks Corp.', sector: 'Consumer Discretionary', baseMarketCap: 120 },
          { symbol: 'TJX', name: 'TJX Companies Inc.', sector: 'Consumer Discretionary', baseMarketCap: 110 },
          { symbol: 'BKNG', name: 'Booking Holdings', sector: 'Consumer Discretionary', baseMarketCap: 105 },
          { symbol: 'ABNB', name: 'Airbnb Inc.', sector: 'Consumer Discretionary', baseMarketCap: 100 },
          { symbol: 'ORLY', name: 'O\'Reilly Automotive', sector: 'Consumer Discretionary', baseMarketCap: 95 },
          { symbol: 'TGT', name: 'Target Corp.', sector: 'Consumer Discretionary', baseMarketCap: 90 },
          { symbol: 'MELI', name: 'MercadoLibre Inc.', sector: 'Consumer Discretionary', baseMarketCap: 85 },
          { symbol: 'LULU', name: 'Lululemon Athletica', sector: 'Consumer Discretionary', baseMarketCap: 80 },
          { symbol: 'MAR', name: 'Marriott International', sector: 'Consumer Discretionary', baseMarketCap: 75 },
          { symbol: 'EBAY', name: 'eBay Inc.', sector: 'Consumer Discretionary', baseMarketCap: 70 },
          { symbol: 'AZO', name: 'AutoZone Inc.', sector: 'Consumer Discretionary', baseMarketCap: 65 },
          { symbol: 'ULTA', name: 'Ulta Beauty Inc.', sector: 'Consumer Discretionary', baseMarketCap: 60 },
          { symbol: 'EXPE', name: 'Expedia Group', sector: 'Consumer Discretionary', baseMarketCap: 55 },
          { symbol: 'GM', name: 'General Motors', sector: 'Consumer Discretionary', baseMarketCap: 50 },
          { symbol: 'F', name: 'Ford Motor Co.', sector: 'Consumer Discretionary', baseMarketCap: 45 },
          { symbol: 'HLT', name: 'Hilton Worldwide', sector: 'Consumer Discretionary', baseMarketCap: 40 },
          { symbol: 'APTV', name: 'Aptiv PLC', sector: 'Consumer Discretionary', baseMarketCap: 35 },
          
          // Communication Services - 8.64% of S&P 500
          { symbol: 'GOOGL', name: 'Alphabet Inc. Class A', sector: 'Communication Services', baseMarketCap: 1600 },
          { symbol: 'GOOG', name: 'Alphabet Inc. Class C', sector: 'Communication Services', baseMarketCap: 1600 },
          { symbol: 'META', name: 'Meta Platforms Inc.', sector: 'Communication Services', baseMarketCap: 900 },
          { symbol: 'DIS', name: 'Walt Disney Co.', sector: 'Communication Services', baseMarketCap: 240 },
          { symbol: 'NFLX', name: 'Netflix Inc.', sector: 'Communication Services', baseMarketCap: 220 },
          { symbol: 'CMCSA', name: 'Comcast Corp.', sector: 'Communication Services', baseMarketCap: 190 },
          { symbol: 'VZ', name: 'Verizon Communications', sector: 'Communication Services', baseMarketCap: 170 },
          { symbol: 'T', name: 'AT&T Inc.', sector: 'Communication Services', baseMarketCap: 140 },
          { symbol: 'CHTR', name: 'Charter Communications', sector: 'Communication Services', baseMarketCap: 80 },
          { symbol: 'TMUS', name: 'T-Mobile US Inc.', sector: 'Communication Services', baseMarketCap: 150 },
          { symbol: 'TTWO', name: 'Take-Two Interactive', sector: 'Communication Services', baseMarketCap: 50 },
          { symbol: 'WBD', name: 'Warner Bros. Discovery', sector: 'Communication Services', baseMarketCap: 45 },
          { symbol: 'EA', name: 'Electronic Arts', sector: 'Communication Services', baseMarketCap: 40 },
          { symbol: 'PARA', name: 'Paramount Global', sector: 'Communication Services', baseMarketCap: 35 },
          { symbol: 'LBRDK', name: 'Liberty Broadband', sector: 'Communication Services', baseMarketCap: 30 },
          { symbol: 'LYV', name: 'Live Nation Entertainment', sector: 'Communication Services', baseMarketCap: 25 },
          { symbol: 'SIRI', name: 'Sirius XM Holdings', sector: 'Communication Services', baseMarketCap: 20 },
          { symbol: 'MTCH', name: 'Match Group', sector: 'Communication Services', baseMarketCap: 18 },
          
          // Industrials - 8.62% of S&P 500
          { symbol: 'RTX', name: 'Raytheon Technologies', sector: 'Industrials', baseMarketCap: 140 },
          { symbol: 'HON', name: 'Honeywell International', sector: 'Industrials', baseMarketCap: 130 },
          { symbol: 'UPS', name: 'United Parcel Service', sector: 'Industrials', baseMarketCap: 120 },
          { symbol: 'BA', name: 'Boeing Co.', sector: 'Industrials', baseMarketCap: 110 },
          { symbol: 'CAT', name: 'Caterpillar Inc.', sector: 'Industrials', baseMarketCap: 140 },
          { symbol: 'GE', name: 'General Electric Co.', sector: 'Industrials', baseMarketCap: 120 },
          { symbol: 'LMT', name: 'Lockheed Martin Corp.', sector: 'Industrials', baseMarketCap: 110 },
          { symbol: 'UNP', name: 'Union Pacific Corp.', sector: 'Industrials', baseMarketCap: 120 },
          { symbol: 'GEV', name: 'GE Vernova', sector: 'Industrials', baseMarketCap: 115 },
          { symbol: 'DE', name: 'Deere & Company', sector: 'Industrials', baseMarketCap: 105 },
          { symbol: 'CSX', name: 'CSX Corp.', sector: 'Industrials', baseMarketCap: 90 },
          { symbol: 'FDX', name: 'FedEx Corp.', sector: 'Industrials', baseMarketCap: 85 },
          { symbol: 'NSC', name: 'Norfolk Southern', sector: 'Industrials', baseMarketCap: 80 },
          { symbol: 'ITW', name: 'Illinois Tool Works', sector: 'Industrials', baseMarketCap: 75 },
          { symbol: 'PH', name: 'Parker-Hannifin', sector: 'Industrials', baseMarketCap: 70 },
          { symbol: 'ETN', name: 'Eaton Corp.', sector: 'Industrials', baseMarketCap: 65 },
          { symbol: 'EMR', name: 'Emerson Electric', sector: 'Industrials', baseMarketCap: 60 },
          { symbol: 'GWW', name: 'W.W. Grainger', sector: 'Industrials', baseMarketCap: 55 },
          { symbol: 'CMI', name: 'Cummins Inc.', sector: 'Industrials', baseMarketCap: 50 },
          { symbol: 'VRSK', name: 'Verisk Analytics', sector: 'Industrials', baseMarketCap: 45 },
          { symbol: 'CTAS', name: 'Cintas Corp.', sector: 'Industrials', baseMarketCap: 40 },
          { symbol: 'PCAR', name: 'PACCAR Inc.', sector: 'Industrials', baseMarketCap: 35 },
          { symbol: 'ODFL', name: 'Old Dominion Freight Line', sector: 'Industrials', baseMarketCap: 30 },
          
          // Consumer Staples - 6.85% of S&P 500
          { symbol: 'WMT', name: 'Walmart Inc.', sector: 'Consumer Staples', baseMarketCap: 400 },
          { symbol: 'PG', name: 'Procter & Gamble Co.', sector: 'Consumer Staples', baseMarketCap: 350 },
          { symbol: 'KO', name: 'Coca-Cola Co.', sector: 'Consumer Staples', baseMarketCap: 260 },
          { symbol: 'PEP', name: 'PepsiCo Inc.', sector: 'Consumer Staples', baseMarketCap: 250 },
          { symbol: 'COST', name: 'Costco Wholesale Corp.', sector: 'Consumer Staples', baseMarketCap: 230 },
          { symbol: 'PM', name: 'Philip Morris International', sector: 'Consumer Staples', baseMarketCap: 150 },
          { symbol: 'MO', name: 'Altria Group Inc.', sector: 'Consumer Staples', baseMarketCap: 140 },
          { symbol: 'MDLZ', name: 'Mondelez International', sector: 'Consumer Staples', baseMarketCap: 120 },
          { symbol: 'EL', name: 'Estée Lauder Companies', sector: 'Consumer Staples', baseMarketCap: 110 },
          { symbol: 'CL', name: 'Colgate-Palmolive', sector: 'Consumer Staples', baseMarketCap: 100 },
          { symbol: 'GIS', name: 'General Mills', sector: 'Consumer Staples', baseMarketCap: 90 },
          { symbol: 'STZ', name: 'Constellation Brands', sector: 'Consumer Staples', baseMarketCap: 85 },
          { symbol: 'KHC', name: 'Kraft Heinz Co.', sector: 'Consumer Staples', baseMarketCap: 80 },
          { symbol: 'ADM', name: 'Archer-Daniels-Midland', sector: 'Consumer Staples', baseMarketCap: 75 },
          { symbol: 'KMB', name: 'Kimberly-Clark Corp.', sector: 'Consumer Staples', baseMarketCap: 70 },
          { symbol: 'HSY', name: 'Hershey Co.', sector: 'Consumer Staples', baseMarketCap: 65 },
          { symbol: 'K', name: 'Kellogg Company', sector: 'Consumer Staples', baseMarketCap: 60 },
          { symbol: 'KR', name: 'Kroger Co.', sector: 'Consumer Staples', baseMarketCap: 55 },
          { symbol: 'MKC', name: 'McCormick & Company', sector: 'Consumer Staples', baseMarketCap: 50 },
          { symbol: 'SJM', name: 'J.M. Smucker Co.', sector: 'Consumer Staples', baseMarketCap: 45 },
          
          // Energy - 3.95% of S&P 500
          { symbol: 'XOM', name: 'Exxon Mobil Corp.', sector: 'Energy', baseMarketCap: 400 },
          { symbol: 'CVX', name: 'Chevron Corp.', sector: 'Energy', baseMarketCap: 350 },
          { symbol: 'COP', name: 'ConocoPhillips', sector: 'Energy', baseMarketCap: 150 },
          { symbol: 'SLB', name: 'Schlumberger Ltd.', sector: 'Energy', baseMarketCap: 70 },
          { symbol: 'EOG', name: 'EOG Resources Inc.', sector: 'Energy', baseMarketCap: 80 },
          { symbol: 'OXY', name: 'Occidental Petroleum', sector: 'Energy', baseMarketCap: 65 },
          { symbol: 'MPC', name: 'Marathon Petroleum', sector: 'Energy', baseMarketCap: 60 },
          { symbol: 'VLO', name: 'Valero Energy Corp.', sector: 'Energy', baseMarketCap: 55 },
          { symbol: 'PSX', name: 'Phillips 66', sector: 'Energy', baseMarketCap: 50 },
          { symbol: 'DVN', name: 'Devon Energy Corp.', sector: 'Energy', baseMarketCap: 45 },
          { symbol: 'FANG', name: 'Diamondback Energy', sector: 'Energy', baseMarketCap: 40 },
          { symbol: 'KMI', name: 'Kinder Morgan Inc.', sector: 'Energy', baseMarketCap: 35 },
          { symbol: 'HES', name: 'Hess Corporation', sector: 'Energy', baseMarketCap: 30 },
          { symbol: 'WMB', name: 'Williams Companies', sector: 'Energy', baseMarketCap: 25 },
          { symbol: 'HAL', name: 'Halliburton Co.', sector: 'Energy', baseMarketCap: 20 },
          
          // Utilities - 2.26% of S&P 500
          { symbol: 'NEE', name: 'NextEra Energy Inc.', sector: 'Utilities', baseMarketCap: 150 },
          { symbol: 'DUK', name: 'Duke Energy Corp.', sector: 'Utilities', baseMarketCap: 80 },
          { symbol: 'SO', name: 'Southern Co.', sector: 'Utilities', baseMarketCap: 70 },
          { symbol: 'D', name: 'Dominion Energy Inc.', sector: 'Utilities', baseMarketCap: 60 },
          { symbol: 'AEP', name: 'American Electric Power', sector: 'Utilities', baseMarketCap: 45 },
          { symbol: 'SRE', name: 'Sempra Energy', sector: 'Utilities', baseMarketCap: 40 },
          { symbol: 'EXC', name: 'Exelon Corp.', sector: 'Utilities', baseMarketCap: 35 },
          { symbol: 'XEL', name: 'Xcel Energy Inc.', sector: 'Utilities', baseMarketCap: 30 },
          { symbol: 'PCG', name: 'PG&E Corp.', sector: 'Utilities', baseMarketCap: 25 },
          { symbol: 'ED', name: 'Consolidated Edison', sector: 'Utilities', baseMarketCap: 23 },
          { symbol: 'WEC', name: 'WEC Energy Group', sector: 'Utilities', baseMarketCap: 20 },
          { symbol: 'ES', name: 'Eversource Energy', sector: 'Utilities', baseMarketCap: 18 },
          { symbol: 'DTE', name: 'DTE Energy Co.', sector: 'Utilities', baseMarketCap: 16 },
          
          // Real Estate - 2.09% of S&P 500
          { symbol: 'AMT', name: 'American Tower Corp.', sector: 'Real Estate', baseMarketCap: 120 },
          { symbol: 'PLD', name: 'Prologis Inc.', sector: 'Real Estate', baseMarketCap: 110 },
          { symbol: 'CCI', name: 'Crown Castle Inc.', sector: 'Real Estate', baseMarketCap: 80 },
          { symbol: 'EQIX', name: 'Equinix Inc.', sector: 'Real Estate', baseMarketCap: 70 },
          { symbol: 'PSA', name: 'Public Storage', sector: 'Real Estate', baseMarketCap: 60 },
          { symbol: 'SPG', name: 'Simon Property Group', sector: 'Real Estate', baseMarketCap: 55 },
          { symbol: 'WELL', name: 'Welltower Inc.', sector: 'Real Estate', baseMarketCap: 50 },
          { symbol: 'O', name: 'Realty Income Corp.', sector: 'Real Estate', baseMarketCap: 45 },
          { symbol: 'ARE', name: 'Alexandria Real Estate', sector: 'Real Estate', baseMarketCap: 40 },
          { symbol: 'AVB', name: 'AvalonBay Communities', sector: 'Real Estate', baseMarketCap: 35 },
          { symbol: 'DLR', name: 'Digital Realty Trust', sector: 'Real Estate', baseMarketCap: 30 },
          { symbol: 'EQR', name: 'Equity Residential', sector: 'Real Estate', baseMarketCap: 25 },
          
          // Materials - 2.23% of S&P 500
          { symbol: 'LIN', name: 'Linde Plc', sector: 'Materials', baseMarketCap: 170 },
          { symbol: 'SHW', name: 'Sherwin-Williams Co.', sector: 'Materials', baseMarketCap: 80 },
          { symbol: 'ECL', name: 'Ecolab, Inc.', sector: 'Materials', baseMarketCap: 60 },
          { symbol: 'FCX', name: 'Freeport-McMoRan Inc.', sector: 'Materials', baseMarketCap: 60 },
          { symbol: 'APD', name: 'Air Products & Chemicals', sector: 'Materials', baseMarketCap: 60 },
          { symbol: 'NEM', name: 'Newmont Corporation', sector: 'Materials', baseMarketCap: 60 },
          { symbol: 'CTVA', name: 'Corteva Inc.', sector: 'Materials', baseMarketCap: 55 },
          { symbol: 'DOW', name: 'Dow Inc.', sector: 'Materials', baseMarketCap: 50 },
          { symbol: 'DD', name: 'DuPont de Nemours', sector: 'Materials', baseMarketCap: 45 },
          { symbol: 'NUE', name: 'Nucor Corp.', sector: 'Materials', baseMarketCap: 40 },
          { symbol: 'ALB', name: 'Albemarle Corp.', sector: 'Materials', baseMarketCap: 35 },
          { symbol: 'IFF', name: 'International Flavors & Fragrances', sector: 'Materials', baseMarketCap: 30 },
          { symbol: 'PPG', name: 'PPG Industries', sector: 'Materials', baseMarketCap: 25 },
        ];

        // Fetch stock data for each symbol from our backend API
        const stockDataPromises = sectorStocks.map(async (stock) => {
          try {
            console.log(`Fetching real data for ${stock.symbol}...`);
            // Try to fetch from backend API with increased timeout
            const response = await axios.get(`http://localhost:3002/stock-market/daily?symbol=${stock.symbol}`, {
              timeout: 8000 // Increased timeout to 8 seconds for better chance of success
            });
            
            // Verify we have valid data
            if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
              throw new Error(`No valid data returned for ${stock.symbol}`);
            }
            
            // Log the first data point for some sample stocks
            if (stock.symbol === 'AAPL' || stock.symbol === 'MSFT' || stock.symbol === 'AMZN') {
              console.log(`Successfully fetched real data for ${stock.symbol}:`, {
                dataPoints: response.data.length,
                firstPoint: response.data[0],
                lastPoint: response.data[response.data.length - 1],
                isUnique: true // Flag to verify we're logging unique data
              });
            }
            
            // Use real data
            return {
              symbol: stock.symbol,
              name: stock.name,
              sector: stock.sector,
              marketCap: stock.baseMarketCap,
              priceData: response.data,
              isRealData: true // Flag to indicate this is real data
            };
          } catch (error) {
            // Log error info for debugging
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.warn(`❌ Error fetching real data for ${stock.symbol}: ${errorMessage}`);
            
            // Generate realistic fallback data
            return generateFallbackStockData(stock, selectedTimeframe, startDate, endDate);
          }
        });
        
        // Function to generate fallback data if needed
        function generateFallbackStockData(
          stock: { symbol: string; name?: string; sector: string; baseMarketCap: number }, 
          timeframe: string, 
          startDate: Date, 
          endDate: Date
        ): StockDataResponse {
          console.warn(`Generating fallback data for ${stock.symbol}`);
          
          // Create a unique seed for this stock
          const symbolSeed = stock.symbol.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
          
          // Generate realistic base price
          const getRealisticBasePrice = (stock: { symbol: string; baseMarketCap: number; sector: string }) => {
            const { symbol, baseMarketCap, sector } = stock;
            
            // Some stocks are known to have specific price ranges
            if (symbol === 'BRK.B') return 300 + Math.random() * 50;
            if (symbol === 'AMZN') return 100 + Math.random() * 50;
            if (symbol === 'GOOGL' || symbol === 'GOOG') return 120 + Math.random() * 30;
            if (symbol === 'AAPL') return 150 + Math.random() * 30;
            if (symbol === 'MSFT') return 280 + Math.random() * 50;
            if (symbol === 'NVDA') return 400 + Math.random() * 100;
            
            // Use symbol seed for unique but consistent pricing
            const symbolFactor = (symbolSeed % 100) / 100;
            
            // For other stocks, base the price on market cap with some randomness
            if (baseMarketCap > 1000) return 200 + symbolFactor * 300;
            if (baseMarketCap > 500) return 150 + symbolFactor * 200;
            if (baseMarketCap > 200) return 100 + symbolFactor * 100;
            if (baseMarketCap > 50) return 50 + symbolFactor * 50;
            
            // Add some sector-specific adjustments
            const sectorMultiplier = 
              sector === 'Information Technology' ? 1.2 : 
              sector === 'Health Care' ? 1.1 :
              sector === 'Energy' ? 0.8 :
              sector === 'Utilities' ? 0.7 : 1;
              
            return (20 + symbolFactor * 40) * sectorMultiplier;
          };
          
          // Create days array with proper dates
          const getBusinessDaysArray = (start: Date, end: Date): Date[] => {
            const days: Date[] = [];
            let current = new Date(start);
            
            while (current <= end) {
              const day = current.getDay();
              if (day !== 0 && day !== 6) { // Skip weekends
                days.push(new Date(current));
              }
              current.setDate(current.getDate() + 1);
            }
            
            return days;
          };
          
          // Generate price data
          const basePrice = getRealisticBasePrice(stock);
          const days = getBusinessDaysArray(startDate, endDate);
          
          // Determine volatility based on sector and market cap
          const getVolatility = (sector: string, marketCap: number): number => {
            // Higher volatility for tech and smaller companies
            const sectorVolatility = 
              sector === 'Information Technology' ? 1.5 :
              sector === 'Energy' ? 1.3 :
              sector === 'Consumer Discretionary' ? 1.2 :
              sector === 'Financials' ? 1.1 :
              sector === 'Health Care' ? 0.9 :
              sector === 'Consumer Staples' ? 0.8 :
              sector === 'Utilities' ? 0.7 : 1.0;
              
            // Smaller companies tend to be more volatile
            const sizeVolatility = 
              marketCap < 50 ? 1.8 :
              marketCap < 100 ? 1.5 :
              marketCap < 200 ? 1.3 :
              marketCap < 500 ? 1.1 :
              marketCap < 1000 ? 0.9 : 0.8;
              
            return sectorVolatility * sizeVolatility * 0.015; // Base volatility multiplier
          };
          
          const volatility = getVolatility(stock.sector, stock.baseMarketCap);
          const priceData: PriceDataPoint[] = [];
          
          let cumulativePercentChange = 0;
          let currentPrice = basePrice;
          
          days.forEach((date: Date, index: number) => {
            // Create unique but semi-realistic daily changes
            const symbolFactor = ((symbolSeed + index) % 100) / 100; // Different for each day and symbol
            const marketFactor = Math.sin(index / 5) * 0.5 + 0.5; // Market cycles
            
            // Daily percent change with some randomness
            const dailyPercentChange = (
              (Math.random() * 2 - 1) * volatility * // Random component
              (1 + symbolFactor * 0.5) * // Symbol-specific component
              (1 + marketFactor * 0.8) // Market cycle component
            );
            
            // Update price and record
            const previousPrice = currentPrice;
            currentPrice = previousPrice * (1 + dailyPercentChange);
            cumulativePercentChange = (currentPrice / basePrice - 1) * 100;
            
            priceData.push({
              date: date.toISOString().split('T')[0],
              close: parseFloat(currentPrice.toFixed(2)),
              volume: Math.floor(Math.random() * 10000000) + 1000000,
              dailyPercentChange: parseFloat(dailyPercentChange.toFixed(4)) * 100,
              percentChange: parseFloat(cumulativePercentChange.toFixed(2))
            });
          });
          
          return {
            symbol: stock.symbol,
            name: stock.name || stock.symbol,
            sector: stock.sector || 'Unknown',
            marketCap: stock.baseMarketCap || 0,
            priceData: priceData,
            isRealData: false // Flag to indicate this is fallback data
          };
        }

        // Wait for all API calls to complete
        const stocksWithPriceData = await Promise.all(stockDataPromises);
        
        // Create snapshots for the time periods we want to display
        // For each time period, collect the data from all stocks at that point in time
        const snapshots: StockData[][] = [];

        // Build snapshots at evenly spaced intervals
        const interval = (endDate.getTime() - startDate.getTime()) / (periods - 1);
        
        // Keep track of previous closing prices for each stock to calculate proper period-to-period changes
        const previousCloses: Record<string, number> = {};
        
        for (let i = 0; i < periods; i++) {
          const targetDate = new Date(startDate.getTime() + interval * i);
          const snapshotStocks: StockData[] = [];
          
          // Debug log target date
          console.log(`Creating snapshot ${i} for target date: ${targetDate.toISOString()}`);
          
          // Track unique prices to verify we're not reusing data
          const debugPrices = new Set<string>();
          
          stocksWithPriceData.forEach((stock, stockIndex) => {
            if (!stock.priceData || !stock.priceData.length) return;
            
            // Find the closest data point to the target date
            let closestDataPoint = stock.priceData[0];
            let minTimeDiff = Math.abs(new Date(closestDataPoint.timestamp).getTime() - targetDate.getTime());
            
            for (const dataPoint of stock.priceData) {
              const timeDiff = Math.abs(new Date(dataPoint.timestamp).getTime() - targetDate.getTime());
              if (timeDiff < minTimeDiff) {
                closestDataPoint = dataPoint;
                minTimeDiff = timeDiff;
              }
            }
            
            // Add additional entropy to percent change based on symbol to ensure uniqueness
            // Only do this for mock data to preserve real data integrity
            if (!stock.isRealData) {
              // Create a deterministic but unique variation based on symbol
              const symbolSeed = stock.symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) / 100;
              // Add a small variation to ensure each stock has slightly different percent changes
              // Scale by volatility based on sector
              let symbolVariation = symbolSeed % 2;
              if (stock.sector === 'Information Technology' || stock.sector === 'Consumer Discretionary') {
                symbolVariation *= 1.5; // More volatile sectors
              } else if (stock.sector === 'Utilities' || stock.sector === 'Consumer Staples') {
                symbolVariation *= 0.7; // Less volatile sectors
              }
              
              // Apply the variation to the close price and percent change
              closestDataPoint.close += (symbolVariation * (i + 1) / periods); // More variation in later periods
              
              if (closestDataPoint.percentChange !== undefined) {
                closestDataPoint.percentChange += (symbolVariation / 2); // Smaller variation for percent changes
              }
              
              if (closestDataPoint.cumulativePercentChange !== undefined) {
                closestDataPoint.cumulativePercentChange += (symbolVariation * i / 2); // Accumulate variations over time
              }
            }
            
            // Debug log every 25th stock to avoid console flood
            if (stockIndex % 25 === 0 || stock.symbol === 'AAPL' || stock.symbol === 'MSFT' || stock.symbol === 'AMZN') {
              const priceKey = `${closestDataPoint.close.toFixed(2)}`;
              debugPrices.add(priceKey);
              
              console.log(`Snapshot ${i}, Stock ${stock.symbol}: Found closest data point:`, {
                timestamp: closestDataPoint.timestamp,
                price: closestDataPoint.close.toFixed(2),
                uniqueObject: closestDataPoint !== stock.priceData[0], // Check if we found a unique object
                isRealData: stock.isRealData
              });
            }
            
            // Calculate percent change based on previous snapshot's close price
            let percentChange = 0;
            if (previousCloses[stock.symbol]) {
              percentChange = ((closestDataPoint.close - previousCloses[stock.symbol]) / previousCloses[stock.symbol]) * 100;
            } else {
              // For the first time period, we use either:
              // 1. The stored cumulative percent change if available (from mock data)
              // 2. The percent change calculated from previous data point
              if (closestDataPoint.cumulativePercentChange !== undefined) {
                percentChange = closestDataPoint.cumulativePercentChange;
              } else {
                const prevIndex = stock.priceData.findIndex((dp: { timestamp: string }) => dp.timestamp === closestDataPoint.timestamp) + 1;
                const prevDataPoint = prevIndex < stock.priceData.length ? stock.priceData[prevIndex] : null;
                
                percentChange = prevDataPoint 
                  ? ((closestDataPoint.close - prevDataPoint.close) / prevDataPoint.close) * 100
                  : 0;
              }
            }
            
            // Store this period's close price for the next period's calculation
            previousCloses[stock.symbol] = closestDataPoint.close;
            
            // Create more realistic price range - avoid all stocks having the same price
            // Reflect the actual market cap in price when using mocked data
            const marketCapAdjustment = stock.marketCap > 1000 ? 0.8 :
                                        stock.marketCap > 500 ? 0.5 :
                                        stock.marketCap > 200 ? 0.3 :
                                        stock.marketCap > 100 ? 0.1 : 0;
            
            // Update market cap based on performance (simple approximation)
            const marketCapMultiplier = 1 + (percentChange / 100);
            const marketCap = stock.marketCap * marketCapMultiplier * (1 + marketCapAdjustment);
            
            // Debug: Log the final calculated values for this stock
            if (stock.symbol === 'AAPL' || stock.symbol === 'MSFT' || stock.symbol === 'AMZN') {
              console.log(`Final values for ${stock.symbol} at snapshot ${i}:`, {
                close: closestDataPoint.close.toFixed(2),
                previousClose: previousCloses[stock.symbol]?.toFixed(2) || 'N/A',
                percentChange: percentChange.toFixed(2),
                rawDataPoint: {
                  timestamp: closestDataPoint.timestamp,
                  open: closestDataPoint.open,
                  close: closestDataPoint.close,
                  percentChange: closestDataPoint.percentChange
                }
              });
            }
            
            // Create a fresh object for each stock at each time period to ensure uniqueness
            snapshotStocks.push({
              symbol: stock.symbol,
              name: stock.name || stock.symbol,
              sector: stock.sector || 'Unknown',
              marketCap: stock.marketCap || 0,
              price: closestDataPoint.close,
              percentChange: percentChange,
              volume: closestDataPoint.volume || 0,
              timestamp: closestDataPoint.timestamp,
              isRealData: 'isRealData' in stock ? stock.isRealData : false,
              _timeIndex: i
            });
          });
          
          // Log first few stocks in each snapshot for debugging purposes
          if (i === 0 || i === periods - 1) {
            console.log(`Snapshot ${i} sample data:`, 
              snapshotStocks.slice(0, 3).map(s => ({
                symbol: s.symbol,
                price: s.price,
                percentChange: s.percentChange
              }))
            );
          }
          
          // Sort by market cap
          snapshotStocks.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));
          
          // Log statistics on price uniqueness
          const priceSet = new Set(snapshotStocks.map(s => s.price?.toFixed(2)));
          const percentChangeSet = new Set(snapshotStocks.map(s => s.percentChange?.toFixed(2)));
          const uniqueness = priceSet.size / snapshotStocks.length;
          
          console.log(`Snapshot ${i} statistics:`, {
            totalStocks: snapshotStocks.length,
            uniquePrices: priceSet.size,
            uniquenessRatio: uniqueness.toFixed(4),
            uniquePercent: (uniqueness * 100).toFixed(1) + '%',
            assessedUniqueness: uniqueness > 0.9 ? '✅ GOOD' : uniqueness > 0.3 ? '⚠️ MARGINAL' : '❌ POOR',
            uniquePercentChanges: percentChangeSet.size,
            realDataCount: snapshotStocks.filter(s => s.isRealData).length,
            mockDataCount: snapshotStocks.filter(s => !s.isRealData).length,
            sampleStocks: [
              {symbol: 'AAPL', ...snapshotStocks.find(s => s.symbol === 'AAPL')},
              {symbol: 'MSFT', ...snapshotStocks.find(s => s.symbol === 'MSFT')},
              {symbol: 'AMZN', ...snapshotStocks.find(s => s.symbol === 'AMZN')}
            ].filter(s => s.price !== undefined).map(s => ({
              symbol: s.symbol,
              price: s.price?.toFixed(2),
              percentChange: s.percentChange?.toFixed(2),
              _timeIndex: s._timeIndex,
              isRealData: s.isRealData
            }))
          });
          
          snapshots.push(snapshotStocks);
        }
        
        setData(snapshots);
        setCurrentTimeIndex(0);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching stock data:", error);
        setError("Failed to fetch stock data. Please try again later.");
        setLoading(false);
      }
    };

    fetchRealStockData();
  }, [selectedTimeframe]);

  const isInitialRender = useRef(true);
  // Use memoization to cache computed positions with optimized dependencies
  const { positionedData, globalPositionMap } = useMemo(() => {
    if (!data.length) return { positionedData: new Map<number, any[]>(), globalPositionMap: new Map<string, {x: number, y: number}>() };
    
    console.log("Computing positions for all time periods");
    
    // Create and position all data snapshots in advance but only show the current one
    const allSnapshotData = new Map<number, any[]>();
    
    // Keep a global map of positions to ensure continuity between frames
    // Use composite keys that include the time period to prevent data leakage between snapshots
    const positionMap = new Map<string, {x: number, y: number}>();
    
    // Setup margins and dimensions - Extract from ref width only when needed
    const clientWidth = svgRef.current?.clientWidth || 1500;
    const margin = { top: 80, right: 350, bottom: 140, left: 150 };
    const width = Math.max(clientWidth, 1500) - margin.left - margin.right;
    const height = 800 - margin.top - margin.bottom;

    // Create scales once 
    const xScale = d3.scalePoint()
      .domain(SP500_SECTORS)
      .range([0, width])
      .padding(0.9);

    const yScale = d3.scaleLinear()
      .domain([-20, 20])
      .range([height, 0]);

    // Loop through all time periods and calculate positions
    data.forEach((snapshotData, timeIndex) => {
      // Add a timeIndex to each stock for unique identification
      snapshotData.forEach(stock => {
        stock._timeIndex = timeIndex; // Add time index as a property for unique identification
      });

      // Size scale based on market cap for this snapshot
      const marketCapExtent = d3.extent(snapshotData, d => d.marketCap || 0) as [number, number];
      const size = d3.scaleSqrt()
        .domain(marketCapExtent)
        .range([3, 25]);
        
      // Deep clone the data to avoid modifying the original and ensure each snapshot has its own objects
      const clonedData = snapshotData.map(d => {
        // Create composite key using symbol and time index
        const compositeKey = `${timeIndex}-${d.symbol}`;
        // If we have a previous position for this symbol in this time period, use it as the starting point
        const existingPos = positionMap.get(compositeKey);
        
        // Create a totally fresh object for each stock in each time period
        return {
          ...JSON.parse(JSON.stringify(d)), // Deep clone to ensure complete separation
          // Initialize with existing position if available
          x: existingPos?.x,
          y: existingPos?.y
        };
      });
      
      // Set up a simulation for this snapshot with optimized forces
      const simulation = d3.forceSimulation(clonedData)
        // X-force: Pull towards sector column
        .force('x', d3.forceX<any>((d: any) => {
          return xScale((d as StockData).sector) || width / 2;
        }).strength(0.6)) // Reduced strength for better performance
        // Y-force: Based on percent change
        .force('y', d3.forceY<any>((d: any) => {
          return yScale((d as StockData).percentChange);
        }).strength(0.8)) // Reduced strength for better performance
        // Sector clustering force: Pull stocks from same sector together - simplified
        .force('cluster', alpha => {
          // Group points by sector
          const sectors = d3.group(clonedData, (d: any) => (d as StockData).sector);
          
          // For each point
          clonedData.forEach((d: any) => {
            const sector = (d as StockData).sector;
            // Get all other points in the same sector
            const sectorPoints = sectors.get(sector) || [];
            
            // Skip if there's only one point in the sector
            if (sectorPoints.length <= 1) return;
            
            // Find centroid of the sector points
            const cx = d3.mean(sectorPoints, p => p.x) || 0;
            const cy = d3.mean(sectorPoints, p => p.y) || 0;
            
            // Apply force towards centroid - optimized strength calculation
            const strength = 0.15 * alpha; // Reduced strength for better performance
            d.vx = d.vx || 0;
            d.vy = d.vy || 0;
            d.vx += (cx - d.x) * strength;
            d.vy += (cy - d.y) * strength;
          });
        })
        // Collision force: Prevent overlaps - simplified
        .force('collide', d3.forceCollide<any>((d: any) => {
          // Use visual radius for collision detection
          const radius = size((d as StockData).marketCap || 0);
          // Almost touching - just a tiny gap to prevent exact overlaps
          return radius + 0.5;
        }).strength(0.6).iterations(3)) // Reduced iterations for better performance
        .alphaDecay(0.01) // Faster decay for better performance
        .alpha(0.8);      // Lower initial alpha for faster convergence
      
      // Reduced simulation iterations for better performance (from 200 to 150)
      for (let i = 0; i < 150; i++) {
        simulation.tick();
      }
      
      // Store final positions in both time-specific map and a position map for animation continuity
      clonedData.forEach(d => {
        // Create composite key using symbol and time index for unique identification
        const compositeKey = `${timeIndex}-${d.symbol}`;
        positionMap.set(compositeKey, { x: d.x as number, y: d.y as number });
        
        // REMOVE THIS LINE - it's causing data leakage between time periods
        // Also store in global map for animation continuity, but tag with time index
        // positionMap.set(d.symbol, { x: d.x as number, y: d.y as number });
      });
      
      // Log sample data to verify uniqueness
      if (timeIndex === 0 || timeIndex === data.length - 1) {
        console.log(`Time period ${timeIndex} - Sample data after simulation:`, 
          clonedData.slice(0, 3).map(d => ({
            symbol: d.symbol,
            timeIndex: d._timeIndex,
            price: d.price,
            percentChange: d.percentChange,
            x: d.x,
            y: d.y
          }))
        );
      }
      
      // Store the final positions for this time period
      allSnapshotData.set(timeIndex, clonedData);
    });
    
    return { positionedData: allSnapshotData, globalPositionMap: positionMap };
  }, [data, svgRef.current?.clientWidth]); // Only recalculate when data or width changes

  // D3 visualization effect - Static elements only
  useEffect(() => {
    if (!data.length || !svgRef.current) return;
    
    console.log("Setting up static visualization elements");
    
    // Setup margins and dimensions
    const margin = { top: 80, right: 350, bottom: 140, left: 150 };
    const width = Math.max(svgRef.current.clientWidth, 1500) - margin.left - margin.right;
    const height = 800 - margin.top - margin.bottom;

    // Clear previous content only on initial setup
    d3.select(svgRef.current).selectAll('*').remove();
    
    // Create SVG container
    const svg = d3.select(svgRef.current)
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);
      
    // Create scales - these are static
    const xScale = d3.scalePoint()
      .domain(SP500_SECTORS)
      .range([0, width])
      .padding(0.9);

    const yScale = d3.scaleLinear()
      .domain([-20, 20])
      .range([height, 0]);

    // Create color scale based on sectors - static
    const sectorColorScale = d3.scaleOrdinal<string>()
      .domain(SP500_SECTORS)
      .range([
        '#ef4444', // Red
        '#f97316', // Orange
        '#f59e0b', // Amber
        '#84cc16', // Lime
        '#10b981', // Emerald
        '#14b8a6', // Teal
        '#06b6d4', // Cyan
        '#0ea5e9', // Light Blue
        '#3b82f6', // Blue
        '#6366f1', // Indigo
        '#8b5cf6'  // Violet
      ]);
    
    // Set up grid lines - static
    for (let i = -20; i <= 20; i += 5) {
      svg.append('line')
        .attr('class', 'grid-line')
        .attr('x1', 0)
        .attr('y1', yScale(i))
        .attr('x2', width)
        .attr('y2', yScale(i))
        .attr('stroke', '#e5e7eb')
        .attr('stroke-width', i === 0 ? 2 : 1)
        .attr('stroke-dasharray', i === 0 ? 'none' : '5,5');
      
      // Add percentage labels - static
      svg.append('text')
        .attr('class', 'y-axis-label')
        .attr('x', -10)
        .attr('y', yScale(i))
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .attr('fill', '#6b7280')
        .attr('font-size', '12px')
        .text(`${i}%`);
    }

    // Add x-axis (sectors) with more prominent labels - static
    svg.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale))
      .call(g => g.select('.domain').remove())
      .call(g => g.selectAll('.tick text')
        .attr('fill', '#4b5563')
        .attr('font-size', '14px')
        .attr('font-weight', 'bold')
        .style('text-anchor', 'end')
        .attr('transform', 'rotate(-45) translate(-10, 0)'));

    // Add vertical dividers between sectors - static
    SP500_SECTORS.forEach((sector, i) => {
      if (i > 0) {
        const prevSector = SP500_SECTORS[i-1];
        const midpoint = (xScale(prevSector)! + xScale(sector)!) / 2;
        
        svg.append('line')
          .attr('class', 'sector-divider')
          .attr('x1', midpoint)
          .attr('x2', midpoint)
          .attr('y1', 0)
          .attr('y2', height)
          .attr('stroke', '#e5e7eb')
          .attr('stroke-width', 1)
          .attr('stroke-dasharray', '3,3');
      }
    });
    
    // Add chart title (static part)
    svg.append('text')
      .attr('class', 'chart-title')
      .attr('x', width / 2)
      .attr('y', -50)
      .attr('text-anchor', 'middle')
      .attr('font-size', '18px')
      .attr('font-weight', 'bold')
      .text(`S&P 500 Performance by Sector (${selectedTimeframe.toUpperCase()})`);

    // Dynamic text elements containers
    svg.append('text')
      .attr('class', 'chart-date')
      .attr('x', 0)
      .attr('y', -30)
      .attr('fill', '#4b5563')
      .attr('font-size', '16px')
      .attr('font-weight', 'bold');

    svg.append('text')
      .attr('class', 'chart-avg')
      .attr('x', width / 2 + 100)
      .attr('y', -30)
      .attr('font-size', '16px')
      .attr('font-weight', 'bold');

    // Create container for circles - will be populated in dynamic effect
    svg.append('g').attr('class', 'circle-group');
    
    // Add legend for circle size (market cap) - static
    const sizeLegend = svg.append('g')
      .attr('class', 'size-legend')
      .attr('transform', `translate(${width + 80}, 20)`);

    sizeLegend.append('text')
      .attr('x', 0)
      .attr('y', 0)
      .attr('fill', '#4b5563')
      .attr('font-weight', 'bold')
      .text('Market Cap ($B)');

    // Get sample data for legend
    const currentPositionedData = positionedData.get(currentTimeIndex) || [];
    
    // Size scale based on market cap - recalculated in dynamic effect for actual data
    const marketCapExtent = d3.extent(currentPositionedData, d => d.marketCap || 0) as [number, number];
    const size = d3.scaleSqrt()
      .domain(marketCapExtent)
      .range([3, 25]);

    const sizeLegendData = [
      { value: 2000, label: '2,000 Bn' },
      { value: 1000, label: '1,000 Bn' },
      { value: 500, label: '500 Bn' },
      { value: 100, label: '100 Bn' }
    ];

    // Calculate dynamic spacing based on circle size
    let yOffset = 40; // Starting offset from title
    
    sizeLegendData.forEach((item, i) => {
      const circleRadius = size(item.value);
      
      // Position this row using the accumulated offset
      const legendRow = sizeLegend.append('g')
        .attr('transform', `translate(0, ${yOffset})`);
      
      legendRow.append('circle')
        .attr('r', circleRadius)
        .attr('fill', '#6366f1')
        .attr('opacity', 0.6)
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 1);
      
      legendRow.append('text')
        .attr('x', Math.max(60, circleRadius + 15))
        .attr('y', 0)
        .attr('dominant-baseline', 'middle')
        .attr('fill', '#4b5563')
        .style('font-size', '12px')
        .text(item.label);
      
      // Calculate offset for next item based on circle size
      if (i === 0) {
        yOffset += circleRadius * 3;
      } else {
        yOffset += Math.max(circleRadius * 2.5, 40);
      }
    });

    // Create controls containers
    svg.append('g')
      .attr('transform', `translate(10, ${height + 70})`)
      .attr('class', 'timeframe-selector');
      
    // Time slider and play button
    svg.append('g')
      .attr('transform', `translate(${width/2}, 760)`)
      .attr('class', 'time-controls');
    
    // Setup slider track (static part)
    const sliderWidth = 200;
    svg.select('.time-controls')
      .append('line')
      .attr('class', 'slider-track')
      .attr('x1', -sliderWidth/2)
      .attr('x2', sliderWidth/2)
      .attr('y1', 0)
      .attr('y2', 0)
      .attr('stroke', '#d1d5db')
      .attr('stroke-width', 4)
      .attr('stroke-linecap', 'round');
      
    // Slider handle (will be updated in the dynamic effect)
    svg.select('.time-controls')
      .append('circle')
      .attr('class', 'slider-handle')
      .attr('r', 8)
      .attr('cy', 0)
      .attr('fill', '#6366f1')
      .attr('cursor', 'pointer');
    
    // Play button container
    svg.select('.time-controls')
      .append('g')
      .attr('transform', 'translate(120, 0)')
      .attr('cursor', 'pointer')
      .attr('class', 'play-button');
    
    // Create tooltip div if it doesn't exist
    if (d3.select('body').selectAll('div.chart-tooltip').empty()) {
      d3.select('body')
        .append('div')
        .attr('class', 'chart-tooltip')
        .style('opacity', 0)
        .style('position', 'absolute')
        .style('background-color', 'white')
        .style('border', '1px solid #ddd')
        .style('border-radius', '4px')
        .style('padding', '10px')
        .style('box-shadow', '0 4px 6px -1px rgba(0, 0, 0, 0.1)')
        .style('pointer-events', 'none')
        .style('font-size', '12px')
        .style('z-index', '100');
    }
    
    // Initialize the drag behavior for the slider
    const sliderHandle = svg.select('.slider-handle');
    const sliderScale = d3.scaleLinear()
      .domain([0, data.length - 1])
      .range([0, sliderWidth])
      .clamp(true);
    
    // Use any type to bypass TypeScript's strict checking for d3.drag
    (sliderHandle as any)
      .call(d3.drag()
        .on('drag', (event: any) => {
          const x = Math.max(-sliderWidth/2, Math.min(sliderWidth/2, event.x));
          const index = Math.round(sliderScale.invert(x + sliderWidth/2));
          
          if (index !== currentTimeIndex) {
            setCurrentTimeIndex(index);
            // If dragging, pause playback
            if (isPlaying) setIsPlaying(false);
          }
          
          d3.select(event.sourceEvent.currentTarget)
            .attr('cx', x);
        }));
    
  }, [data.length, selectedTimeframe]); // Only depends on data.length and selectedTimeframe - not currentTimeIndex!

  // D3 visualization effect - Dynamic elements only
  useEffect(() => {
    if (!data.length || !svgRef.current) return;
    
    const currentSnapshotData = data[currentTimeIndex] || [];
    if (!currentSnapshotData.length) return;

    console.log("Updating dynamic elements for time index:", currentTimeIndex);

    // Get the data with pre-calculated positions for current time index
    const currentPositionedData = positionedData.get(currentTimeIndex) || [];
    
    // Setup margins and dimensions - reuse values from static setup
    const margin = { top: 80, right: 350, bottom: 140, left: 150 };
    const width = Math.max(svgRef.current.clientWidth, 1500) - margin.left - margin.right;
    const height = 800 - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current).select('g');
    
    // Create color scale based on sectors - reuse from static setup
    const sectorColorScale = d3.scaleOrdinal<string>()
      .domain(SP500_SECTORS)
      .range([
        '#ef4444', // Red
        '#f97316', // Orange
        '#f59e0b', // Amber
        '#84cc16', // Lime
        '#10b981', // Emerald
        '#14b8a6', // Teal
        '#06b6d4', // Cyan
        '#0ea5e9', // Light Blue
        '#3b82f6', // Blue
        '#6366f1', // Indigo
        '#8b5cf6'  // Violet
      ]);

    // Update dynamic text elements - batch these updates
    // Update date display
    svg.select('.chart-date')
      .text(`${currentDate} · S&P 500: ${currentPositionedData.length} stocks`);

    const avgChange = d3.mean(currentPositionedData, d => d.percentChange) || 0;
    svg.select('.chart-avg')
      .attr('fill', avgChange >= 0 ? '#22c55e' : '#ef4444')
      .text(`Change ${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(1)}%`);

    // Size scale based on market cap
    const marketCapExtent = d3.extent(currentPositionedData, d => d.marketCap || 0) as [number, number];
    const size = d3.scaleSqrt()
      .domain(marketCapExtent)
      .range([3, 25]);

    const circleGroup = svg.select('.circle-group');
    
    // Improved key function for data binding - using typed parameter and composite key
    // Using the data's own _timeIndex instead of the global currentTimeIndex
    const keyFunction = (d: StockData) => `${d._timeIndex}-${d.symbol}`;
    
    // Add logging to verify data binding before visualization
    console.log(`Rendering time period ${currentTimeIndex} with ${currentPositionedData.length} stocks`);
    const sampleCount = Math.min(3, currentPositionedData.length);
    console.log("Sample data for visualization:", currentPositionedData.slice(0, sampleCount).map(d => ({
      symbol: d.symbol,
      timeIndex: d._timeIndex,
      price: d.price?.toFixed(2),
      percentChange: d.percentChange?.toFixed(2),
      x: d.x,
      y: d.y
    })));
    
    // Data join for circles with improved composite key function
    const circles = circleGroup.selectAll<SVGCircleElement, StockData>('circle.stock-circle')
      .data(currentPositionedData, keyFunction);
    
    // Log how many entering/updating/exiting circles we have
    console.log(`Circles update: ${circles.size()} existing, ${circles.enter().size()} entering, ${circles.exit().size()} exiting`);
    
    // ENTER: Create new circles for new data points
    const circlesEnter = circles.enter()
      .append('circle')
      .attr('class', 'stock-circle')
      .attr('fill', d => sectorColorScale(d.sector))
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 1)
      .attr('opacity', 0) // Keep only this opacity setting (start hidden)
      // Start from previous position if available or center if not
      .attr('cx', d => {
        const compositeKey = `${d._timeIndex}-${d.symbol}`;
        const prev = globalPositionMap.get(compositeKey);
        return prev ? Number(prev.x) : width / 2;
      })
      .attr('cy', d => {
        const compositeKey = `${d._timeIndex}-${d.symbol}`;
        const prev = globalPositionMap.get(compositeKey);
        return prev ? Number(prev.y) : height / 2;
      })
      .attr('r', d => size(d.marketCap || 0));
    
    // Batch transition for all entering circles
    circlesEnter
      .transition()
      .duration(1800)
      .ease(d3.easeCubicInOut)
      .attr('cx', d => d.x || 0)
      .attr('cy', d => d.y || 0)
      .attr('opacity', 0.8);

    // UPDATE: Transition existing circles to new positions - batch update
    circles
      .transition()
      .duration(1800)
      .ease(d3.easeCubicInOut)
      .attr('cx', d => d.x || 0)
      .attr('cy', d => d.y || 0)
      .attr('r', d => size(d.marketCap || 0))
      .attr('fill', d => sectorColorScale(d.sector))
      .attr('opacity', 0.8); // Ensure opacity is maintained during updates
    
    // EXIT: Remove circles that are no longer in the data - batch remove
    circles.exit()
      .transition()
      .duration(800)
      .ease(d3.easeCubicInOut)
      .attr('opacity', 0)
      .remove();
    
    // Handle labels for large companies 
    const largeCompanies = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'GOOG', 'NVDA', 'JPM', 'JNJ', 'XOM', 'WMT'];
    
    // Efficient filter before data binding to reduce processing
    const largeCompanyData = currentPositionedData.filter(d => largeCompanies.includes(d.symbol));
    
    // Log sample large company data to verify uniqueness
    console.log("Large company data for time period", currentTimeIndex, ":", 
      largeCompanyData.slice(0, 3).map(d => ({
        symbol: d.symbol, 
        timeIndex: d._timeIndex,
        x: d.x?.toFixed(2),
        y: d.y?.toFixed(2),
        price: d.price?.toFixed(2),
        percentChange: d.percentChange?.toFixed(2)
      }))
    );
    
    // Better approach: Create stock groups that contain both circles and labels
    const stockGroupContainer = svg.select('.circle-group');
    
    // Data join for stock groups with improved key function
    const stockGroups = stockGroupContainer.selectAll<SVGGElement, StockData>('g.stock-item')
      .data(largeCompanyData, keyFunction);
    
    // Enter new groups - batch create
    const stockGroupsEnter = stockGroups.enter()
      .append('g')
      .attr('class', 'stock-item')
      .attr('transform', d => `translate(${d.x || 0}, ${d.y || 0})`);
    
    // Add labels to the new groups - batch create
    stockGroupsEnter.append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('font-weight', 'bold')
      .attr('font-size', '10px')
      .attr('fill', 'white')
      .text(d => d.symbol)
      .attr('opacity', 0);
    
    // Batch transition for all entering labels
    stockGroupsEnter.selectAll('text')
      .transition()
      .duration(1800)
      .ease(d3.easeCubicInOut)
      .attr('opacity', 1);
    
    // Update existing groups - batch update
    stockGroups
      .transition()
      .duration(1800)
      .ease(d3.easeCubicInOut)
      .attr('transform', d => `translate(${d.x || 0}, ${d.y || 0})`);
    
    // Exit old groups - batch remove
    stockGroups.exit()
      .transition()
      .duration(800)
      .ease(d3.easeCubicInOut)
      .attr('opacity', 0)
      .remove();

    // Update tooltip behavior - batch setup for all circles
    const tooltip = d3.select('body').select('div.chart-tooltip');
    
    // Handle all event listeners in a single selection
    const allCircles = circleGroup.selectAll('circle.stock-circle');
    
    // Remove any existing event listeners
    allCircles
      .on('mouseover', null)
      .on('mouseout', null)
      .on('click', null);
    
    // Add interactivity for tooltips - ensure we're accessing the bound data correctly
    allCircles
      .on('mouseover', function(event, d) {
        // Ensure d is the StockData object with percentChange
        const stockData = d as StockData;
        
        d3.select(this)
          .transition()
          .duration(200)
          .attr('stroke-width', 2)
          .attr('opacity', 1);

        tooltip.transition()
          .duration(200)
          .style('opacity', .9);
        
        tooltip.html(`
          <div>
            <strong>${stockData.symbol}: ${stockData.name || 'Unknown'}</strong>
            <p><strong>Time Period:</strong> ${stockData._timeIndex !== undefined ? stockData._timeIndex : currentTimeIndex}</p>
            <p><strong>Date:</strong> ${stockData.timestamp ? new Date(stockData.timestamp).toLocaleDateString() : currentDate}</p>
            <p><strong>Sector:</strong> <span style="color:${sectorColorScale(stockData.sector)}">${stockData.sector}</span></p>
            <p><strong>Market Cap:</strong> $${(stockData.marketCap || 0).toLocaleString()} billion</p>
            <p><strong>Change:</strong> <span style="color:${stockData.percentChange >= 0 ? '#22c55e' : '#ef4444'}">${stockData.percentChange >= 0 ? '+' : ''}${stockData.percentChange.toFixed(2)}%</span></p>
            <p><strong>Price:</strong> $${stockData.price ? stockData.price.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : 'N/A'}</p>
            ${stockData.isRealData 
              ? '<p><small style="color:#10b981; font-weight:bold;">✓ Real data</small></p>' 
              : '<p><small style="color:#ef4444; font-weight:bold;">⚠️ SIMULATED DATA</small></p>'}
          </div>
        `)
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 28) + 'px');
          
        // Debug: log the stock data to verify uniqueness and correctness
        console.log(`Tooltip for ${stockData.symbol} at time ${stockData._timeIndex || currentTimeIndex}:`, {
          symbol: stockData.symbol,
          timeIndex: stockData._timeIndex || currentTimeIndex,
          price: stockData.price?.toFixed(2),
          percentChange: stockData.percentChange?.toFixed(2),
          isUniqueBoundData: true // Debug flag to verify we're using the correct bound data
        });
      })
      .on('mouseout', function() {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('stroke-width', 1)
          .attr('opacity', 0.8); // Return to standard opacity on mouseout
          
        tooltip.transition()
          .duration(500)
          .style('opacity', 0);
      })
      .on('click', function(event, d) {
        // When a circle is clicked, call the onStockSelect callback with the stock symbol
        const stockData = d as StockData;
        if (onStockSelect) {
          console.log(`Selected stock: ${stockData.symbol}`);
          onStockSelect(stockData.symbol);
          
          // Highlight the selected stock
          circleGroup.selectAll('circle.stock-circle')
            .attr('stroke', '#ffffff')
            .attr('stroke-width', 1);
            
          d3.select(this)
            .attr('stroke', '#f59e0b')
            .attr('stroke-width', 3);
        }
      })
      .style('cursor', 'pointer'); // Change cursor to indicate clickable

    // Update control buttons
    updateTimeframeButtons();
    updatePlayButton();
    updateSlider();
    
    // Function to update timeframe buttons
    function updateTimeframeButtons() {
      const timeframeSelector = svg.select('.timeframe-selector');
      timeframeSelector.selectAll('*').remove();
      
      const timeframes = [
        { id: '5d', label: '5D' },
        { id: '1m', label: '1M' },
        { id: '3m', label: '3M' },
        { id: '6m', label: '6M' },
        { id: '1y', label: '1Y' },
        { id: 'ytd', label: 'YTD' }
      ];
      
      // Create time frame buttons
      timeframes.forEach((tf, i) => {
        const button = timeframeSelector.append('g')
          .attr('transform', `translate(${i * 50}, 110)`)
          .attr('cursor', 'pointer')
          .on('click', () => {
            setSelectedTimeframe(tf.id as any);
            setIsPlaying(false);
          });
        
        const isActive = selectedTimeframe === tf.id;
        
        const buttonBg = button.append('rect')
          .attr('x', -20)
          .attr('y', -15)
          .attr('width', 40)
          .attr('height', 30)
          .attr('rx', 5)
          .attr('fill', isActive ? '#6366f1' : '#f3f4f6')
          .attr('stroke', '#9ca3af');
        
        button.append('text')
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('fill', isActive ? 'white' : '#4b5563')
          .attr('font-size', '12px')
          .attr('font-weight', isActive ? 'bold' : 'normal')
          .text(tf.label);
          
        // Add hover and active effects
        button
          .on('mouseover', function() {
            if (!isActive) {
              buttonBg.attr('fill', '#e5e7eb');
            }
          })
          .on('mouseout', function() {
            if (!isActive) {
              buttonBg.attr('fill', '#f3f4f6');
            }
          })
          .on('mousedown', function() {
            buttonBg.attr('fill', isActive ? '#4f46e5' : '#d1d5db');
          })
          .on('mouseup', function() {
            buttonBg.attr('fill', isActive ? '#6366f1' : '#e5e7eb');
          });
      });
    }
    
    // Function to update play/pause button
    function updatePlayButton() {
      const playButton = svg.select('.play-button');
      playButton.selectAll('*').remove();
      
      // Add click handler with current state reference
      playButton.on('click', () => {
        const newPlayState = !isPlaying;
        console.log("Play button clicked, new state:", newPlayState);
        
        // When starting playback, immediately advance to first frame for instant feedback
        if (!isPlaying && data.length > 1) {
          setTimeout(() => {
            console.log("Immediately advancing to first frame for instant feedback");
            setCurrentTimeIndex(prev => {
              if (prev === data.length - 1) return 0;
              return prev + 1;
            });
          }, 50);
        }
        
        setIsPlaying(newPlayState);
      });
      
      const playButtonBg = playButton.append('circle')
        .attr('r', 15)
        .attr('fill', '#f3f4f6')
        .attr('stroke', '#9ca3af');
      
      // Add hover and active effects to play button
      playButton
        .on('mouseover', function() {
          playButtonBg.attr('fill', '#e5e7eb');
        })
        .on('mouseout', function() {
          playButtonBg.attr('fill', '#f3f4f6');
        })
        .on('mousedown', function() {
          playButtonBg.attr('fill', '#d1d5db');
        })
        .on('mouseup', function() {
          playButtonBg.attr('fill', '#e5e7eb');
        });
        
      if (isPlaying) {
        // Pause icon
        playButton.append('rect')
          .attr('class', 'pause-icon')
          .attr('x', -5)
          .attr('y', -7)
          .attr('width', 4)
          .attr('height', 14)
          .attr('fill', '#4b5563');
        
        playButton.append('rect')
          .attr('class', 'pause-icon')
          .attr('x', 1)
          .attr('y', -7)
          .attr('width', 4)
          .attr('height', 14)
          .attr('fill', '#4b5563');
      } else {
        // Play icon
        playButton.append('path')
          .attr('class', 'play-icon')
          .attr('d', 'M-4,-7 L-4,7 L8,0 Z')
          .attr('fill', '#4b5563');
      }
    }
    
    // Function to update slider position
    function updateSlider() {
      const sliderWidth = 200;
      const sliderScale = d3.scaleLinear()
        .domain([0, data.length - 1])
        .range([0, sliderWidth])
        .clamp(true);
        
      // Update slider handle position
      svg.select('.slider-handle')
        .transition()
        .duration(300)
        .attr('cx', sliderScale(currentTimeIndex) - sliderWidth/2);
    }
    
  }, [currentTimeIndex, currentDate, isPlaying, selectedTimeframe, positionedData, globalPositionMap, data.length]);

  // Only keep the auto-play functionality in the time controls effect
  useEffect(() => {
    if (!data.length) return;
    
    // Update current date from the data
    if (data[currentTimeIndex]?.[0]?.timestamp) {
      const date = new Date(data[currentTimeIndex][0].timestamp);
      setCurrentDate(date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      }));
    }
    
    // Use requestAnimationFrame for smoother animation instead of setInterval
    let frameId: number | null = null;
    let lastFrameTime = 0;
    const frameDuration = 2500; // 2.5 seconds between frames
    
    const updateFrame = (timestamp: number) => {
      if (!lastFrameTime) lastFrameTime = timestamp;
      
      const elapsed = timestamp - lastFrameTime;
      
      if (elapsed >= frameDuration) {
        // Time to update the frame
        console.log("Advancing to next frame with requestAnimationFrame");
        setCurrentTimeIndex((prev) => {
          const next = prev + 1;
          // When reaching the end, loop back to beginning
          if (next >= data.length) {
            console.log("Reached end of data, returning to start");
            return 0;
          }
          return next;
        });
        
        // Ensure circles maintain their visibility during animation
        if (svgRef.current) {
          // Select all circles and ensure they maintain proper opacity
          d3.select(svgRef.current)
            .selectAll('circle.stock-circle')
            .attr('opacity', 0.8);
            
          console.log("Animation frame: ensuring circle visibility is maintained");
        }
        
        // Reset the time counter
        lastFrameTime = timestamp;
      }
      
      // Continue the animation loop
      if (isPlaying) {
        frameId = requestAnimationFrame(updateFrame);
      }
    };
    
    // Handle auto-play
    if (isPlaying) {
      console.log("Starting animation with requestAnimationFrame");
      frameId = requestAnimationFrame(updateFrame);
    }
    
    // Cleanup on unmount or when dependencies change
    return () => {
      if (frameId !== null) {
        console.log("Cancelling animation frame");
        cancelAnimationFrame(frameId);
      }
    };
  }, [data.length, isPlaying, data, currentTimeIndex]);

  // Update the chart when currentTimeIndex changes - handle separately from animation logic
  useEffect(() => {
    if (!data.length || !svgRef.current) return;
    
    // Update date display
    if (data[currentTimeIndex]?.[0]?.timestamp) {
      const date = new Date(data[currentTimeIndex][0].timestamp);
      setCurrentDate(date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      }));
    }
    
  }, [currentTimeIndex, data]);

  // Update the onStockSelect handler to include price information
  const handleStockSelect = (d: StockData) => {
    console.log(`Selected stock: ${d.symbol}`);
    onStockSelect(d.symbol);
    onPriceUpdate(
      d.price || 0,
      d.percentChange || 0,
      d.volume || 0
    );
  };

  if (loading) {
    return <div className="h-[900px] flex items-center justify-center">Loading S&P 500 data...</div>;
  }

  if (error) {
    return <div className="h-[900px] flex items-center justify-center text-red-500">{error}</div>;
  }

  return (
    <div className="h-[900px] relative bg-white">
      <svg ref={svgRef} className="w-full h-full"></svg>
    </div>
  );
} 