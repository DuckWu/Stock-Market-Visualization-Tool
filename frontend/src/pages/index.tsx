'use client';

import { useState } from 'react';
import { StockSwarmPlot } from '@/components/StockSwarmPlot';
import { PriceChart } from '@/components/PriceChart';
import { VolumeChart } from '@/components/VolumeChart';
import { StockAnalysis } from '@/components/StockAnalysis';

// Define styles directly to ensure they're applied
const styles = {
  main: {
    minHeight: '100vh',
    padding: '16px',
    backgroundColor: '#f1f5f9',
  },
  container: {
    maxWidth: '1600px',
    margin: '0 auto',
  },
  header: {
    fontSize: '28px',
    fontWeight: 'bold',
    marginBottom: '24px',
    color: '#1e293b',
    borderBottom: '1px solid #e2e8f0',
    paddingBottom: '12px',
  },
  chartContainer: {
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    padding: '16px',
    border: '1px solid #e2e8f0',
    marginBottom: '24px',
  },
  swarmChartArea: {
    height: '950px', 
    width: '100%',
  },
  chartsRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '24px',
    marginBottom: '24px',
  },
  chartBox: {
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    padding: '16px',
    border: '1px solid #e2e8f0',
    height: '500px',
    display: 'flex',
    flexDirection: 'column' as 'column',
  },
  chartTitle: {
    fontSize: '18px',
    fontWeight: '600',
    marginBottom: '12px',
    color: '#1e293b',
  },
  chartHighlight: {
    color: '#2563eb',
  },
  chartArea: {
    flexGrow: 1,
  },
  analysisContainer: {
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    padding: '16px',
    border: '1px solid #e2e8f0',
  },
};

export default function Home() {
  const [selectedStock, setSelectedStock] = useState<string>('SPY');
  const [selectedTimeframe, setSelectedTimeframe] = useState<'1m'>('1m');
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [currentVolume, setCurrentVolume] = useState<number>(0);

  const handleStockSelect = (symbol: string) => {
    console.log(`Selected stock: ${symbol}`);
    setSelectedStock(symbol);
  };

  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <h1 style={styles.header}>
          Stock Market Dashboard
        </h1>
        
        <div>
          {/* Market Overview - Full Width */}
          <div style={styles.chartContainer}>
            <h2 style={styles.chartTitle}>
              Market Overview: <span style={styles.chartHighlight}>{selectedStock !== 'SPY' ? selectedStock : 'S&P 500'}</span>
            </h2>
            <div style={styles.swarmChartArea}>
              <StockSwarmPlot 
                symbol={selectedStock} 
                timeframe="daily" 
                onStockSelect={handleStockSelect}
                onPriceUpdate={(price, change, volume) => {
                  setCurrentPrice(price);
                  setPriceChange(change);
                  setCurrentVolume(volume);
                }}
              />
            </div>
          </div>

          {/* Price and Volume Charts - Side by Side */}
          <div style={styles.chartsRow}>
            <div style={styles.chartBox}>
              <h2 style={styles.chartTitle}>
                Price Chart: <span style={styles.chartHighlight}>{selectedStock}</span>
              </h2>
              <div style={styles.chartArea}>
                <PriceChart symbol={selectedStock} timeframe={selectedTimeframe} />
              </div>
            </div>

            <div style={styles.chartBox}>
              <h2 style={styles.chartTitle}>
                Volume Analysis: <span style={styles.chartHighlight}>{selectedStock}</span>
              </h2>
              <div style={styles.chartArea}>
                <VolumeChart symbol={selectedStock} timeframe={selectedTimeframe} />
              </div>
            </div>
          </div>

          {/* AI Analysis Section */}
          <div style={styles.analysisContainer}>
            <StockAnalysis
              symbol={selectedStock}
              price={currentPrice}
              change={priceChange}
              volume={currentVolume}
            />
          </div>
        </div>
      </div>
    </main>
  );
} 